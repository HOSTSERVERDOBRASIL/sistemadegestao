import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Table from '../components/Table'
import Badge from '../components/Badge'
import Pagination from '../components/Pagination'
import Modal from '../components/Modal'
import { pedidos as api, clientes as clientesApi, produtos as produtosApi, exportar, cupons as cuponsApi } from '../api'
import type { Pedido, PedidoPayload, Cliente, Produto, EtapaOperacional, VinculoTipo, ValidacaoCupom } from '../types'
import { required, positiveNumber, selectRequired, hasErrors, type FieldErrors } from '../utils/validate'
import styles from './Page.module.css'

const ETAPAS: EtapaOperacional[] = ['Pedido', 'Pagamento', 'Validacao', 'Preparacao', 'Processamento', 'Entrega', 'Conclusao']
const VINCULOS: VinculoTipo[] = ['Contrato', 'EmpenhoSF', 'CompraDireta', 'Revenda']

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const BLANK_FORM: PedidoPayload = {
  numero: '', clienteId: '', produtoId: '', valorTotal: 0, valorTabela: 0,
  vinculo: { tipo: 'CompraDireta' }
}

type Errs = FieldErrors<PedidoPayload> & { empenho?: string; sf?: string }

function validate(f: PedidoPayload): Errs {
  const errs: Errs = {
    numero:     required(f.numero, 'Número do Pedido'),
    clienteId:  selectRequired(f.clienteId, 'Cliente'),
    produtoId:  selectRequired(f.produtoId, 'Produto'),
    valorTotal: positiveNumber(f.valorTotal, 'Valor Total'),
    valorTabela: positiveNumber(f.valorTabela, 'Valor Tabela'),
  }
  if (f.vinculo.tipo === 'EmpenhoSF') {
    errs.empenho = required(f.vinculo.empenho ?? '', 'Empenho')
    errs.sf      = required(f.vinculo.sf ?? '', 'SF')
  }
  return errs
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
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<PedidoPayload>(BLANK_FORM)
  const [errs, setErrs] = useState<Errs>({})
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [clientesList, setClientesList] = useState<Cliente[]>([])
  const [produtosList, setProdutosList] = useState<Produto[]>([])
  const [exportando, setExportando] = useState(false)
  const [cupomCodigo, setCupomCodigo] = useState('')
  const [cupomResult, setCupomResult] = useState<ValidacaoCupom | null>(null)
  const [validandoCupom, setValidandoCupom] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.list({ page, busca, status: filtroStatus, etapa: filtroEtapa })
      .then(res => { setRows(res.data); setTotal(res.total) })
      .finally(() => setLoading(false))
  }, [page, busca, filtroStatus, filtroEtapa])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (showModal && clientesList.length === 0) {
      Promise.all([clientesApi.list({ limit: 100 }), produtosApi.list({ limit: 100 })])
        .then(([c, p]) => { setClientesList(c.data); setProdutosList(p.data) })
    }
  }, [showModal, clientesList.length])

  function update(patch: Partial<PedidoPayload>) {
    const next = { ...form, ...patch }
    setForm(next)
    if (touched) setErrs(validate(next))
  }

  async function handleExportar() {
    setExportando(true)
    const params: Record<string, string> = {}
    if (filtroStatus) params.status = filtroStatus
    if (filtroEtapa) params.etapa = filtroEtapa
    if (busca) params.busca = busca
    try { await exportar.pedidos(params) } catch { /* silent */ } finally { setExportando(false) }
  }

  async function handleValidarCupom() {
    if (!cupomCodigo.trim()) return
    if (!form.valorTotal) { setError('Informe o Valor Total antes de aplicar o cupom'); return }
    setValidandoCupom(true)
    try {
      const res = await cuponsApi.validar({
        codigo: cupomCodigo,
        valorPedido: form.valorTotal,
        produtoId: form.produtoId || undefined,
        clienteId: form.clienteId || undefined,
      })
      setCupomResult(res)
    } catch (e: unknown) {
      setCupomResult({ valido: false, message: (e as Error).message })
    } finally {
      setValidandoCupom(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setTouched(true)
    const validation = validate(form)
    setErrs(validation)
    if (hasErrors(validation)) return
    setSaving(true); setError('')
    try {
      const payload: PedidoPayload = { ...form }
      if (cupomCodigo.trim()) payload.cupomCodigo = cupomCodigo.trim().toUpperCase()
      await api.create(payload)
      setShowModal(false); setForm(BLANK_FORM); setCupomCodigo(''); setCupomResult(null); setErrs({}); setTouched(false); load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  const columns = [
    { key: 'numero', header: 'Número', render: (r: Pedido) => <strong>{r.numero}</strong> },
    {
      key: 'clienteId', header: 'Cliente',
      render: (r: Pedido) => typeof r.clienteId === 'object' ? r.clienteId.nome : r.clienteId
    },
    {
      key: 'produtoId', header: 'Produto',
      render: (r: Pedido) => typeof r.produtoId === 'object' ? r.produtoId.nome : r.produtoId
    },
    { key: 'valorTotal', header: 'Valor', render: (r: Pedido) => moeda(r.valorTotal) },
    { key: 'vinculo', header: 'Vínculo', render: (r: Pedido) => <Badge label={r.vinculo.tipo} variant="default" /> },
    { key: 'etapaOperacional', header: 'Etapa', render: (r: Pedido) => <Badge label={r.etapaOperacional} variant="info" /> },
    { key: 'status', header: 'Status', render: (r: Pedido) => <Badge label={r.status} /> },
    { key: 'nfEmitida', header: 'NF', render: (r: Pedido) => r.nfEmitida ? <Badge label="Emitida" variant="success" /> : <Badge label="Pendente" variant="warning" /> },
  ]

  return (
    <div className={styles.page}>
      <PageHeader
        title="Pedidos"
        subtitle={`${total} registro(s)`}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={styles.btnSecondary} onClick={handleExportar} disabled={exportando}>
              {exportando ? 'Exportando...' : '⬇ CSV'}
            </button>
            <button className={styles.btnPrimary} onClick={() => { setForm(BLANK_FORM); setErrs({}); setTouched(false); setShowModal(true) }}>+ Novo Pedido</button>
          </div>
        }
      />

      <div className={styles.filters}>
        <input
          className={styles.search}
          placeholder="Buscar por número..."
          value={busca}
          onChange={e => { setBusca(e.target.value); setPage(1) }}
        />
        <select value={filtroStatus} onChange={e => { setFiltroStatus(e.target.value); setPage(1) }}>
          <option value="">Todos os status</option>
          {['Rascunho', 'Aprovado', 'Em processo', 'Faturado', 'Concluido'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={filtroEtapa} onChange={e => { setFiltroEtapa(e.target.value); setPage(1) }}>
          <option value="">Todas as etapas</option>
          {ETAPAS.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      <Table
        columns={columns}
        rows={rows}
        loading={loading}
        onRowClick={(r) => navigate(`/pedidos/${(r as Pedido)._id}`)}
        empty="Nenhum pedido encontrado"
      />
      <Pagination page={page} total={total} limit={20} onChange={setPage} />

      {showModal && (
        <Modal title="Novo Pedido" onClose={() => { setShowModal(false); setForm(BLANK_FORM); setErrs({}); setTouched(false) }} size="lg">
          <form onSubmit={handleSave} noValidate className={styles.form}>
            <div className={styles.formGrid2}>
              <label>Número do Pedido *
                <input
                  value={form.numero}
                  onChange={e => update({ numero: e.target.value })}
                  className={errs.numero ? styles.inputError : ''}
                />
                {errs.numero && <span className={styles.fieldError}>{errs.numero}</span>}
              </label>
              <label>Tipo de Vínculo *
                <select
                  value={form.vinculo.tipo}
                  onChange={e => update({ vinculo: { ...form.vinculo, tipo: e.target.value as VinculoTipo } })}
                >
                  {VINCULOS.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <label>Cliente *
                <select
                  value={form.clienteId}
                  onChange={e => update({ clienteId: e.target.value })}
                  className={errs.clienteId ? styles.inputError : ''}
                >
                  <option value="">Selecione...</option>
                  {clientesList.map(c => <option key={c._id} value={c._id}>{c.nome}</option>)}
                </select>
                {errs.clienteId && <span className={styles.fieldError}>{errs.clienteId}</span>}
              </label>
              <label>Produto *
                <select
                  value={form.produtoId}
                  onChange={e => update({ produtoId: e.target.value })}
                  className={errs.produtoId ? styles.inputError : ''}
                >
                  <option value="">Selecione...</option>
                  {produtosList.map(p => <option key={p._id} value={p._id}>{p.nome}</option>)}
                </select>
                {errs.produtoId && <span className={styles.fieldError}>{errs.produtoId}</span>}
              </label>
              <label>Valor Total *
                <input
                  type="number" min="0" step="0.01"
                  value={form.valorTotal}
                  onChange={e => update({ valorTotal: Number(e.target.value) })}
                  className={errs.valorTotal ? styles.inputError : ''}
                />
                {errs.valorTotal && <span className={styles.fieldError}>{errs.valorTotal}</span>}
              </label>
              <label>Valor Tabela *
                <input
                  type="number" min="0" step="0.01"
                  value={form.valorTabela}
                  onChange={e => update({ valorTabela: Number(e.target.value) })}
                  className={errs.valorTabela ? styles.inputError : ''}
                />
                {errs.valorTabela && <span className={styles.fieldError}>{errs.valorTabela}</span>}
              </label>
              {form.vinculo.tipo === 'EmpenhoSF' && (<>
                <label>Empenho *
                  <input
                    value={form.vinculo.empenho || ''}
                    onChange={e => update({ vinculo: { ...form.vinculo, empenho: e.target.value } })}
                    className={errs.empenho ? styles.inputError : ''}
                  />
                  {errs.empenho && <span className={styles.fieldError}>{errs.empenho}</span>}
                </label>
                <label>SF *
                  <input
                    value={form.vinculo.sf || ''}
                    onChange={e => update({ vinculo: { ...form.vinculo, sf: e.target.value } })}
                    className={errs.sf ? styles.inputError : ''}
                  />
                  {errs.sf && <span className={styles.fieldError}>{errs.sf}</span>}
                </label>
              </>)}
            </div>

            {/* Cupom de desconto */}
            <div style={{ marginTop: 8 }}>
              <label style={{ fontWeight: 600, fontSize: '0.85rem', color: '#475569', display: 'block', marginBottom: 6 }}>
                Cupom de Desconto
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  style={{ flex: 1, padding: '8px 11px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.875rem', fontFamily: 'monospace', textTransform: 'uppercase' }}
                  placeholder="Código do cupom (opcional)"
                  value={cupomCodigo}
                  onChange={e => { setCupomCodigo(e.target.value.toUpperCase()); setCupomResult(null) }}
                />
                <button
                  type="button"
                  style={{ padding: '8px 14px', background: '#f59e0b', color: '#0f172a', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                  onClick={handleValidarCupom}
                  disabled={validandoCupom || !cupomCodigo.trim()}
                >
                  {validandoCupom ? '...' : 'Aplicar'}
                </button>
              </div>
              {cupomResult && (
                <div style={{
                  marginTop: 8, padding: '8px 12px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 500,
                  background: cupomResult.valido ? '#f0fdf4' : '#fef2f2',
                  border: `1px solid ${cupomResult.valido ? '#86efac' : '#fca5a5'}`,
                  color: cupomResult.valido ? '#166534' : '#b91c1c',
                }}>
                  {cupomResult.valido
                    ? `✓ Cupom aplicado! Desconto: ${moeda(cupomResult.descontoValor ?? 0)} — Total final: ${moeda(cupomResult.valorFinal ?? form.valorTotal)}`
                    : `✗ ${cupomResult.message}`
                  }
                </div>
              )}
            </div>

            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => { setShowModal(false); setForm(BLANK_FORM); setErrs({}); setTouched(false) }}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving ? 'Salvando...' : 'Criar Pedido'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
