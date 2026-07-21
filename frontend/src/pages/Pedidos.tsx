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
import { fmtDate, fmtCurrency } from '../utils/fmt'

// ─── tipos Compras ──────────────────────────────────────────────────────────
interface ItemPedidoCompra {
  estoqueItemId: string
  estoqueItemCodigo: string
  estoqueItemNome: string
  quantidade: number
  quantidadeRecebida: number
  custoUnitario: number
  custoTotal: number
}

interface PedidoCompra {
  _id: string
  numero: string
  fornecedor: string
  fornecedorCnpj?: string
  itens: ItemPedidoCompra[]
  valorTotal: number
  status: string
  dataPrevisaoEntrega?: string
  notaFiscalFornecedor?: string
  observacoes?: string
  responsavelNome?: string
  historico: Array<{ data: string; status: string; observacao?: string; usuarioNome?: string }>
  createdAt: string
}

interface EstoqueItemSimples {
  _id: string
  codigo: string
  nome: string
  tipo: string
  fabricante?: string
  custoUnitario: number
  quantidadeAtual: number
  quantidadeReservada: number
}

// ─── tipos ICP ──────────────────────────────────────────────────────────────
interface PedidoICP {
  _id: string
  numero: string
  clienteId: string
  clienteNome?: string
  tipoCert: string
  midia: 'A1' | 'A3-Token' | 'A3-Cartão' | 'A3-Nuvem' | 'A3-Outro'
  prazoAnos: number
  quantidade: number
  titularNome?: string
  titularCpfCnpj?: string
  titularEmail?: string
  titularTelefone?: string
  hardware?: {
    estoqueItemId: string
    estoqueItemCodigo?: string
    estoqueItemNome?: string
    estoqueMovimentoReservaId?: string
    estoqueMovimentoSaidaId?: string
    numeroSerie?: string
    fabricante?: string
    modelo?: string
  }
  valorUnitario?: number
  valorTotal?: number
  status: string
  responsavelNome?: string
  observacoes?: string
  historico: Array<{ data: string; status: string; observacao?: string; usuarioNome?: string }>
  createdAt: string
}

interface EstoqueItemDisponivel {
  _id: string
  codigo: string
  nome: string
  tipo: string
  fabricante?: string
  modelo?: string
  quantidadeAtual: number
  quantidadeReservada: number
}

// ─── helpers ────────────────────────────────────────────────────────────────
const ETAPAS: EtapaOperacional[] = ['Pedido', 'Pagamento', 'Validacao', 'Preparacao', 'Processamento', 'Entrega', 'Conclusao']
const VINCULOS: VinculoTipo[] = ['Contrato', 'EmpenhoSF', 'CompraDireta', 'Revenda']
const PRAZO_OPTIONS = [1, 2, 3, 4, 5] as const
const DCV_OPTIONS = ['HTTP-01', 'DNS-01', 'Email'] as const

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
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

type PedidoStatus = 'Rascunho' | 'Aprovado' | 'Aguardando aprovação' | 'Aguardando pagamento' | 'Em processo' | 'Faturado' | 'Concluido' | 'Cancelado'

