import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Table from '../components/Table'
import Badge from '../components/Badge'
import Pagination from '../components/Pagination'
import Modal from '../components/Modal'
import {
  pedidos as api, clientes as clientesApi, produtos as produtosApi,
  contratos as contratosApi, exportar, cupons as cuponsApi,
  parceiros as parceirosApi, notasEmpenho as notasEmpenhoApi,
} from '../api'
import type {
  Pedido, PedidoPayload, Cliente, Produto, Contrato, OrdemFornecimento,
  EtapaOperacional, VinculoTipo, ValidacaoCupom, Parceiro, NotaEmpenho,
} from '../types'
import { required, selectRequired, hasErrors } from '../utils/validate'
import styles from './Page.module.css'

const ETAPAS: EtapaOperacional[] = ['Pedido', 'Pagamento', 'Validacao', 'Preparacao', 'Processamento', 'Entrega', 'Conclusao']
const VINCULOS: VinculoTipo[] = ['Contrato', 'EmpenhoSF', 'CompraDireta', 'Revenda']

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function blankForm(): PedidoPayload {
  return {
    numero: '', clienteId: '', produtoId: '', valorTotal: 0, valorTabela: 0,
    itens: [], vinculo: { tipo: 'CompraDireta' }, observacoes: '',
  }
}

type Errors = Partial<Record<'numero' | 'clienteId' | 'itens' | 'contratoId' | 'ordemFornecimentoId' | 'empenho' | 'parceiroId', string>>

function validate(f: PedidoPayload): Errors {
  const errors: Errors = {
    numero: required(f.numero, 'Número do Pedido'),
    clienteId: selectRequired(f.clienteId, 'Cliente'),
    itens: f.itens?.length ? '' : 'Adicione ao menos um item',
  }
  return errors
}

