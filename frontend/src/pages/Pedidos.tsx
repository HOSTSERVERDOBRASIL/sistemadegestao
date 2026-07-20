import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Table from '../components/Table'
import Badge from '../components/Badge'
import Pagination from '../components/Pagination'
import Modal from '../components/Modal'
import {
  pedidos as api, clientes as clientesApi, produtos as produtosApi,
  contratos as contratosApi, exportar, cupons as cuponsApi,
  parceiros as parceirosApi, notasEmpenho as notasEmpenhoApi,
  pedidosSSL as sslApi,
} from '../api'
import type {
  Pedido, PedidoPayload, Cliente, Produto, Contrato, OrdemFornecimento,
  EtapaOperacional, VinculoTipo, ValidacaoCupom, Parceiro, NotaEmpenho, PedidoSSL,
} from '../types'
import { required, selectRequired, hasErrors } from '../utils/validate'
import styles from './Page.module.css'

// ─── helpers ────────────────────────────────────────────────────────────────
const ETAPAS: EtapaOperacional[] = ['Pedido', 'Pagamento', 'Validacao', 'Preparacao', 'Processamento', 'Entrega', 'Conclusao']
const VINCULOS: VinculoTipo[] = ['Contrato', 'EmpenhoSF', 'CompraDireta', 'Revenda']
const PRAZO_OPTIONS = [1, 2, 3, 4, 5] as const
const DCV_OPTIONS = ['HTTP-01', 'DNS-01', 'Email'] as const

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR')
}