// ─── componente principal ───────────────────────────────────────────────────
export default function Pedidos({ statusFixo }: { statusFixo?: PedidoStatus }) {
  const navigate = useNavigate()
  const [params, setSearchParams] = useSearchParams()
  const abaParam = params.get('aba')
  const [aba, setAba] = useState<'servicos' | 'internacional' | 'icp' | 'compras'>(
    abaParam === 'internacional' ? 'internacional' : abaParam === 'icp' ? 'icp' : abaParam === 'compras' ? 'compras' : 'servicos'
  )

  function trocarAba(a: 'servicos' | 'internacional' | 'icp' | 'compras') {
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

  // ── estado aba ICP ──────────────────────────────────────────────────────────
  const [pedidosICP, setPedidosICP] = useState<PedidoICP[]>([])
  const [totalICP, setTotalICP] = useState(0)
  const [pageICP, setPageICP] = useState(1)
  const [statusFiltroICP, setStatusFiltroICP] = useState('')
  const [loadingICP, setLoadingICP] = useState(false)
  const [showModalICP, setShowModalICP] = useState(false)
  const [selectedICP, setSelectedICP] = useState<PedidoICP | null>(null)
  const [showHistoricoICP, setShowHistoricoICP] = useState(false)
  const [itensEstoqueHw, setItensEstoqueHw] = useState<EstoqueItemDisponivel[]>([])
  const [formICP, setFormICP] = useState({
    clienteId: '', clienteNome: '', tipoCert: 'e-CPF A3',
    midia: 'A3-Token' as PedidoICP['midia'], prazoAnos: 1, quantidade: 1,
    titularNome: '', titularCpfCnpj: '', titularEmail: '', titularTelefone: '',
    estoqueItemId: '', numeroSerie: '', valorUnitario: '', valorTotal: '', observacoes: '',
  })
  const [savingICP, setSavingICP] = useState(false)
  const [erroICP, setErroICP] = useState('')
  const [avisoICP, setAvisoICP] = useState('')

  // ── estado aba Compras ──────────────────────────────────────────────────────
  const [pedidosCompra, setPedidosCompra] = useState<PedidoCompra[]>([])
  const [totalCompra, setTotalCompra] = useState(0)
  const [pageCompra, setPageCompra] = useState(1)
  const [statusFiltroCompra, setStatusFiltroCompra] = useState('')
  const [loadingCompra, setLoadingCompra] = useState(false)
  const [showModalCompra, setShowModalCompra] = useState(false)
  const [showReceberModal, setShowReceberModal] = useState(false)
  const [selectedCompra, setSelectedCompra] = useState<PedidoCompra | null>(null)
  const [itensEstoque, setItensEstoque] = useState<EstoqueItemSimples[]>([])
  const [formCompra, setFormCompra] = useState({
    fornecedor: '', fornecedorCnpj: '', dataPrevisaoEntrega: '', observacoes: '',
    itens: [{ estoqueItemId: '', quantidade: 1, custoUnitario: '' }] as Array<{ estoqueItemId: string; quantidade: number; custoUnitario: string }>
  })
  const [savingCompra, setSavingCompra] = useState(false)
  const [erroCompra, setErroCompra] = useState('')
  // Modal recebimento
  const [receberForm, setReceberForm] = useState({
    notaFiscal: '', observacao: '',
    itens: [] as Array<{ estoqueItemId: string; estoqueItemNome: string; quantidadePedida: number; quantidadeRecebida: number; quantidadeAReceber: number; numerosSerie: string }>
  })
  const [savingReceber, setSavingReceber] = useState(false)
  const [erroReceber, setErroReceber] = useState('')

  const loadPedidosCompra = useCallback(async () => {
    setLoadingCompra(true)
    try {
      const params = new URLSearchParams({ page: String(pageCompra), limit: '20' })
      if (statusFiltroCompra) params.set('status', statusFiltroCompra)
      const res = await fetch(`/api/pedidos-compra?${params}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      const json = await res.json()
      setPedidosCompra(json.data ?? [])
      setTotalCompra(json.total ?? 0)
    } finally { setLoadingCompra(false) }
  }, [pageCompra, statusFiltroCompra])

  const loadItensEstoque = useCallback(async () => {
    const res = await fetch('/api/estoque/items?status=Ativo&limit=200', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
    const json = await res.json()
    setItensEstoque(json.data ?? [])
  }, [])

  useEffect(() => { if (aba === 'compras') loadPedidosCompra() }, [aba, loadPedidosCompra])
  useEffect(() => { if (showModalCompra) loadItensEstoque() }, [showModalCompra, loadItensEstoque])

  const handleSaveCompra = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingCompra(true); setErroCompra('')
    try {
      const body = {
        fornecedor: formCompra.fornecedor,
        fornecedorCnpj: formCompra.fornecedorCnpj || undefined,
        dataPrevisaoEntrega: formCompra.dataPrevisaoEntrega || undefined,
        observacoes: formCompra.observacoes || undefined,
        itens: formCompra.itens
          .filter(i => i.estoqueItemId)
          .map(i => ({ estoqueItemId: i.estoqueItemId, quantidade: Number(i.quantidade), custoUnitario: i.custoUnitario ? Number(i.custoUnitario) : undefined })),
      }
      if (body.itens.length === 0) { setErroCompra('Adicione ao menos um item'); setSavingCompra(false); return }
      const res = await fetch('/api/pedidos-compra', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setErroCompra(json.message ?? 'Erro ao criar'); return }
      setShowModalCompra(false)
      setFormCompra({ fornecedor: '', fornecedorCnpj: '', dataPrevisaoEntrega: '', observacoes: '', itens: [{ estoqueItemId: '', quantidade: 1, custoUnitario: '' }] })
      loadPedidosCompra()
    } finally { setSavingCompra(false) }
  }

  function openReceberModal(pedido: PedidoCompra) {
    setSelectedCompra(pedido)
    setReceberForm({
      notaFiscal: pedido.notaFiscalFornecedor ?? '',
      observacao: '',
      itens: pedido.itens.map(i => ({
        estoqueItemId: i.estoqueItemId,
        estoqueItemNome: i.estoqueItemNome,
        quantidadePedida: i.quantidade,
        quantidadeRecebida: i.quantidadeRecebida,
        quantidadeAReceber: i.quantidade - i.quantidadeRecebida,
        numerosSerie: '',
      })),
    })
    setErroReceber('')
    setShowReceberModal(true)
  }

  const handleReceber = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCompra) return
    setSavingReceber(true); setErroReceber('')
    try {
      const body = {
        notaFiscalFornecedor: receberForm.notaFiscal || undefined,
        observacao: receberForm.observacao || undefined,
        itensRecebidos: receberForm.itens
          .filter(i => i.quantidadeAReceber > 0)
          .map(i => ({
            estoqueItemId: i.estoqueItemId,
            quantidadeRecebida: i.quantidadeAReceber,
            numerosSerie: i.numerosSerie ? i.numerosSerie.split('\n').map(s => s.trim()).filter(Boolean) : undefined,
          })),
      }
      if (body.itensRecebidos.length === 0) { setErroReceber('Informe ao menos uma quantidade a receber'); setSavingReceber(false); return }
      const res = await fetch(`/api/pedidos-compra/${selectedCompra._id}/receber`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setErroReceber(json.message ?? 'Erro ao registrar recebimento'); return }
      setShowReceberModal(false)
      loadPedidosCompra()
    } finally { setSavingReceber(false) }
  }

  const handleStatusCompra = async (pedido: PedidoCompra, novoStatus: string) => {
    if (!confirm(`Confirmar: ${novoStatus}?`)) return
    await fetch(`/api/pedidos-compra/${pedido._id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify({ status: novoStatus }),
    })
    loadPedidosCompra()
  }

  function proximosStatusCompra(atual: string): string[] {
    const mapa: Record<string, string[]> = {
      'Rascunho': ['Aguardando Aprovação'],
      'Aguardando Aprovação': ['Aprovado'],
      'Aprovado': ['Pedido Enviado'],
      'Pedido Enviado': [],
      'Parcialmente Recebido': [],
    }
    const proximos = mapa[atual] ?? []
    if (atual !== 'Recebido' && atual !== 'Cancelado') proximos.push('Cancelado')
    return proximos
  }

  function compraStatusVariant(s: string): TipoBadge {
    switch (s) {
      case 'Recebido': return 'success'
      case 'Cancelado': return 'danger'
      case 'Aprovado': return 'info'
      case 'Parcialmente Recebido': return 'warning'
      default: return 'default'
    }
  }

  const loadPedidosICP = useCallback(async () => {
    setLoadingICP(true)
    try {
      const p = new URLSearchParams({ page: String(pageICP), limit: '20' })
      if (statusFiltroICP) p.set('status', statusFiltroICP)
      const res = await fetch(`/api/pedidos-icp?${p}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      const json = await res.json()
      setPedidosICP(json.data ?? [])
      setTotalICP(json.total ?? 0)
    } finally { setLoadingICP(false) }
  }, [pageICP, statusFiltroICP])

  const loadItensEstoqueHw = useCallback(async () => {
    const res = await fetch('/api/estoque/items?status=Ativo&limit=100', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
    const json = await res.json()
    const hw = (json.data ?? []).filter((i: EstoqueItemDisponivel) =>
      (i.tipo === 'Token USB' || i.tipo === 'Cartão Inteligente') &&
      (i.quantidadeAtual - i.quantidadeReservada) > 0
    )
    setItensEstoqueHw(hw)
  }, [])

  useEffect(() => { if (aba === 'icp') loadPedidosICP() }, [aba, loadPedidosICP])
  useEffect(() => { if (showModalICP) loadItensEstoqueHw() }, [showModalICP, loadItensEstoqueHw])

  const handleSaveICP = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingICP(true); setErroICP(''); setAvisoICP('')
    try {
      const isHw = formICP.midia === 'A3-Token' || formICP.midia === 'A3-Cartão'
      const body: Record<string, unknown> = {
        clienteId: formICP.clienteId,
        clienteNome: formICP.clienteNome,
        tipoCert: formICP.tipoCert,
        midia: formICP.midia,
        prazoAnos: Number(formICP.prazoAnos),
        quantidade: Number(formICP.quantidade),
        titularNome: formICP.titularNome || undefined,
        titularCpfCnpj: formICP.titularCpfCnpj || undefined,
        titularEmail: formICP.titularEmail || undefined,
        titularTelefone: formICP.titularTelefone || undefined,
        valorUnitario: formICP.valorUnitario ? Number(formICP.valorUnitario) : undefined,
        valorTotal: formICP.valorTotal ? Number(formICP.valorTotal) : undefined,
        observacoes: formICP.observacoes || undefined,
      }
      if (isHw && formICP.estoqueItemId) {
        body.hardware = {
          estoqueItemId: formICP.estoqueItemId,
          numeroSerie: formICP.numeroSerie || undefined,
        }
      }
      const res = await fetch('/api/pedidos-icp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setErroICP(json.message ?? 'Erro ao criar pedido'); return }
      if (json.aviso) setAvisoICP(json.aviso)
      setShowModalICP(false)
      loadPedidosICP()
    } catch (err) {
      setErroICP(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally { setSavingICP(false) }
  }

  const handleStatusICP = async (pedido: PedidoICP, novoStatus: string) => {
    if (!confirm(`Confirmar: ${novoStatus}?`)) return
    const res = await fetch(`/api/pedidos-icp/${pedido._id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify({ status: novoStatus }),
    })
    const json = await res.json()
    if (!res.ok) { alert(json.message ?? 'Erro'); return }
    loadPedidosICP()
  }

  function proximosStatusICP(atual: string): string[] {
    const mapa: Record<string, string[]> = {
      'Rascunho': ['Em Análise'],
      'Em Análise': ['Aguardando Documentos', 'Documentação OK'],
      'Aguardando Documentos': ['Documentação OK'],
      'Documentação OK': ['Agendado'],
      'Agendado': ['Em Emissão'],
      'Em Emissão': ['Despachado'],
      'Despachado': ['Entregue'],
      'Entregue': ['Concluído'],
    }
    const proximos = mapa[atual] ?? []
    if (atual !== 'Concluído' && atual !== 'Cancelado') proximos.push('Cancelado')
    return proximos
  }

  function icpStatusVariant(s: string): TipoBadge {
    switch (s) {
      case 'Concluído': return 'success'
      case 'Cancelado': return 'danger'
      case 'Despachado': return 'warning'
      case 'Em Emissão':
      case 'Agendado': return 'info'
      default: return 'default'
    }
  }

  function icpMidiaVariant(m: string): TipoBadge {
    switch (m) {
      case 'A1': return 'info'
      case 'A3-Token':
      case 'A3-Cartão': return 'warning'
      default: return 'default'
    }
  }

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

  return (
    <div className={styles.page}>
      {/* ── header + tabs ── */}
      <PageHeader
        title="Pedidos"
        subtitle={aba === 'servicos' ? `${opTotal} registro(s)` : aba === 'internacional' ? sslSubtitle : aba === 'compras' ? `${totalCompra} registro(s)` : `${totalICP} registro(s)`}
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2, #f1f5f9)', borderRadius: 24, padding: 4 }}>
              <button style={tabStyle(aba === 'servicos')}       onClick={() => trocarAba('servicos')}>Serviços</button>
              <button style={tabStyle(aba === 'internacional')}  onClick={() => trocarAba('internacional')}>Internacional</button>
              <button style={tabStyle(aba === 'icp')}            onClick={() => trocarAba('icp')}>ICP-Brasil</button>
              <button style={tabStyle(aba === 'compras')}        onClick={() => trocarAba('compras')}>Compras</button>
            </div>
            {aba === 'servicos' && <>
              <button className={styles.btnSecondary} onClick={handleExportar} disabled={exportando}>{exportando ? 'Exportando...' : '⬇ CSV'}</button>
              <button className={styles.btnPrimary} onClick={() => { setOpForm(blankForm()); setOpErrors({}); setOpError(''); setShowOpModal(true) }}>+ Novo Pedido</button>
            </>}
            {aba === 'internacional' && (
              <button className={styles.btnPrimary} onClick={openSslCreate}>+ Novo Pedido SSL</button>
            )}
            {aba === 'icp' && (
              <button className={styles.btnPrimary} onClick={() => { setFormICP({ clienteId: '', clienteNome: '', tipoCert: 'e-CPF A3', midia: 'A3-Token', prazoAnos: 1, quantidade: 1, titularNome: '', titularCpfCnpj: '', titularEmail: '', titularTelefone: '', estoqueItemId: '', numeroSerie: '', valorUnitario: '', valorTotal: '', observacoes: '' }); setErroICP(''); setAvisoICP(''); setShowModalICP(true) }}>+ Novo Pedido ICP</button>
            )}
            {aba === 'compras' && (
              <button className={styles.btnPrimary} onClick={() => setShowModalCompra(true)}>+ Nova Compra</button>
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
      {aba === 'icp' && <>
        <div className={styles.filters}>
          <select value={statusFiltroICP} onChange={e => { setStatusFiltroICP(e.target.value); setPageICP(1) }}>
            <option value="">Todos os status</option>
            {['Rascunho', 'Em Análise', 'Aguardando Documentos', 'Documentação OK', 'Agendado', 'Em Emissão', 'Despachado', 'Entregue', 'Concluído', 'Cancelado'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        {loadingICP ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>Carregando...</div>
        ) : pedidosICP.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Nenhum pedido ICP encontrado.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border, #e2e8f0)', background: 'var(--surface-2, #f8fafc)' }}>
                  {['Número', 'Cliente', 'Tipo Cert.', 'Mídia', 'Hardware', 'Prazo', 'Status', 'Ações'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pedidosICP.map(p => (
                  <tr key={p._id} style={{ borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>{p.numero}</td>
                    <td style={{ padding: '10px 14px' }}>{p.clienteNome ?? p.clienteId}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{p.tipoCert}</td>
                    <td style={{ padding: '10px 14px' }}><Badge label={p.midia} variant={icpMidiaVariant(p.midia)} /></td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      {p.hardware ? (
                        <span>
                          {p.hardware.estoqueItemCodigo ?? p.hardware.estoqueItemId}
                          {p.hardware.numeroSerie && <span style={{ color: 'var(--text-secondary)', marginLeft: 4 }}>({p.hardware.numeroSerie})</span>}
                          {p.hardware.estoqueMovimentoSaidaId && <span title="Saída registrada" style={{ marginLeft: 4 }}>&#128274;</span>}
                        </span>
                      ) : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{p.prazoAnos} ano{p.prazoAnos > 1 ? 's' : ''}</td>
                    <td style={{ padding: '10px 14px' }}><Badge label={p.status} variant={icpStatusVariant(p.status)} /></td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {proximosStatusICP(p.status).length > 0 && (
                          <select
                            defaultValue=""
                            onChange={e => { if (e.target.value) handleStatusICP(p, e.target.value) }}
                            style={{ fontSize: '0.78rem', padding: '3px 6px', borderRadius: 6, border: '1px solid var(--border, #e2e8f0)', background: 'var(--surface, #fff)', cursor: 'pointer' }}
                          >
                            <option value="">Avançar...</option>
                            {proximosStatusICP(p.status).map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        )}
                        <button
                          className={styles.btnSecondary}
                          style={{ fontSize: '0.78rem', padding: '3px 10px' }}
                          onClick={() => { setSelectedICP(p); setShowHistoricoICP(true) }}
                        >Histórico</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={pageICP} total={totalICP} limit={20} onChange={setPageICP} />
      </>}

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

      {/* ══ MODAL — NOVO PEDIDO ICP ══ */}
      {showModalICP && <Modal title="Novo Pedido ICP-Brasil" onClose={() => setShowModalICP(false)} size="lg">
        <form onSubmit={handleSaveICP} noValidate className={styles.form}>
          <div className={styles.formGrid2}>
            <label>Cliente (nome)<input value={formICP.clienteNome} onChange={e => setFormICP(f => ({ ...f, clienteNome: e.target.value }))} placeholder="Nome do cliente" /></label>
            <label>ID do Cliente<input value={formICP.clienteId} onChange={e => setFormICP(f => ({ ...f, clienteId: e.target.value }))} placeholder="ID (opcional)" /></label>
            <label>Nome do Titular<input value={formICP.titularNome} onChange={e => setFormICP(f => ({ ...f, titularNome: e.target.value }))} /></label>
            <label>CPF/CNPJ do Titular<input value={formICP.titularCpfCnpj} onChange={e => setFormICP(f => ({ ...f, titularCpfCnpj: e.target.value }))} placeholder="000.000.000-00" /></label>
            <label>E-mail do Titular<input type="email" value={formICP.titularEmail} onChange={e => setFormICP(f => ({ ...f, titularEmail: e.target.value }))} /></label>
            <label>Telefone do Titular<input value={formICP.titularTelefone} onChange={e => setFormICP(f => ({ ...f, titularTelefone: e.target.value }))} placeholder="(00) 00000-0000" /></label>
            <label>Tipo de Certificado *
              <select value={formICP.tipoCert} onChange={e => setFormICP(f => ({ ...f, tipoCert: e.target.value }))}>
                {['e-CPF A1', 'e-CPF A3', 'e-CNPJ A1', 'e-CNPJ A3', 'NF-e A1', 'NF-e A3', 'Equipamento A3', 'Aplicação/InfoConv A3', 'Bancário A3', 'Outro'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label>Mídia *
              <select value={formICP.midia} onChange={e => setFormICP(f => ({ ...f, midia: e.target.value as PedidoICP['midia'], estoqueItemId: '', numeroSerie: '' }))}>
                {(['A1', 'A3-Token', 'A3-Cartão', 'A3-Nuvem', 'A3-Outro'] as const).map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label>Prazo
              <select value={formICP.prazoAnos} onChange={e => setFormICP(f => ({ ...f, prazoAnos: Number(e.target.value) }))}>
                {[1, 2, 3].map(n => <option key={n} value={n}>{n} {n === 1 ? 'ano' : 'anos'}</option>)}
              </select>
            </label>
            <label>Quantidade<input type="number" min="1" step="1" value={formICP.quantidade} onChange={e => setFormICP(f => ({ ...f, quantidade: Number(e.target.value) }))} /></label>
            <label>Valor unitário (R$)<input type="number" min="0" step="0.01" value={formICP.valorUnitario} onChange={e => setFormICP(f => ({ ...f, valorUnitario: e.target.value }))} placeholder="0,00" /></label>
            <label>Valor total (R$)<input type="number" min="0" step="0.01" value={formICP.valorTotal} onChange={e => setFormICP(f => ({ ...f, valorTotal: e.target.value }))} placeholder="0,00" /></label>
          </div>

          {(formICP.midia === 'A3-Token' || formICP.midia === 'A3-Cartão') && (
            <div style={{ marginTop: 16, padding: 14, border: '1px solid var(--border, #e2e8f0)', borderRadius: 10 }}>
              <strong style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Mídia Hardware</strong>
              <div className={styles.formGrid2} style={{ marginTop: 10 }}>
                <label style={{ gridColumn: 'span 2' }}>Token/Cartão de estoque
                  {itensEstoqueHw.length === 0 ? (
                    <div style={{ marginTop: 6, fontSize: '0.8rem', color: '#b45309', background: '#fef3c7', borderRadius: 6, padding: '6px 10px' }}>Nenhum item de hardware disponível em estoque</div>
                  ) : (
                    <select value={formICP.estoqueItemId} onChange={e => setFormICP(f => ({ ...f, estoqueItemId: e.target.value }))}>
                      <option value="">--</option>
                      {itensEstoqueHw.map(i => (
                        <option key={i._id} value={i._id}>{i.codigo} — {i.nome}{i.fabricante ? ` (${i.fabricante})` : ''} — Disp: {i.quantidadeAtual - i.quantidadeReservada}</option>
                      ))}
                    </select>
                  )}
                </label>
                <label>Número de série<input value={formICP.numeroSerie} onChange={e => setFormICP(f => ({ ...f, numeroSerie: e.target.value }))} placeholder="Serial do dispositivo" /></label>
              </div>
            </div>
          )}

          <label style={{ marginTop: 14 }}>Observações<textarea rows={3} value={formICP.observacoes} onChange={e => setFormICP(f => ({ ...f, observacoes: e.target.value }))} /></label>
          {avisoICP && <p style={{ color: '#92400e', background: '#fef3c7', borderRadius: 6, padding: '8px 12px', fontSize: '0.85rem', marginTop: 8 }}>{avisoICP}</p>}
          {erroICP && <p className={styles.error}>{erroICP}</p>}
          <div className={styles.formActions}>
            <button type="button" className={styles.btnSecondary} onClick={() => setShowModalICP(false)}>Cancelar</button>
            <button type="submit" className={styles.btnPrimary} disabled={savingICP}>{savingICP ? 'Salvando...' : 'Criar Pedido ICP'}</button>
          </div>
        </form>
      </Modal>}

      {/* ══ MODAL — HISTÓRICO ICP ══ */}
      {showHistoricoICP && selectedICP && <Modal title={`Histórico — ${selectedICP.numero}`} onClose={() => setShowHistoricoICP(false)} size="lg">
        <div>
          <div style={{ overflowX: 'auto', marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border, #e2e8f0)', background: 'var(--surface-2, #f8fafc)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Data</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Observação</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Responsável</th>
                </tr>
              </thead>
              <tbody>
                {(selectedICP.historico ?? []).length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-secondary)' }}>Nenhum histórico registrado.</td></tr>
                ) : (selectedICP.historico ?? []).map((h, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{fmtDate(h.data)}</td>
                    <td style={{ padding: '8px 12px' }}><Badge label={h.status} variant={icpStatusVariant(h.status)} /></td>
                    <td style={{ padding: '8px 12px' }}>{h.observacao ?? '—'}</td>
                    <td style={{ padding: '8px 12px' }}>{h.usuarioNome ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selectedICP.hardware && (
            <div style={{ padding: 12, background: 'var(--surface-2, #f8fafc)', borderRadius: 8, fontSize: '0.83rem', color: 'var(--text-secondary)' }}>
              <strong>Hardware:</strong>{' '}
              {selectedICP.hardware.estoqueItemCodigo ?? selectedICP.hardware.estoqueItemId}
              {selectedICP.hardware.estoqueItemNome && ` — ${selectedICP.hardware.estoqueItemNome}`}
              {selectedICP.hardware.fabricante && ` (${selectedICP.hardware.fabricante})`}
              {selectedICP.hardware.numeroSerie && <> &bull; Serial: <strong>{selectedICP.hardware.numeroSerie}</strong></>}
              {selectedICP.hardware.estoqueMovimentoReservaId && <> &bull; <span style={{ color: '#d97706' }}>Reservado</span></>}
              {selectedICP.hardware.estoqueMovimentoSaidaId && <> &bull; <span style={{ color: '#16a34a' }}>Saída registrada</span></>}
            </div>
          )}
        </div>
      </Modal>}

      {/* ══ ABA COMPRAS ══ */}
      {aba === 'compras' && <>
        <div className={styles.filters}>
          <select value={statusFiltroCompra} onChange={e => { setStatusFiltroCompra(e.target.value); setPageCompra(1) }}>
            <option value="">Todos os status</option>
            {['Rascunho', 'Aguardando Aprovação', 'Aprovado', 'Pedido Enviado', 'Parcialmente Recebido', 'Recebido', 'Cancelado'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        {loadingCompra ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>Carregando...</div>
        ) : pedidosCompra.length === 0 ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Nenhum pedido de compra encontrado.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border, #e2e8f0)', background: 'var(--surface-2, #f8fafc)' }}>
                  {['Número', 'Fornecedor', 'Itens', 'Valor Total', 'Previsão Entrega', 'Status', 'Ações'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pedidosCompra.map(p => (
                  <tr key={p._id} style={{ borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>{p.numero}</td>
                    <td style={{ padding: '10px 14px' }}>{p.fornecedor}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{p.itens.length} item{p.itens.length !== 1 ? 'ns' : ''}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{fmtCurrency(p.valorTotal)}</td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>{fmtDate(p.dataPrevisaoEntrega)}</td>
                    <td style={{ padding: '10px 14px' }}><Badge label={p.status} variant={compraStatusVariant(p.status)} /></td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {p.status !== 'Recebido' && p.status !== 'Cancelado' && (
                          <button
                            className={styles.btnSecondary}
                            style={{ fontSize: '0.78rem', padding: '3px 10px' }}
                            onClick={() => openReceberModal(p)}
                          >Receber</button>
                        )}
                        {proximosStatusCompra(p.status).length > 0 && (
                          <select
                            defaultValue=""
                            onChange={e => { if (e.target.value) handleStatusCompra(p, e.target.value) }}
                            style={{ fontSize: '0.78rem', padding: '3px 6px', borderRadius: 6, border: '1px solid var(--border, #e2e8f0)', background: 'var(--surface, #fff)', cursor: 'pointer' }}
                          >
                            <option value="">Avançar...</option>
                            {proximosStatusCompra(p.status).map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={pageCompra} total={totalCompra} limit={20} onChange={setPageCompra} />
      </>}

      {/* ══ MODAL — NOVA COMPRA ══ */}
      {showModalCompra && <Modal title="Nova Compra" onClose={() => setShowModalCompra(false)} size="lg">
        <form onSubmit={handleSaveCompra} noValidate className={styles.form}>
          <div className={styles.formGrid2}>
            <label>Fornecedor *<input value={formCompra.fornecedor} onChange={e => setFormCompra(f => ({ ...f, fornecedor: e.target.value }))} placeholder="Nome do fornecedor" required /></label>
            <label>CNPJ do Fornecedor<input value={formCompra.fornecedorCnpj} onChange={e => setFormCompra(f => ({ ...f, fornecedorCnpj: e.target.value }))} placeholder="00.000.000/0000-00" /></label>
            <label>Previsão de Entrega<input type="date" value={formCompra.dataPrevisaoEntrega} onChange={e => setFormCompra(f => ({ ...f, dataPrevisaoEntrega: e.target.value }))} /></label>
            <label style={{ gridColumn: 'span 2' }}>Observações<textarea rows={2} value={formCompra.observacoes} onChange={e => setFormCompra(f => ({ ...f, observacoes: e.target.value }))} /></label>
          </div>

          <div style={{ marginTop: 18, padding: 14, border: '1px solid var(--border, #e2e8f0)', borderRadius: 10 }}>
            <strong style={{ fontSize: '0.9rem' }}>Itens do Pedido</strong>
            {formCompra.itens.map((item, idx) => {
              const itemEstoque = itensEstoque.find(i => i._id === item.estoqueItemId)
              return (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 36px', gap: 8, alignItems: 'end', marginTop: 10 }}>
                  <label style={{ margin: 0 }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Item de estoque</span>
                    <select
                      value={item.estoqueItemId}
                      onChange={e => {
                        const sel = itensEstoque.find(i => i._id === e.target.value)
                        setFormCompra(f => {
                          const itens = [...f.itens]
                          itens[idx] = { ...itens[idx], estoqueItemId: e.target.value, custoUnitario: sel ? String(sel.custoUnitario) : itens[idx].custoUnitario }
                          return { ...f, itens }
                        })
                      }}
                    >
                      <option value="">Selecione...</option>
                      {itensEstoque.map(i => <option key={i._id} value={i._id}>{i.codigo} — {i.nome} ({i.tipo})</option>)}
                    </select>
                  </label>
                  <label style={{ margin: 0 }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Quantidade</span>
                    <input type="number" min="1" step="1" value={item.quantidade} onChange={e => setFormCompra(f => { const itens = [...f.itens]; itens[idx] = { ...itens[idx], quantidade: Number(e.target.value) }; return { ...f, itens } })} />
                  </label>
                  <label style={{ margin: 0 }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Custo unitário</span>
                    <input type="number" min="0" step="0.01" value={item.custoUnitario} placeholder={itemEstoque ? String(itemEstoque.custoUnitario) : '0,00'} onChange={e => setFormCompra(f => { const itens = [...f.itens]; itens[idx] = { ...itens[idx], custoUnitario: e.target.value }; return { ...f, itens } })} />
                  </label>
                  <button
                    type="button"
                    onClick={() => setFormCompra(f => ({ ...f, itens: f.itens.filter((_, i) => i !== idx) }))}
                    style={{ height: 36, border: '1px solid var(--border, #e2e8f0)', borderRadius: 6, background: 'var(--surface, #fff)', cursor: 'pointer', fontWeight: 700, color: '#b91c1c' }}
                    disabled={formCompra.itens.length === 1}
                  >✕</button>
                </div>
              )
            })}
            <button
              type="button"
              className={styles.btnSecondary}
              style={{ marginTop: 10, fontSize: '0.82rem' }}
              onClick={() => setFormCompra(f => ({ ...f, itens: [...f.itens, { estoqueItemId: '', quantidade: 1, custoUnitario: '' }] }))}
            >+ Adicionar Item</button>
            <div style={{ textAlign: 'right', marginTop: 10, fontWeight: 600 }}>
              Total: {fmtCurrency(formCompra.itens.reduce((s, i) => s + (i.custoUnitario ? Number(i.custoUnitario) : 0) * Number(i.quantidade), 0))}
            </div>
          </div>

          {erroCompra && <p className={styles.error}>{erroCompra}</p>}
          <div className={styles.formActions}>
            <button type="button" className={styles.btnSecondary} onClick={() => setShowModalCompra(false)}>Cancelar</button>
            <button type="submit" className={styles.btnPrimary} disabled={savingCompra}>{savingCompra ? 'Salvando...' : 'Criar Pedido de Compra'}</button>
          </div>
        </form>
      </Modal>}

      {/* ══ MODAL — REGISTRAR RECEBIMENTO ══ */}
      {showReceberModal && selectedCompra && <Modal title={`Receber: ${selectedCompra.numero}`} onClose={() => setShowReceberModal(false)} size="lg">
        <form onSubmit={handleReceber} noValidate className={styles.form}>
          <div className={styles.formGrid2}>
            <label>NF do Fornecedor<input value={receberForm.notaFiscal} onChange={e => setReceberForm(f => ({ ...f, notaFiscal: e.target.value }))} placeholder="Número da nota fiscal" /></label>
            <label>Observação<input value={receberForm.observacao} onChange={e => setReceberForm(f => ({ ...f, observacao: e.target.value }))} /></label>
          </div>

          <div style={{ marginTop: 16 }}>
            {receberForm.itens.map((item, idx) => {
              const restante = item.quantidadePedida - item.quantidadeRecebida
              return (
                <div key={idx} style={{ padding: '12px 0', borderBottom: '1px solid var(--border, #e2e8f0)' }}>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.88rem' }}>{item.estoqueItemNome}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                    Pedido: {item.quantidadePedida} &nbsp;|&nbsp; Já recebido: {item.quantidadeRecebida} &nbsp;|&nbsp; Restante: {restante}
                  </div>
                  <div className={styles.formGrid2}>
                    <label>
                      Qtd a receber
                      <input
                        type="number" min="0" max={restante} step="1"
                        value={item.quantidadeAReceber}
                        onChange={e => setReceberForm(f => {
                          const itens = [...f.itens]
                          itens[idx] = { ...itens[idx], quantidadeAReceber: Math.min(Number(e.target.value), restante) }
                          return { ...f, itens }
                        })}
                      />
                    </label>
                    <label>
                      Números de série (um por linha, opcional)
                      <textarea
                        rows={2}
                        value={item.numerosSerie}
                        placeholder="Serial 1&#10;Serial 2"
                        onChange={e => setReceberForm(f => {
                          const itens = [...f.itens]
                          itens[idx] = { ...itens[idx], numerosSerie: e.target.value }
                          return { ...f, itens }
                        })}
                      />
                    </label>
                  </div>
                </div>
              )
            })}
          </div>

          {erroReceber && <p className={styles.error}>{erroReceber}</p>}
          <div className={styles.formActions}>
            <button type="button" className={styles.btnSecondary} onClick={() => setShowReceberModal(false)}>Cancelar</button>
            <button type="submit" className={styles.btnPrimary} disabled={savingReceber}>{savingReceber ? 'Registrando...' : 'Confirmar Recebimento'}</button>
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