export default function Pedidos() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [rows, setRows] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroEtapa, setFiltroEtapa] = useState('')
  const [filtroVinculo, setFiltroVinculo] = useState('')
  const [filtroNF, setFiltroNF] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<PedidoPayload>(blankForm)
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
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

  const contratoSelecionado = contratosList.find(c => c._id === form.contratoId)

  const load = useCallback(() => {
    setLoading(true)
    api.list({ page, busca, status: filtroStatus, etapa: filtroEtapa, vinculoTipo: filtroVinculo || undefined, nfEmitida: filtroNF || undefined })
      .then(res => { setRows(res.data); setTotal(res.total) })
      .finally(() => setLoading(false))
  }, [page, busca, filtroStatus, filtroEtapa, filtroVinculo, filtroNF])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!showModal) return
    Promise.all([
      clientesApi.list({ limit: 100, ativo: 'true' }),
      produtosApi.list({ limit: 100, ativo: 'true' }),
      parceirosApi.list({ limit: 100, ativo: 'true' }),
    ]).then(([clientes, produtos, parceiros]) => {
      setClientesList(clientes.data)
      setProdutosList(produtos.data)
      setParceirosList(parceiros.data)
    })
  }, [showModal])

  useEffect(() => {
    if (!showModal || !form.clienteId) {
      setContratosList([])
      return
    }
    contratosApi.list({ clienteId: form.clienteId, ativo: 'true', limit: 100 })
      .then(res => setContratosList(res.data))
  }, [showModal, form.clienteId])

  useEffect(() => {
    if (!showModal || !form.clienteId) {
      setNotasEmpenhoList([])
      return
    }
    notasEmpenhoApi.list({ clienteId: form.clienteId, status: 'Aberto', limit: 100 })
      .then(res => setNotasEmpenhoList(res.data))
      .catch(() => setNotasEmpenhoList([]))
  }, [showModal, form.clienteId])

  useEffect(() => {
    if (contratoSelecionado?.modalidade !== 'Por Ordem de Fornecimento') {
      setOrdensList([])
      if (form.ordemFornecimentoId) setForm(current => ({ ...current, ordemFornecimentoId: undefined }))
      return
    }
    contratosApi.ordens(contratoSelecionado._id)
      .then(ordens => setOrdensList(ordens.filter(o => o.status !== 'Fechada')))
  }, [contratoSelecionado?._id, contratoSelecionado?.modalidade, form.ordemFornecimentoId])

  const totais = useMemo(() => {
    const itens = form.itens ?? []
    return {
      total: itens.reduce((sum, item) => sum + item.quantidade * item.precoUnitario, 0),
      tabela: itens.reduce((sum, item) => sum + item.quantidade * (item.valorTabelaUnitario ?? item.precoUnitario), 0),
    }
  }, [form.itens])

  function update(patch: Partial<PedidoPayload>) {
    setForm(current => ({ ...current, ...patch }))
  }

  function selecionarProduto(id: string) {
    setItemProdutoId(id)
    const produto = produtosList.find(p => p._id === id)
    setItemPreco(produto?.preco ?? 0)
  }

  function adicionarItem() {
    const produto = produtosList.find(p => p._id === itemProdutoId)
    if (!produto || itemQuantidade < 1 || itemPreco < 0) {
      setErrors(current => ({ ...current, itens: 'Selecione produto, quantidade e preço válidos' }))
      return
    }
    const atualizados = [...(form.itens ?? []), {
      produtoId: produto._id,
      quantidade: itemQuantidade,
      precoUnitario: itemPreco,
      valorTabelaUnitario: produto.precoTabela ?? produto.preco,
    }]
    update({
      itens: atualizados,
      produtoId: atualizados[0].produtoId,
      valorTotal: atualizados.reduce((sum, item) => sum + item.quantidade * item.precoUnitario, 0),
      valorTabela: atualizados.reduce((sum, item) => sum + item.quantidade * (item.valorTabelaUnitario ?? item.precoUnitario), 0),
    })
    setItemProdutoId(''); setItemQuantidade(1); setItemPreco(0)
    setErrors(current => ({ ...current, itens: '' }))
  }

  function removerItem(index: number) {
    const atualizados = (form.itens ?? []).filter((_, i) => i !== index)
    update({
      itens: atualizados,
      produtoId: atualizados[0]?.produtoId ?? '',
      valorTotal: atualizados.reduce((sum, item) => sum + item.quantidade * item.precoUnitario, 0),
      valorTabela: atualizados.reduce((sum, item) => sum + item.quantidade * (item.valorTabelaUnitario ?? item.precoUnitario), 0),
    })
  }

  async function handleExportar() {
    setExportando(true)
    const params: Record<string, string> = {}
    if (filtroStatus) params.status = filtroStatus
    if (filtroEtapa) params.etapa = filtroEtapa
    if (busca) params.busca = busca
    try { await exportar.pedidos(params) } finally { setExportando(false) }
  }

  async function handleValidarCupom() {
    if (!cupomCodigo.trim()) return
    if (!totais.total) { setError('Adicione os itens antes de aplicar o cupom'); return }
    setValidandoCupom(true)
    try {
      setCupomResult(await cuponsApi.validar({
        codigo: cupomCodigo, valorPedido: totais.total,
        produtoId: form.itens?.[0]?.produtoId, clienteId: form.clienteId || undefined,
      }))
    } catch (e) {
      setCupomResult({ valido: false, message: e instanceof Error ? e.message : 'Cupom inválido' })
    } finally { setValidandoCupom(false) }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const validation = validate(form)
    if (contratoSelecionado?.modalidade === 'Por Ordem de Fornecimento' && !form.ordemFornecimentoId) {
      validation.ordemFornecimentoId = 'Ordem de Fornecimento é obrigatória'
    }
    const clienteSelecionado = clientesList.find(c => c._id === form.clienteId)
    if (clienteSelecionado?.esferaPublica && !form.notaEmpenhoId && !form.vinculo.empenho?.trim()) {
      validation.empenho = 'Empenho obrigatório para cliente da esfera pública'
    }
    setErrors(validation)
    if (hasErrors(validation as Record<string, string>)) return
    setSaving(true); setError('')
    try {
      await api.create({
        ...form,
        numeroEmpenhoNoContrato: form.notaEmpenhoId ? undefined : form.vinculo.empenho?.trim() || undefined,
        vinculo: {
          ...form.vinculo,
          tipo: form.contratoId ? 'Contrato' : form.parceiroId ? 'Revenda' : (form.notaEmpenhoId || form.vinculo.empenho) ? 'EmpenhoSF' : 'CompraDireta',
        },
        valorTotal: totais.total,
        valorTabela: totais.tabela,
        cupomCodigo: cupomCodigo.trim() ? cupomCodigo.trim().toUpperCase() : undefined,
      })
      setShowModal(false); setForm(blankForm()); setCupomCodigo(''); setCupomResult(null); load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  const columns = [
    { key: 'numero', header: 'Número', render: (r: Pedido) => <strong>{r.numero}</strong> },
    { key: 'clienteId', header: 'Cliente', render: (r: Pedido) => typeof r.clienteId === 'object' ? r.clienteId.nome : r.clienteId },
    { key: 'produtoId', header: 'Itens', render: (r: Pedido) => r.itens?.length > 1 ? `${r.itens.length} itens` : (r.itens?.[0]?.nome || (typeof r.produtoId === 'object' ? r.produtoId.nome : r.produtoId)) },
    { key: 'valorTotal', header: 'Valor', render: (r: Pedido) => moeda(r.valorTotal) },
    { key: 'vinculo', header: 'Vínculos', render: (r: Pedido) => {
      const vinculos = [r.contratoId ? 'Contrato' : '', r.notaEmpenhoId || r.numeroEmpenhoNoContrato || r.vinculo.empenho ? 'Empenho' : '', r.parceiroId ? 'Revenda' : ''].filter(Boolean)
      return <Badge label={vinculos.join(' + ') || 'Compra direta'} variant="default" />
    } },
    { key: 'etapaOperacional', header: 'Etapa', render: (r: Pedido) => <Badge label={r.etapaOperacional} variant="info" /> },
    { key: 'status', header: 'Status', render: (r: Pedido) => <Badge label={r.status} /> },
    { key: 'nfEmitida', header: 'NF', render: (r: Pedido) => r.nfEmitida ? <Badge label="Emitida" variant="success" /> : <Badge label="Pendente" variant="warning" /> },
  ]

  return <div className={styles.page}>
    <PageHeader title="Pedidos" subtitle={`${total} registro(s)`} action={<div style={{ display: 'flex', gap: 8 }}>
      <button className={styles.btnSecondary} onClick={handleExportar} disabled={exportando}>{exportando ? 'Exportando...' : '⬇ CSV'}</button>
      <button className={styles.btnPrimary} onClick={() => { setForm(blankForm()); setErrors({}); setError(''); setShowModal(true) }}>+ Novo Pedido</button>
    </div>} />

    <div className={styles.filters}>
      <input className={styles.search} placeholder="Buscar por número..." value={busca} onChange={e => { setBusca(e.target.value); setPage(1) }} />
      <select value={filtroStatus} onChange={e => { setFiltroStatus(e.target.value); setPage(1) }}>
        <option value="">Todos os status</option>
        {['Rascunho', 'Aprovado', 'Em processo', 'Faturado', 'Concluido', 'Cancelado'].map(s => <option key={s}>{s}</option>)}
      </select>
      <select value={filtroEtapa} onChange={e => { setFiltroEtapa(e.target.value); setPage(1) }}>
        <option value="">Todas as etapas</option>{ETAPAS.map(etapa => <option key={etapa}>{etapa}</option>)}
      </select>
      <select value={filtroVinculo} onChange={e => { setFiltroVinculo(e.target.value); setPage(1) }}>
        <option value="">Todos os vínculos</option>
        {VINCULOS.map(v => <option key={v}>{v}</option>)}
      </select>
      <select value={filtroNF} onChange={e => { setFiltroNF(e.target.value); setPage(1) }}>
        <option value="">NF: todas</option>
        <option value="true">NF emitida</option>
        <option value="false">NF pendente</option>
      </select>
    </div>

    <Table columns={columns} rows={rows} loading={loading} onRowClick={r => navigate(`/pedidos/${(r as Pedido)._id}`)} empty="Nenhum pedido encontrado" />
    <Pagination page={page} total={total} limit={20} onChange={setPage} />

    {showModal && <Modal title="Novo Pedido" onClose={() => setShowModal(false)} size="lg">
      <form onSubmit={handleSave} noValidate className={styles.form}>
        <div className={styles.formGrid2}>
          <label>Número do Pedido *<input value={form.numero} onChange={e => update({ numero: e.target.value })} className={errors.numero ? styles.inputError : ''} />{errors.numero && <span className={styles.fieldError}>{errors.numero}</span>}</label>
          <div style={{ gridColumn: 'span 2', padding: '10px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, color: '#1e3a8a', fontSize: '0.8rem' }}>
            Os vínculos são opcionais e combináveis. Selecione somente contrato, empenho ou revenda que realmente participam deste pedido.
          </div>
          <label>Cliente *
            <select
              value={form.clienteId}
              onChange={e => update({ clienteId: e.target.value, contratoId: undefined, ordemFornecimentoId: undefined, notaEmpenhoId: undefined })}
              className={errors.clienteId ? styles.inputError : ''}
            >
              <option value="">Selecione...</option>
              {clientesList.map(c => (
                <option key={c._id} value={c._id}>
                  {c.nome}{c.esferaPublica ? ' ⚠ Esfera Pública' : ''}
                </option>
              ))}
            </select>
            {errors.clienteId && <span className={styles.fieldError}>{errors.clienteId}</span>}
            {form.clienteId && clientesList.find(c => c._id === form.clienteId)?.esferaPublica && (
              <span style={{ fontSize: '0.75rem', color: '#92400e', background: '#fef3c7', borderRadius: 4, padding: '2px 6px', marginTop: 4, display: 'inline-block' }}>
                ⚠ Cliente de esfera pública — empenho obrigatório (Lei 4.320/64)
              </span>
            )}
          </label>
          <label>Contrato (opcional)<select value={form.contratoId ?? ''} onChange={e => update({ contratoId: e.target.value || undefined, ordemFornecimentoId: undefined })} className={errors.contratoId ? styles.inputError : ''}><option value="">Sem contrato</option>{contratosList.map(c => <option key={c._id} value={c._id}>{c.numero} — {c.modalidade} — saldo {moeda(c.valorTotal - c.valorFaturado)}</option>)}</select>{errors.contratoId && <span className={styles.fieldError}>{errors.contratoId}</span>}</label>
          {contratoSelecionado?.modalidade === 'Por Ordem de Fornecimento' && <label>Ordem de Fornecimento *<select value={form.ordemFornecimentoId ?? ''} onChange={e => update({ ordemFornecimentoId: e.target.value })} className={errors.ordemFornecimentoId ? styles.inputError : ''}><option value="">Selecione...</option>{ordensList.map(o => <option key={o._id} value={o._id}>{o.numero} — saldo {moeda(o.valor - o.valorFaturado)}</option>)}</select>{errors.ordemFornecimentoId && <span className={styles.fieldError}>{errors.ordemFornecimentoId}</span>}</label>}
          <details style={{ gridColumn: 'span 2', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }} open={!!(form.notaEmpenhoId || form.vinculo.empenho || clientesList.find(c => c._id === form.clienteId)?.esferaPublica)}>
            <summary style={{ cursor: 'pointer', fontWeight: 650 }}>Empenho / Nota de Empenho</summary>
            <div className={styles.formGrid2} style={{ marginTop: 10 }}>
            {notasEmpenhoList.length > 0 && (
              <label style={{ gridColumn: 'span 2' }}>Nota de Empenho cadastrada (opcional)
                <select
                  value={form.notaEmpenhoId ?? ''}
                  onChange={e => {
                    const nota = notasEmpenhoList.find(n => n._id === e.target.value)
                    update({
                      notaEmpenhoId: e.target.value || undefined,
                      vinculo: { ...form.vinculo, empenho: nota?.numero ?? form.vinculo.empenho },
                    })
                  }}
                >
                  <option value="">Digitar manualmente</option>
                  {notasEmpenhoList.map(n => {
                    const saldo = n.valor - n.valorUtilizado
                    return (
                      <option key={n._id} value={n._id}>
                        {n.numero} — saldo {saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        {n.descricao ? ` — ${n.descricao}` : ''}
                      </option>
                    )
                  })}
                </select>
                <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>
                  Selecionar vincula ao saldo da nota e preenche o número automaticamente
                </span>
              </label>
            )}
            <label>Número do Empenho (alternativa à nota cadastrada)
              <input
                value={form.vinculo.empenho ?? ''}
                onChange={e => update({ vinculo: { ...form.vinculo, empenho: e.target.value } })}
                className={errors.empenho ? styles.inputError : ''}
                placeholder="Ex: 2024NE001234"
              />
              {errors.empenho && <span className={styles.fieldError}>{errors.empenho}</span>}
            </label>
            </div>
          </details>
          <details style={{ gridColumn: 'span 2', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }} open={!!form.parceiroId}>
            <summary style={{ cursor: 'pointer', fontWeight: 650 }}>Revenda / Parceiro</summary>
            <div className={styles.formGrid2} style={{ marginTop: 10 }}>
            <label style={{ gridColumn: 'span 2' }}>Parceiro Revendedor (opcional)
              <select
                value={form.parceiroId ?? ''}
                onChange={e => update({ parceiroId: e.target.value || undefined })}
                className={errors.parceiroId ? styles.inputError : ''}
              >
                <option value="">Sem revendedor</option>
                {parceirosList.map(p => (
                  <option key={p._id} value={p._id}>
                    {p.nome}{p.comissaoPercentual ? ` — ${p.comissaoPercentual}% comissão` : ''} — {p.emissorNFPadrao}
                  </option>
                ))}
              </select>
              {errors.parceiroId && <span className={styles.fieldError}>{errors.parceiroId}</span>}
            </label>
            <label>Valor de Revenda (R$)
              <input
                type="number" min="0" step="0.01"
                value={form.valorRevenda ?? ''}
                onChange={e => update({ valorRevenda: e.target.value ? Number(e.target.value) : undefined })}
                placeholder="Valor repassado ao revendedor"
              />
            </label>
            <label>Emissor da NF
              <select
                value={form.vinculo.emissorNF ?? ''}
                onChange={e => update({ vinculo: { ...form.vinculo, emissorNF: e.target.value as 'XDigital' | 'Revendedor' || undefined } })}
              >
                <option value="">Padrão do parceiro</option>
                <option value="XDigital">XDigital Brasil</option>
                <option value="Revendedor">Revendedor emite</option>
              </select>
            </label>
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
          {errors.itens && <span className={styles.fieldError}>{errors.itens}</span>}
          {(form.itens ?? []).map((item, index) => { const produto = produtosList.find(p => p._id === item.produtoId); return <div key={`${item.produtoId}-${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #e2e8f0' }}><span>{produto?.nome ?? item.produtoId}</span><span>{item.quantidade} × {moeda(item.precoUnitario)}</span><strong>{moeda(item.quantidade * item.precoUnitario)}</strong><button type="button" className={styles.btnSecondary} onClick={() => removerItem(index)}>Remover</button></div> })}
          <div style={{ textAlign: 'right', marginTop: 12 }}><strong>Total: {moeda(totais.total)}</strong><br /><small>Valor de tabela: {moeda(totais.tabela)}</small></div>
        </div>

        <label style={{ marginTop: 14 }}>Observações<textarea value={form.observacoes ?? ''} onChange={e => update({ observacoes: e.target.value })} rows={3} /></label>
        <div style={{ marginTop: 14 }}><label>Cupom de Desconto</label><div style={{ display: 'flex', gap: 8 }}><input style={{ flex: 1 }} placeholder="Código (opcional)" value={cupomCodigo} onChange={e => { setCupomCodigo(e.target.value.toUpperCase()); setCupomResult(null) }} /><button type="button" className={styles.btnSecondary} onClick={handleValidarCupom} disabled={validandoCupom || !cupomCodigo.trim()}>{validandoCupom ? 'Validando...' : 'Aplicar'}</button></div>{cupomResult && <p style={{ color: cupomResult.valido ? '#166534' : '#b91c1c' }}>{cupomResult.valido ? `Desconto ${moeda(cupomResult.descontoValor ?? 0)} — total ${moeda(cupomResult.valorFinal ?? totais.total)}` : cupomResult.message}</p>}</div>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.formActions}><button type="button" className={styles.btnSecondary} onClick={() => setShowModal(false)}>Cancelar</button><button type="submit" className={styles.btnPrimary} disabled={saving}>{saving ? 'Salvando...' : 'Criar Pedido'}</button></div>
      </form>
    </Modal>}
  </div>
}