function isVencendoEm30(d?: string) {
  if (!d) return false
  const diff = (new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  return diff >= 0 && diff <= 30
}

function getNomeCliente(v: PedidoSSL['clienteId']): string {
  if (typeof v === 'object' && v !== null) return v.nome
  return v ?? '—'
}

type TipoBadge = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple'

function tipoBadgeVariant(tipo: PedidoSSL['tipo']): TipoBadge {
  switch (tipo) {
    case 'DV':            return 'info'
    case 'OV':            return 'warning'
    case 'EV':
    case 'EV-MultiDominio': return 'success'
    case 'Wildcard':      return 'purple'
    case 'MultiDominio':  return 'info'
    default:              return 'default'
  }
}

function sslStatusVariant(s: string): TipoBadge {
  switch (s) {
    case 'Emitido':        return 'success'
    case 'Cancelado':      return 'danger'
    case 'Aguardando DCV':
    case 'Em Validacao':   return 'warning'
    default:               return 'default'
  }
}

// ─── aba Operacional ────────────────────────────────────────────────────────
function blankForm(): PedidoPayload {
  return {
    numero: '', clienteId: '', produtoId: '', valorTotal: 0, valorTabela: 0,
    itens: [], vinculo: { tipo: 'CompraDireta' }, observacoes: '',
  }
}
type Errors = Partial<Record<'numero' | 'clienteId' | 'itens' | 'contratoId' | 'ordemFornecimentoId' | 'empenho' | 'parceiroId', string>>
function validate(f: PedidoPayload): Errors {
  return {
    numero: required(f.numero, 'Número do Pedido'),
    clienteId: selectRequired(f.clienteId, 'Cliente'),
    itens: f.itens?.length ? '' : 'Adicione ao menos um item',
  }
}

type PedidoStatus = 'Rascunho' | 'Aprovado' | 'Em processo' | 'Faturado' | 'Concluido' | 'Cancelado'

// ─── componente principal ───────────────────────────────────────────────────
export default function Pedidos({ statusFixo }: { statusFixo?: PedidoStatus }) {
  const navigate = useNavigate()
  const [params, setSearchParams] = useSearchParams()
  const abaParam = params.get('aba')
  const [aba, setAba] = useState<'servicos' | 'internacional' | 'icp'>(
    abaParam === 'internacional' ? 'internacional' : abaParam === 'icp' ? 'icp' : 'servicos'
  )

  function trocarAba(a: 'servicos' | 'internacional' | 'icp') {
    setAba(a)
    setSearchParams(a !== 'servicos' ? { aba: a } : {}, { replace: true })
  }

  // ── estado aba operacional ─────────────────────────────────────────────────
  const [opPage, setOpPage] = useState(1)
  const [opTotal, setOpTotal] = useState(0)
  const [opRows, setOpRows] = useState<Pedido[]>([])
  const [opLoading, setOpLoading] = useState(true)
  const [opBusca, setOpBusca] = useState('')
  const [opFiltroStatus, setOpFiltroStatus] = useState<string[]>(statusFixo ? [statusFixo] : [])
  const [opFiltroEtapa, setOpFiltroEtapa] = useState<string[]>([])
  const [opFiltroVinculo, setOpFiltroVinculo] = useState<string[]>([])
  const [opFiltroNF, setOpFiltroNF] = useState('')
  const [showOpModal, setShowOpModal] = useState(false)
  const [opForm, setOpForm] = useState<PedidoPayload>(blankForm)
  const [opErrors, setOpErrors] = useState<Errors>({})
  const [opSaving, setOpSaving] = useState(false)
  const [opError, setOpError] = useState('')
  const [clientesList, setClientesList] = useState<Cliente[]>([])
  const [produtosList, setProdutosList] = useState<Produto[]>([])
  const [contratosList, setContratosList] = useState<Contrato[]>([])
  const [ordensList, setOrdensList] = useState<OrdemFornecimento[]>([])
  const [parceirosList, setParceirosList] = useState<Parceiro[]>([])
  const [notasEmpenhoList, setNotasEmpenhoList] = useState<NotaEmpenho[]>([])
  const [itemProdutoId, setItemProdutoId] = useState('')
  const [itemQuantidade, setItemQuantidade] = useState(1)
  const [itemPreco, setItemPreco] = useState(0)
  const [exportando, setExportando] = useState(false)
  const [cupomCodigo, setCupomCodigo] = useState('')
  const [cupomResult, setCupomResult] = useState<ValidacaoCupom | null>(null)
  const [validandoCupom, setValidandoCupom] = useState(false)

  const contratoSelecionado = contratosList.find(c => c._id === opForm.contratoId)

  function toggle(arr: string[], val: string): string[] {
    if (!val) return []
    return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
  }

  const loadOp = useCallback(() => {
    setOpLoading(true)
    api.list({
      page: opPage, busca: opBusca,
      status: opFiltroStatus.length > 0 ? opFiltroStatus.join(',') : undefined,
      etapa: opFiltroEtapa.length > 0 ? opFiltroEtapa.join(',') : undefined,
      vinculoTipo: opFiltroVinculo.length > 0 ? opFiltroVinculo.join(',') : undefined,
      nfEmitida: opFiltroNF || undefined,
    })
      .then(res => { setOpRows(res.data); setOpTotal(res.total) })
      .finally(() => setOpLoading(false))
  }, [opPage, opBusca, opFiltroStatus, opFiltroEtapa, opFiltroVinculo, opFiltroNF])

  useEffect(() => { if (aba === 'servicos') loadOp() }, [aba, loadOp])

  useEffect(() => {
    if (!showOpModal) return
    Promise.all([
      clientesApi.list({ limit: 100, ativo: 'true' }),
      produtosApi.list({ limit: 100, ativo: 'true' }),
      parceirosApi.list({ limit: 100, ativo: 'true' }),
    ]).then(([clientes, produtos, parceiros]) => {
      setClientesList(clientes.data)
      setProdutosList(produtos.data)
      setParceirosList(parceiros.data)
    })
  }, [showOpModal])

  useEffect(() => {
    if (!showOpModal || !opForm.clienteId) { setContratosList([]); return }
    contratosApi.list({ clienteId: opForm.clienteId, ativo: 'true', limit: 100 }).then(r => setContratosList(r.data))
  }, [showOpModal, opForm.clienteId])

  useEffect(() => {
    if (!showOpModal || !opForm.clienteId) { setNotasEmpenhoList([]); return }
    notasEmpenhoApi.list({ clienteId: opForm.clienteId, status: 'Aberto', limit: 100 })
      .then(r => setNotasEmpenhoList(r.data)).catch(() => setNotasEmpenhoList([]))
  }, [showOpModal, opForm.clienteId])

  useEffect(() => {
    if (contratoSelecionado?.modalidade !== 'Por Ordem de Fornecimento') {
      setOrdensList([])
      if (opForm.ordemFornecimentoId) setOpForm(f => ({ ...f, ordemFornecimentoId: undefined }))
      return
    }
    contratosApi.ordens(contratoSelecionado._id).then(ordens => setOrdensList(ordens.filter(o => o.status !== 'Fechada')))
  }, [contratoSelecionado?._id, contratoSelecionado?.modalidade, opForm.ordemFornecimentoId])

  const totais = useMemo(() => {
    const itens = opForm.itens ?? []
    return {
      total: itens.reduce((s, i) => s + i.quantidade * i.precoUnitario, 0),
      tabela: itens.reduce((s, i) => s + i.quantidade * (i.valorTabelaUnitario ?? i.precoUnitario), 0),
    }
  }, [opForm.itens])

  function updateOp(patch: Partial<PedidoPayload>) { setOpForm(f => ({ ...f, ...patch })) }

  function selecionarProduto(id: string) {
    setItemProdutoId(id)
    setItemPreco(produtosList.find(p => p._id === id)?.preco ?? 0)
  }

  function adicionarItem() {
    const produto = produtosList.find(p => p._id === itemProdutoId)
    if (!produto || itemQuantidade < 1 || itemPreco < 0) {
      setOpErrors(e => ({ ...e, itens: 'Selecione produto, quantidade e preço válidos' })); return
    }
    const itens = [...(opForm.itens ?? []), {
      produtoId: produto._id, quantidade: itemQuantidade,
      precoUnitario: itemPreco, valorTabelaUnitario: produto.precoTabela ?? produto.preco,
    }]
    updateOp({
      itens, produtoId: itens[0].produtoId,
      valorTotal: itens.reduce((s, i) => s + i.quantidade * i.precoUnitario, 0),
      valorTabela: itens.reduce((s, i) => s + i.quantidade * (i.valorTabelaUnitario ?? i.precoUnitario), 0),
    })
    setItemProdutoId(''); setItemQuantidade(1); setItemPreco(0)
    setOpErrors(e => ({ ...e, itens: '' }))
  }

  function removerItem(index: number) {
    const itens = (opForm.itens ?? []).filter((_, i) => i !== index)
    updateOp({
      itens, produtoId: itens[0]?.produtoId ?? '',
      valorTotal: itens.reduce((s, i) => s + i.quantidade * i.precoUnitario, 0),
      valorTabela: itens.reduce((s, i) => s + i.quantidade * (i.valorTabelaUnitario ?? i.precoUnitario), 0),
    })
  }

  async function handleExportar() {
    setExportando(true)
    const p: Record<string, string> = {}
    if (opFiltroStatus.length > 0) p.status = opFiltroStatus.join(',')
    if (opFiltroEtapa.length > 0)  p.etapa  = opFiltroEtapa.join(',')
    if (opBusca) p.busca = opBusca
    try { await exportar.pedidos(p) } finally { setExportando(false) }
  }

  async function handleValidarCupom() {
    if (!cupomCodigo.trim()) return
    if (!totais.total) { setOpError('Adicione os itens antes de aplicar o cupom'); return }
    setValidandoCupom(true)
    try {
      setCupomResult(await cuponsApi.validar({
        codigo: cupomCodigo, valorPedido: totais.total,
        produtoId: opForm.itens?.[0]?.produtoId, clienteId: opForm.clienteId || undefined,
      }))
    } catch (e) {
      setCupomResult({ valido: false, message: e instanceof Error ? e.message : 'Cupom inválido' })
    } finally { setValidandoCupom(false) }
  }

  async function handleSaveOp(e: React.FormEvent) {
    e.preventDefault()
    const validation = validate(opForm)
    if (contratoSelecionado?.modalidade === 'Por Ordem de Fornecimento' && !opForm.ordemFornecimentoId)
      validation.ordemFornecimentoId = 'Ordem de Fornecimento é obrigatória'
    const clienteSel = clientesList.find(c => c._id === opForm.clienteId)
    if (clienteSel?.esferaPublica && !opForm.notaEmpenhoId && !opForm.vinculo.empenho?.trim())
      validation.empenho = 'Empenho obrigatório para cliente da esfera pública'
    setOpErrors(validation)
    if (hasErrors(validation as Record<string, string>)) return
    setOpSaving(true); setOpError('')
    try {
      await api.create({
        ...opForm,
        numeroEmpenhoNoContrato: opForm.notaEmpenhoId ? undefined : opForm.vinculo.empenho?.trim() || undefined,
        vinculo: {
          ...opForm.vinculo,
          tipo: opForm.contratoId ? 'Contrato' : opForm.parceiroId ? 'Revenda' : (opForm.notaEmpenhoId || opForm.vinculo.empenho) ? 'EmpenhoSF' : 'CompraDireta',
        },
        valorTotal: totais.total, valorTabela: totais.tabela,
        cupomCodigo: cupomCodigo.trim() ? cupomCodigo.trim().toUpperCase() : undefined,
      })
      setShowOpModal(false); setOpForm(blankForm()); setCupomCodigo(''); setCupomResult(null); loadOp()
    } catch (err) {
      setOpError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally { setOpSaving(false) }
  }

  // ── estado aba SSL ──────────────────────────────────────────────────────────
  const [sslPage, setSslPage] = useState(1)
  const [sslTotal, setSslTotal] = useState(0)
  const [sslRows, setSslRows] = useState<PedidoSSL[]>([])
  const [sslLoading, setSslLoading] = useState(true)
  const [sslBusca, setSslBusca] = useState('')
  const [sslFiltroStatus, setSslFiltroStatus] = useState('')
  const [sslFiltroTipo, setSslFiltroTipo] = useState('')
  const [sslEmitidos, setSslEmitidos] = useState(0)
  const [sslVencendo30, setSslVencendo30] = useState(0)
  const [showSslModal, setShowSslModal] = useState(false)
  const [sslForm, setSslForm] = useState<Partial<PedidoSSL>>({ fornecedor: 'Sectigo', prazoAnos: 1 })
  const [sslSaving, setSslSaving] = useState(false)
  const [sslError, setSslError] = useState('')
  const [sslClientesList, setSslClientesList] = useState<Cliente[]>([])

  const loadSsl = useCallback(() => {
    setSslLoading(true)
    sslApi.list({ page: sslPage, limit: 20, dominio: sslBusca || undefined, status: sslFiltroStatus || undefined, tipo: sslFiltroTipo || undefined })
      .then(res => {
        setSslRows(res.data); setSslTotal(res.total)
        setSslEmitidos(res.data.filter(r => r.status === 'Emitido').length)
        setSslVencendo30(res.data.filter(r => isVencendoEm30(r.fimValidade)).length)
      })
      .finally(() => setSslLoading(false))
  }, [sslPage, sslBusca, sslFiltroStatus, sslFiltroTipo])

  useEffect(() => { if (aba === 'internacional') loadSsl() }, [aba, loadSsl])

  async function openSslCreate() {
    setSslForm({ fornecedor: 'Sectigo', prazoAnos: 1 }); setSslError('')
    if (sslClientesList.length === 0) {
      const res = await clientesApi.list({ limit: 200 })
      setSslClientesList(res.data)
    }
    setShowSslModal(true)
  }

  async function handleSaveSsl(e: React.FormEvent) {
    e.preventDefault()
    if (!sslForm.clienteId)        { setSslError('Selecione um cliente.'); return }
    if (!sslForm.dominioPrincipal) { setSslError('Informe o domínio principal.'); return }
    if (!sslForm.tipo)             { setSslError('Selecione o tipo.'); return }
    setSslSaving(true); setSslError('')
    try {
      await sslApi.create(sslForm)
      setShowSslModal(false); loadSsl()
    } catch (err) {
      setSslError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally { setSslSaving(false) }
  }

  const sslSubtitle = [
    sslEmitidos > 0  ? `${sslEmitidos} emitido(s)` : '',
    sslVencendo30 > 0 ? `${sslVencendo30} vencendo em 30 dias` : '',
  ].filter(Boolean).join(', ') || `${sslTotal} registro(s)`

  // ── colunas operacional ─────────────────────────────────────────────────────
  const opColumns = [
    { key: 'numero',    header: 'Número',  render: (r: Pedido) => <strong>{r.numero}</strong> },
    { key: 'clienteId', header: 'Cliente', render: (r: Pedido) => typeof r.clienteId === 'object' ? r.clienteId.nome : r.clienteId },
    { key: 'produtoId', header: 'Itens',   render: (r: Pedido) => r.itens?.length > 1 ? `${r.itens.length} itens` : (r.itens?.[0]?.nome || (typeof r.produtoId === 'object' ? r.produtoId.nome : r.produtoId)) },
    { key: 'valorTotal', header: 'Valor',  render: (r: Pedido) => moeda(r.valorTotal) },
    { key: 'vinculo', header: 'Vínculo', render: (r: Pedido) => {
      const vs = [r.contratoId ? 'Contrato' : '', r.notaEmpenhoId || r.numeroEmpenhoNoContrato || r.vinculo.empenho ? 'Empenho' : '', r.parceiroId ? 'Revenda' : ''].filter(Boolean)
      return <Badge label={vs.join(' + ') || 'Compra direta'} variant="default" />
    }},
    { key: 'etapaOperacional', header: 'Etapa',  render: (r: Pedido) => <Badge label={r.etapaOperacional} variant="info" /> },
    { key: 'status',           header: 'Status', render: (r: Pedido) => <Badge label={r.status} /> },
    { key: 'nfEmitida',        header: 'NF',     render: (r: Pedido) => r.nfEmitida ? <Badge label="Emitida" variant="success" /> : <Badge label="Pendente" variant="warning" /> },
  ]

  // ── colunas SSL ─────────────────────────────────────────────────────────────
  const sslColumns = [
    { key: 'numero', header: 'Número', render: (r: PedidoSSL) => <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.82rem' }}>{r.numero}</span> },
    { key: 'clienteId', header: 'Cliente', render: (r: PedidoSSL) => <span style={{ fontSize: '0.85rem' }}>{getNomeCliente(r.clienteId)}</span> },
    { key: 'dominioPrincipal', header: 'Domínio', render: (r: PedidoSSL) => (
      <span>
        <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>{r.dominioPrincipal}</span>
        {isVencendoEm30(r.fimValidade) && <span title="Vencendo em 30 dias" style={{ marginLeft: 6 }}>⚠️</span>}
      </span>
    )},
    { key: 'tipo',       header: 'Tipo',       render: (r: PedidoSSL) => <Badge label={r.tipo} variant={tipoBadgeVariant(r.tipo)} /> },
    { key: 'fornecedor', header: 'Fornecedor', render: (r: PedidoSSL) => <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{r.fornecedor || '—'}</span> },
    { key: 'prazoAnos',  header: 'Prazo',      render: (r: PedidoSSL) => <span style={{ fontSize: '0.82rem' }}>{r.prazoAnos ? `${r.prazoAnos} ano${r.prazoAnos > 1 ? 's' : ''}` : '—'}</span> },
    { key: 'fimValidade', header: 'Validade', render: (r: PedidoSSL) => {
      const v = isVencendoEm30(r.fimValidade)
      return <span style={{ color: v ? 'var(--warning, #d97706)' : undefined, fontWeight: v ? 600 : undefined, fontSize: '0.82rem' }}>{fmtDate(r.fimValidade)}</span>
    }},
    { key: 'status', header: 'Status', render: (r: PedidoSSL) => <Badge label={r.status} variant={sslStatusVariant(r.status)} /> },
  ]

  // ── tab pills ───────────────────────────────────────────────────────────────
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 20px', borderRadius: 20, border: 'none', cursor: 'pointer',
    fontWeight: 600, fontSize: '0.85rem', transition: 'all .15s',
    background: active ? 'var(--primary, #2563eb)' : 'transparent',
    color: active ? '#fff' : 'var(--text-secondary, #64748b)',
  })

  const titleLabel = statusFixo
    ? { Rascunho: 'Pedidos — Rascunho', Aprovado: 'Pedidos — Aprovados', 'Em processo': 'Pedidos — Em Processo', Faturado: 'Pedidos — Faturados', Concluido: 'Pedidos — Concluídos', Cancelado: 'Pedidos — Cancelados' }[statusFixo]
    : 'Pedidos'

  return (
    <div className={styles.page}>
      {/* ── header + tabs ── */}
      <PageHeader
        title="Pedidos"
        subtitle={aba === 'servicos' ? `${opTotal} registro(s)` : aba === 'internacional' ? sslSubtitle : `${opTotal} registro(s)`}
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2, #f1f5f9)', borderRadius: 24, padding: 4 }}>
              <button style={tabStyle(aba === 'servicos')}       onClick={() => trocarAba('servicos')}>Serviços</button>
              <button style={tabStyle(aba === 'internacional')}  onClick={() => trocarAba('internacional')}>Internacional</button>
              <button style={tabStyle(aba === 'icp')}            onClick={() => trocarAba('icp')}>ICP-Brasil</button>
            </div>
            {aba === 'servicos' && <>
              <button className={styles.btnSecondary} onClick={handleExportar} disabled={exportando}>{exportando ? 'Exportando...' : '⬇ CSV'}</button>
              <button className={styles.btnPrimary} onClick={() => { setOpForm(blankForm()); setOpErrors({}); setOpError(''); setShowOpModal(true) }}>+ Novo Pedido</button>
            </>}
            {aba === 'internacional' && (
              <button className={styles.btnPrimary} onClick={openSslCreate}>+ Novo Pedido SSL</button>
            )}
          </div>
        }
      />

      {/* ══ ABA OPERACIONAL ══ */}
      {aba === 'servicos' && <>
        <div className={styles.filters}>
          <input className={styles.search} placeholder="Buscar por número..." value={opBusca} onChange={e => { setOpBusca(e.target.value); setOpPage(1) }} />
          <div className={styles.filtersGrid}>
            <div className={styles.chipRow}>
              <span className={styles.chipLabel}>Status:</span>
              {[{ v: '', l: 'Todos' }, ...['Rascunho', 'Aprovado', 'Em processo', 'Faturado', 'Concluido', 'Cancelado'].map(s => ({ v: s, l: s }))].map(({ v, l }) => (
                <button key={v} className={`${styles.chip} ${v === '' ? opFiltroStatus.length === 0 ? styles.chipActive : '' : opFiltroStatus.includes(v) ? styles.chipActive : ''}`} onClick={() => { setOpFiltroStatus(toggle(opFiltroStatus, v)); setOpPage(1) }}>{l}</button>
              ))}
            </div>
            <div className={styles.chipRow}>
              <span className={styles.chipLabel}>Vínculo:</span>
              {[{ v: '', l: 'Todos' }, ...VINCULOS.map(v => ({ v, l: v }))].map(({ v, l }) => (
                <button key={v} className={`${styles.chip} ${v === '' ? opFiltroVinculo.length === 0 ? styles.chipActive : '' : opFiltroVinculo.includes(v) ? styles.chipActive : ''}`} onClick={() => { setOpFiltroVinculo(toggle(opFiltroVinculo, v)); setOpPage(1) }}>{l}</button>
              ))}
            </div>
            <div className={styles.chipRow}>
              <span className={styles.chipLabel}>Etapa:</span>
              {[{ v: '', l: 'Todas' }, ...ETAPAS.map(e => ({ v: e, l: e }))].map(({ v, l }) => (
                <button key={v} className={`${styles.chip} ${v === '' ? opFiltroEtapa.length === 0 ? styles.chipActive : '' : opFiltroEtapa.includes(v) ? styles.chipActive : ''}`} onClick={() => { setOpFiltroEtapa(toggle(opFiltroEtapa, v)); setOpPage(1) }}>{l}</button>
              ))}
            </div>
            <div className={styles.chipRow}>
              <span className={styles.chipLabel}>NF:</span>
              {[{ v: '', l: 'Todas' }, { v: 'true', l: 'Emitida' }, { v: 'false', l: 'Pendente' }].map(({ v, l }) => (
                <button key={v} className={`${styles.chip} ${opFiltroNF === v ? styles.chipActive : ''}`} onClick={() => { setOpFiltroNF(v); setOpPage(1) }}>{l}</button>
              ))}
            </div>
          </div>
        </div>
        <Table columns={opColumns} rows={opRows} loading={opLoading} onRowClick={r => navigate(`/pedidos/${(r as Pedido)._id}`)} empty="Nenhum pedido encontrado" />
        <Pagination page={opPage} total={opTotal} limit={20} onChange={setOpPage} />
      </>}

      {/* ══ ABA SSL ══ */}
      {aba === 'internacional' && <>
        <div className={styles.filters}>
          <input className={styles.search} placeholder="Buscar por domínio..." value={sslBusca} onChange={e => { setSslBusca(e.target.value); setSslPage(1) }} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className={styles.chipRow}>
              <span className={styles.chipLabel}>Status</span>
              {['', 'Rascunho', 'Aguardando DCV', 'Em Validacao', 'Emitido', 'Cancelado'].map(s => (
                <button key={s} className={`${styles.chip} ${sslFiltroStatus === s ? styles.chipActive : ''}`} onClick={() => { setSslFiltroStatus(s); setSslPage(1) }}>{s || 'Todos'}</button>
              ))}
            </div>
            <div className={styles.chipRow}>
              <span className={styles.chipLabel}>Tipo</span>
              {['', 'DV', 'OV', 'EV', 'Wildcard', 'MultiDominio'].map(t => (
                <button key={t} className={`${styles.chip} ${sslFiltroTipo === t ? styles.chipActive : ''}`} onClick={() => { setSslFiltroTipo(t); setSslPage(1) }}>{t || 'Todos'}</button>
              ))}
            </div>
          </div>
        </div>
        <Table<PedidoSSL> columns={sslColumns} rows={sslRows} loading={sslLoading} empty="Nenhum pedido SSL encontrado" />
        <Pagination page={sslPage} total={sslTotal} limit={20} onChange={setSslPage} />
      </>}

      {/* ══ ABA ICP-BRASIL ══ */}
      {aba === 'icp' && (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>🔐</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Pedidos ICP-Brasil</div>
          <div style={{ fontSize: '0.85rem' }}>Em breve — Identificação, Equipamento, Aplicação/InfoConv e Bancário</div>
        </div>
      )}

      {/* ══ MODAL — NOVO PEDIDO OPERACIONAL ══ */}
      {showOpModal && <Modal title="Novo Pedido" onClose={() => setShowOpModal(false)} size="lg">
        <form onSubmit={handleSaveOp} noValidate className={styles.form}>
          <div className={styles.formGrid2}>
            <label>Número do Pedido *<input value={opForm.numero} onChange={e => updateOp({ numero: e.target.value })} className={opErrors.numero ? styles.inputError : ''} />{opErrors.numero && <span className={styles.fieldError}>{opErrors.numero}</span>}</label>
            <div style={{ gridColumn: 'span 2', padding: '10px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, color: '#1e3a8a', fontSize: '0.8rem' }}>
              Os vínculos são opcionais e combináveis. Selecione somente contrato, empenho ou revenda que realmente participam deste pedido.
            </div>
            <label>Cliente *
              <select value={opForm.clienteId} onChange={e => updateOp({ clienteId: e.target.value, contratoId: undefined, ordemFornecimentoId: undefined, notaEmpenhoId: undefined })} className={opErrors.clienteId ? styles.inputError : ''}>
                <option value="">Selecione...</option>
                {clientesList.map(c => <option key={c._id} value={c._id}>{c.nome}{c.esferaPublica ? ' ⚠ Esfera Pública' : ''}</option>)}
              </select>
              {opErrors.clienteId && <span className={styles.fieldError}>{opErrors.clienteId}</span>}
              {opForm.clienteId && clientesList.find(c => c._id === opForm.clienteId)?.esferaPublica && (
                <span style={{ fontSize: '0.75rem', color: '#92400e', background: '#fef3c7', borderRadius: 4, padding: '2px 6px', marginTop: 4, display: 'inline-block' }}>⚠ Cliente de esfera pública — empenho obrigatório (Lei 4.320/64)</span>
              )}
            </label>
            <label>Contrato (opcional)
              <select value={opForm.contratoId ?? ''} onChange={e => updateOp({ contratoId: e.target.value || undefined, ordemFornecimentoId: undefined })} className={opErrors.contratoId ? styles.inputError : ''}>
                <option value="">Sem contrato</option>
                {contratosList.map(c => <option key={c._id} value={c._id}>{c.numero} — {c.modalidade} — saldo {moeda(c.valorTotal - c.valorFaturado)}</option>)}
              </select>
            </label>
            {contratoSelecionado?.modalidade === 'Por Ordem de Fornecimento' && (
              <label>Ordem de Fornecimento *
                <select value={opForm.ordemFornecimentoId ?? ''} onChange={e => updateOp({ ordemFornecimentoId: e.target.value })} className={opErrors.ordemFornecimentoId ? styles.inputError : ''}>
                  <option value="">Selecione...</option>
                  {ordensList.map(o => <option key={o._id} value={o._id}>{o.numero} — saldo {moeda(o.valor - o.valorFaturado)}</option>)}
                </select>
                {opErrors.ordemFornecimentoId && <span className={styles.fieldError}>{opErrors.ordemFornecimentoId}</span>}
              </label>
            )}
            <details style={{ gridColumn: 'span 2', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }} open={!!(opForm.notaEmpenhoId || opForm.vinculo.empenho || clientesList.find(c => c._id === opForm.clienteId)?.esferaPublica)}>
              <summary style={{ cursor: 'pointer', fontWeight: 650 }}>Empenho / Nota de Empenho</summary>
              <div className={styles.formGrid2} style={{ marginTop: 10 }}>
                {notasEmpenhoList.length > 0 && (
                  <label style={{ gridColumn: 'span 2' }}>Nota de Empenho cadastrada (opcional)
                    <select value={opForm.notaEmpenhoId ?? ''} onChange={e => { const nota = notasEmpenhoList.find(n => n._id === e.target.value); updateOp({ notaEmpenhoId: e.target.value || undefined, vinculo: { ...opForm.vinculo, empenho: nota?.numero ?? opForm.vinculo.empenho } }) }}>
                      <option value="">Digitar manualmente</option>
                      {notasEmpenhoList.map(n => <option key={n._id} value={n._id}>{n.numero} — saldo {(n.valor - n.valorUtilizado).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}{n.descricao ? ` — ${n.descricao}` : ''}</option>)}
                    </select>
                  </label>
                )}
                <label>Número do Empenho
                  <input value={opForm.vinculo.empenho ?? ''} onChange={e => updateOp({ vinculo: { ...opForm.vinculo, empenho: e.target.value } })} className={opErrors.empenho ? styles.inputError : ''} placeholder="Ex: 2024NE001234" />
                  {opErrors.empenho && <span className={styles.fieldError}>{opErrors.empenho}</span>}
                </label>
              </div>
            </details>
            <details style={{ gridColumn: 'span 2', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }} open={!!opForm.parceiroId}>
              <summary style={{ cursor: 'pointer', fontWeight: 650 }}>Revenda / Parceiro</summary>
              <div className={styles.formGrid2} style={{ marginTop: 10 }}>
                <label style={{ gridColumn: 'span 2' }}>Parceiro Revendedor (opcional)
                  <select value={opForm.parceiroId ?? ''} onChange={e => updateOp({ parceiroId: e.target.value || undefined })} className={opErrors.parceiroId ? styles.inputError : ''}>
                    <option value="">Sem revendedor</option>
                    {parceirosList.map(p => <option key={p._id} value={p._id}>{p.nome}{p.comissaoPercentual ? ` — ${p.comissaoPercentual}% comissão` : ''} — {p.emissorNFPadrao}</option>)}
                  </select>
                </label>
                <label>Valor de Revenda (R$)<input type="number" min="0" step="0.01" value={opForm.valorRevenda ?? ''} onChange={e => updateOp({ valorRevenda: e.target.value ? Number(e.target.value) : undefined })} placeholder="Valor repassado ao revendedor" /></label>
                <label>Emissor da NF<select value={opForm.vinculo.emissorNF ?? ''} onChange={e => updateOp({ vinculo: { ...opForm.vinculo, emissorNF: e.target.value as 'XDigital' | 'Revendedor' || undefined } })}><option value="">Padrão do parceiro</option><option value="XDigital">XDigital Brasil</option><option value="Revendedor">Revendedor emite</option></select></label>
              </div>
            </details>
          </div>

          <div style={{ marginTop: 18, padding: 14, border: '1px solid #e2e8f0', borderRadius: 10 }}>
            <strong>Itens do pedido</strong>
            <div className={styles.formGrid2} style={{ marginTop: 10 }}>
              <label>Produto<select value={itemProdutoId} onChange={e => selecionarProduto(e.target.value)}><option value="">Selecione...</option>{produtosList.map(p => <option key={p._id} value={p._id}>{p.codigo} — {p.nome}</option>)}</select></label>
              <label>Quantidade<input type="number" min="1" step="1" value={itemQuantidade} onChange={e => setItemQuantidade(Number(e.target.value))} /></label>
              <label>Preço unitário<input type="number" min="0" step="0.01" value={itemPreco} onChange={e => setItemPreco(Number(e.target.value))} /></label>
              <div style={{ alignSelf: 'end' }}><button type="button" className={styles.btnSecondary} onClick={adicionarItem}>+ Adicionar item</button></div>
            </div>
            {opErrors.itens && <span className={styles.fieldError}>{opErrors.itens}</span>}
            {(opForm.itens ?? []).map((item, i) => { const p = produtosList.find(p => p._id === item.produtoId); return <div key={`${item.produtoId}-${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #e2e8f0' }}><span>{p?.nome ?? item.produtoId}</span><span>{item.quantidade} × {moeda(item.precoUnitario)}</span><strong>{moeda(item.quantidade * item.precoUnitario)}</strong><button type="button" className={styles.btnSecondary} onClick={() => removerItem(i)}>Remover</button></div> })}
            <div style={{ textAlign: 'right', marginTop: 12 }}><strong>Total: {moeda(totais.total)}</strong><br /><small>Valor de tabela: {moeda(totais.tabela)}</small></div>
          </div>

          <label style={{ marginTop: 14 }}>Observações<textarea value={opForm.observacoes ?? ''} onChange={e => updateOp({ observacoes: e.target.value })} rows={3} /></label>
          <div style={{ marginTop: 14 }}>
            <label>Cupom de Desconto</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ flex: 1 }} placeholder="Código (opcional)" value={cupomCodigo} onChange={e => { setCupomCodigo(e.target.value.toUpperCase()); setCupomResult(null) }} />
              <button type="button" className={styles.btnSecondary} onClick={handleValidarCupom} disabled={validandoCupom || !cupomCodigo.trim()}>{validandoCupom ? 'Validando...' : 'Aplicar'}</button>
            </div>
            {cupomResult && <p style={{ color: cupomResult.valido ? '#166534' : '#b91c1c' }}>{cupomResult.valido ? `Desconto ${moeda(cupomResult.descontoValor ?? 0)} — total ${moeda(cupomResult.valorFinal ?? totais.total)}` : cupomResult.message}</p>}
          </div>
          {opError && <p className={styles.error}>{opError}</p>}
          <div className={styles.formActions}>
            <button type="button" className={styles.btnSecondary} onClick={() => setShowOpModal(false)}>Cancelar</button>
            <button type="submit" className={styles.btnPrimary} disabled={opSaving}>{opSaving ? 'Salvando...' : 'Criar Pedido'}</button>
          </div>
        </form>
      </Modal>}

      {/* ══ MODAL — NOVO PEDIDO SSL ══ */}
      {showSslModal && <Modal title="Novo Pedido SSL" onClose={() => setShowSslModal(false)} size="lg">
        <form onSubmit={handleSaveSsl} noValidate className={styles.form}>
          <div className={styles.formGrid2}>
            <label>Cliente *
              <select value={typeof sslForm.clienteId === 'string' ? sslForm.clienteId : ''} onChange={e => setSslForm(f => ({ ...f, clienteId: e.target.value }))}>
                <option value="">Selecione...</option>
                {sslClientesList.map(c => <option key={c._id} value={c._id}>{c.nome}</option>)}
              </select>
            </label>
            <label>Tipo *
              <select value={sslForm.tipo ?? ''} onChange={e => setSslForm(f => ({ ...f, tipo: e.target.value as PedidoSSL['tipo'] }))}>
                <option value="">Selecione...</option>
                {['DV', 'OV', 'EV', 'Wildcard', 'MultiDominio', 'EV-MultiDominio'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label>Domínio Principal *<input value={sslForm.dominioPrincipal ?? ''} onChange={e => setSslForm(f => ({ ...f, dominioPrincipal: e.target.value }))} placeholder="exemplo.com.br" /></label>
            <label>Fornecedor<input value={sslForm.fornecedor ?? 'Sectigo'} onChange={e => setSslForm(f => ({ ...f, fornecedor: e.target.value }))} /></label>
            <label>Prazo (anos)
              <select value={sslForm.prazoAnos ?? 1} onChange={e => setSslForm(f => ({ ...f, prazoAnos: Number(e.target.value) as PedidoSSL['prazoAnos'] }))}>
                {PRAZO_OPTIONS.map(p => <option key={p} value={p}>{p} {p === 1 ? 'ano' : 'anos'}</option>)}
              </select>
            </label>
            <label>Método DCV
              <select value={sslForm.metodoDCV ?? ''} onChange={e => setSslForm(f => ({ ...f, metodoDCV: (e.target.value || undefined) as PedidoSSL['metodoDCV'] }))}>
                <option value="">Selecione...</option>
                {DCV_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label>Valor Custo (R$)<input type="number" min="0" step="0.01" value={sslForm.valorCusto ?? ''} onChange={e => setSslForm(f => ({ ...f, valorCusto: Number(e.target.value) }))} placeholder="0,00" /></label>
            <label>Valor Venda (R$)<input type="number" min="0" step="0.01" value={sslForm.valorVenda ?? ''} onChange={e => setSslForm(f => ({ ...f, valorVenda: Number(e.target.value) }))} placeholder="0,00" /></label>
          </div>
          <label>Observações<textarea rows={3} value={sslForm.observacoes ?? ''} onChange={e => setSslForm(f => ({ ...f, observacoes: e.target.value }))} /></label>
          {sslError && <p className={styles.error}>{sslError}</p>}
          <div className={styles.formActions}>
            <button type="button" className={styles.btnSecondary} onClick={() => setShowSslModal(false)}>Cancelar</button>
            <button type="submit" className={styles.btnPrimary} disabled={sslSaving}>{sslSaving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </form>
      </Modal>}
    </div>
  )
}
