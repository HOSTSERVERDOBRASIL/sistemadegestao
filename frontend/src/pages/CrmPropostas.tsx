import { useEffect, useState, useCallback } from 'react'
import PageHeader from '../components/PageHeader'
import Table from '../components/Table'
import Badge from '../components/Badge'
import Pagination from '../components/Pagination'
import Modal from '../components/Modal'
import { fmtDate, fmtCurrency } from '../utils/fmt'
import styles from './Page.module.css'

// ── API direta com Bearer ────────────────────────────────────────────────────
const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api'

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: authHeaders() })
  if (res.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { message?: string }).message || `Erro ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ── Tipos ────────────────────────────────────────────────────────────────────
interface ItemProposta {
  produtoId: string
  codigo: string
  nome: string
  quantidade: number
  precoUnitario: number
  desconto: number
  subtotal: number
}

interface Proposta {
  _id: string
  numero: string
  clienteId: { _id: string; nome: string } | string
  titulo: string
  itens: ItemProposta[]
  valorTotal: number
  validade: string
  status: string
  observacoes?: string
  condicoesPagamento?: string
  responsavelNome?: string
  aceiteEm?: string
  aceitePor?: string
}

interface Cliente {
  _id: string
  nome: string
  documento: string
}

interface Produto {
  _id: string
  codigo: string
  nome: string
  precoTabela?: number
}

interface PageResult<T> {
  data: T[]
  total: number
}

// ── Constantes ───────────────────────────────────────────────────────────────
const STATUS_LIST = [
  'Rascunho', 'Enviada', 'Em Negociação', 'Aceita', 'Recusada', 'Expirada', 'Cancelada',
] as const

function statusVariant(s: string): 'default' | 'info' | 'warning' | 'success' | 'danger' {
  switch (s) {
    case 'Enviada':       return 'info'
    case 'Em Negociação': return 'warning'
    case 'Aceita':        return 'success'
    case 'Recusada':
    case 'Cancelada':     return 'danger'
    default:              return 'default'   // Rascunho, Expirada
  }
}

function isValidadeExpirada(p: Proposta): boolean {
  if (['Aceita', 'Cancelada'].includes(p.status)) return false
  if (!p.validade) return false
  return new Date(p.validade) < new Date()
}

function nomeCliente(p: Proposta): string {
  return typeof p.clienteId === 'object' ? p.clienteId.nome : p.clienteId
}

// ── Tipos do formulário ───────────────────────────────────────────────────────
interface FormItem {
  produtoId: string
  codigo: string
  nome: string
  quantidade: number
  precoUnitario: number
  desconto: number
  subtotal: number
}

const BLANK_ITEM: FormItem = {
  produtoId: '', codigo: '', nome: '', quantidade: 1, precoUnitario: 0, desconto: 0, subtotal: 0,
}

interface FormData {
  titulo: string
  clienteId: string
  oportunidade: string
  validade: string
  observacoes: string
  condicoesPagamento: string
}

const BLANK_FORM: FormData = {
  titulo: '', clienteId: '', oportunidade: '', validade: '', observacoes: '', condicoesPagamento: '',
}

function calcSubtotal(item: FormItem): number {
  const bruto = item.quantidade * item.precoUnitario
  return bruto * (1 - item.desconto / 100)
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function CrmPropostas() {
  // ── Listagem ───────────────────────────────────────────────────────────────
  const [page, setPage]         = useState(1)
  const [total, setTotal]       = useState(0)
  const [rows, setRows]         = useState<Proposta[]>([])
  const [loading, setLoading]   = useState(true)
  const [busca, setBusca]       = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')

  // ── Modal de criação ───────────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]           = useState<FormData>(BLANK_FORM)
  const [itens, setItens]         = useState<FormItem[]>([])
  const [formErrs, setFormErrs]   = useState<Partial<Record<keyof FormData, string>>>({})
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState('')

  // ── Dados auxiliares (clientes / produtos) ─────────────────────────────────
  const [clientesList, setClientesList] = useState<Cliente[]>([])
  const [produtosList, setProdutosList] = useState<Produto[]>([])

  // ── Drawer de detalhe ─────────────────────────────────────────────────────
  const [detalhe, setDetalhe]             = useState<Proposta | null>(null)
  const [changingStatus, setChangingStatus] = useState(false)
  const [novoStatus, setNovoStatus]       = useState('')
  const [submittingStatus, setSubmittingStatus] = useState(false)
  const [generatingToken, setGeneratingToken]   = useState(false)
  const [tokenUrl, setTokenUrl]           = useState('')
  const [tokenCopied, setTokenCopied]     = useState(false)

  // ── Carga ──────────────────────────────────────────────────────────────────
  const load = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams({ page: String(page) })
    if (busca)        p.set('busca', busca)
    if (filtroStatus) p.set('status', filtroStatus)
    apiFetch<PageResult<Proposta>>(`/crm/propostas?${p}`)
      .then(res => { setRows(res.data); setTotal(res.total) })
      .catch(() => { setRows([]); setTotal(0) })
      .finally(() => setLoading(false))
  }, [page, busca, filtroStatus])

  useEffect(() => { load() }, [load])

  // ── Auxiliares para o modal ────────────────────────────────────────────────
  async function loadAuxData() {
    const empty = { data: [] as Cliente[], total: 0 }
    const [cls, pds] = await Promise.all([
      apiFetch<PageResult<Cliente>>('/clientes?limit=100&ativo=true').catch(() => empty as PageResult<Cliente>),
      apiFetch<PageResult<Produto>>('/produtos?limit=200').catch(() => ({ data: [] as Produto[], total: 0 })),
    ])
    setClientesList(cls.data)
    setProdutosList(pds.data)
  }

  async function openCreate() {
    setForm(BLANK_FORM)
    setItens([])
    setFormErrs({})
    setSaveError('')
    await loadAuxData()
    setShowModal(true)
  }

  // ── Atualização do form ────────────────────────────────────────────────────
  function updateForm(patch: Partial<FormData>) {
    setForm(prev => ({ ...prev, ...patch }))
  }

  // ── Gestão de itens ────────────────────────────────────────────────────────
  function addItem() {
    setItens(prev => [...prev, { ...BLANK_ITEM }])
  }

  function removeItem(idx: number) {
    setItens(prev => prev.filter((_, i) => i !== idx))
  }

  function updateItem(idx: number, patch: Partial<FormItem>) {
    setItens(prev => prev.map((item, i) => {
      if (i !== idx) return item
      const next = { ...item, ...patch }
      next.subtotal = calcSubtotal(next)
      return next
    }))
  }

  function onProdutoSelect(idx: number, produtoId: string) {
    const prod = produtosList.find(p => p._id === produtoId)
    if (!prod) {
      updateItem(idx, { produtoId: '', codigo: '', nome: '', precoUnitario: 0 })
      return
    }
    updateItem(idx, {
      produtoId:     prod._id,
      codigo:        prod.codigo,
      nome:          prod.nome,
      precoUnitario: prod.precoTabela ?? 0,
    })
  }

  const valorTotal = itens.reduce((s, it) => s + it.subtotal, 0)

  // ── Validação ──────────────────────────────────────────────────────────────
  function validateForm(): boolean {
    const errs: Partial<Record<keyof FormData, string>> = {}
    if (!form.titulo.trim()) errs.titulo    = 'Título obrigatório'
    if (!form.clienteId)     errs.clienteId = 'Selecione um cliente'
    if (!form.validade)      errs.validade  = 'Validade obrigatória'
    setFormErrs(errs)
    return Object.keys(errs).length === 0
  }

  // ── Salvar proposta ────────────────────────────────────────────────────────
  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!validateForm()) return
    setSaving(true)
    setSaveError('')
    try {
      await apiFetch('/crm/propostas', {
        method: 'POST',
        body: JSON.stringify({
          titulo:             form.titulo,
          clienteId:          form.clienteId,
          oportunidade:       form.oportunidade  || undefined,
          validade:           form.validade,
          observacoes:        form.observacoes        || undefined,
          condicoesPagamento: form.condicoesPagamento || undefined,
          itens: itens.map(it => ({
            produtoId:     it.produtoId,
            codigo:        it.codigo,
            nome:          it.nome,
            quantidade:    it.quantidade,
            precoUnitario: it.precoUnitario,
            desconto:      it.desconto,
            subtotal:      it.subtotal,
          })),
          valorTotal,
        }),
      })
      setShowModal(false)
      load()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao salvar proposta')
    } finally {
      setSaving(false)
    }
  }

  // ── Mudar status ───────────────────────────────────────────────────────────
  async function handleMudarStatus() {
    if (!detalhe || !novoStatus) return
    setSubmittingStatus(true)
    try {
      const updated = await apiFetch<Proposta>(`/crm/propostas/${detalhe._id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: novoStatus }),
      })
      setDetalhe(updated)
      setChangingStatus(false)
      load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao mudar status')
    } finally {
      setSubmittingStatus(false)
    }
  }

  // ── Gerar link de aceite ───────────────────────────────────────────────────
  async function handleGerarToken() {
    if (!detalhe) return
    setGeneratingToken(true)
    setTokenUrl('')
    try {
      const res = await apiFetch<{ token?: string; url?: string }>(
        `/crm/propostas/${detalhe._id}/token-aceite`,
        { method: 'POST', body: JSON.stringify({}) },
      )
      setTokenUrl(res.url ?? `${window.location.origin}/proposta/${res.token ?? ''}`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao gerar link de aceite')
    } finally {
      setGeneratingToken(false)
    }
  }

  async function copyToken() {
    if (!tokenUrl) return
    await navigator.clipboard.writeText(tokenUrl).catch(() => {})
    setTokenCopied(true)
    setTimeout(() => setTokenCopied(false), 2000)
  }

  // ── Abrir drawer ───────────────────────────────────────────────────────────
  function openDetalhe(p: Proposta) {
    setDetalhe(p)
    setNovoStatus(p.status)
    setChangingStatus(false)
    setTokenUrl('')
    setTokenCopied(false)
  }

  // ── Colunas ────────────────────────────────────────────────────────────────
  const columns = [
    {
      key: 'numero', header: 'Número',
      render: (r: Proposta) => <strong>{r.numero}</strong>,
    },
    { key: 'titulo', header: 'Título' },
    {
      key: 'clienteId', header: 'Cliente',
      render: (r: Proposta) => nomeCliente(r),
    },
    {
      key: 'valorTotal', header: 'Valor Total',
      render: (r: Proposta) => fmtCurrency(r.valorTotal),
    },
    {
      key: 'validade', header: 'Validade',
      render: (r: Proposta) => (
        <span style={isValidadeExpirada(r) ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
          {fmtDate(r.validade)}
        </span>
      ),
    },
    {
      key: 'status', header: 'Status',
      render: (r: Proposta) => <Badge label={r.status} variant={statusVariant(r.status)} />,
    },
  ]

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <PageHeader
        title="Propostas"
        subtitle={`${total} registro(s)`}
        action={<button className={styles.btnPrimary} onClick={openCreate}>+ Nova Proposta</button>}
      />

      {/* Filtros */}
      <div className={styles.filters}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className={styles.search}
            placeholder="Buscar por número ou título..."
            value={busca}
            onChange={e => { setBusca(e.target.value); setPage(1) }}
          />
        </div>
        <div className={styles.chipRow}>
          <span className={styles.chipLabel}>Status:</span>
          {[{ v: '', l: 'Todos' }, ...STATUS_LIST.map(s => ({ v: s, l: s }))].map(({ v, l }) => (
            <button
              key={v}
              className={`${styles.chip} ${filtroStatus === v ? styles.chipActive : ''}`}
              onClick={() => { setFiltroStatus(v); setPage(1) }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <Table
        columns={columns}
        rows={rows}
        loading={loading}
        onRowClick={r => openDetalhe(r as Proposta)}
        empty="Nenhuma proposta encontrada"
      />
      <Pagination page={page} total={total} limit={20} onChange={setPage} />

      {/* ── Modal Nova Proposta ──────────────────────────────────────────────── */}
      {showModal && (
        <Modal title="Nova Proposta" onClose={() => setShowModal(false)} size="lg">
          <form onSubmit={handleSave} noValidate className={styles.form}>

            {/* Dados gerais */}
            <div className={styles.formGrid2}>
              <label style={{ gridColumn: '1 / -1' }}>
                Título *
                <input
                  value={form.titulo}
                  onChange={e => updateForm({ titulo: e.target.value })}
                  placeholder="Ex: Proposta de serviços de TI"
                  className={formErrs.titulo ? styles.inputError : ''}
                />
                {formErrs.titulo && <span className={styles.fieldError}>{formErrs.titulo}</span>}
              </label>

              <label>
                Cliente *
                <select
                  value={form.clienteId}
                  onChange={e => updateForm({ clienteId: e.target.value })}
                  className={formErrs.clienteId ? styles.inputError : ''}
                >
                  <option value="">Selecione o cliente...</option>
                  {clientesList.map(c => (
                    <option key={c._id} value={c._id}>{c.nome}</option>
                  ))}
                </select>
                {formErrs.clienteId && <span className={styles.fieldError}>{formErrs.clienteId}</span>}
              </label>

              <label>
                Validade *
                <input
                  type="date"
                  value={form.validade}
                  onChange={e => updateForm({ validade: e.target.value })}
                  className={formErrs.validade ? styles.inputError : ''}
                />
                {formErrs.validade && <span className={styles.fieldError}>{formErrs.validade}</span>}
              </label>

              <label style={{ gridColumn: '1 / -1' }}>
                Oportunidade
                <input
                  value={form.oportunidade}
                  onChange={e => updateForm({ oportunidade: e.target.value })}
                  placeholder="Referência da oportunidade (opcional)"
                />
              </label>

              <label>
                Observações
                <textarea
                  rows={2}
                  value={form.observacoes}
                  onChange={e => updateForm({ observacoes: e.target.value })}
                  placeholder="Observações internas..."
                />
              </label>

              <label>
                Condições de Pagamento
                <textarea
                  rows={2}
                  value={form.condicoesPagamento}
                  onChange={e => updateForm({ condicoesPagamento: e.target.value })}
                  placeholder="Ex: 30/60/90 dias, boleto..."
                />
              </label>
            </div>

            {/* Seção de itens */}
            <div className={styles.formDivider}>
              <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Itens da Proposta
              </h4>
              <span className={styles.fieldHint}>{itens.length} item(s)</span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--surface-border)' }}>
                    <th style={thStyle('left', 200)}>Produto</th>
                    <th style={thStyle('right', 70)}>Qtd</th>
                    <th style={thStyle('right', 120)}>Preço Unit.</th>
                    <th style={thStyle('right', 80)}>Desc. %</th>
                    <th style={thStyle('right', 120)}>Subtotal</th>
                    <th style={{ width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {itens.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        style={{ textAlign: 'center', padding: '20px 8px', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.8rem' }}
                      >
                        Nenhum item. Clique em "+ Adicionar Item" para começar.
                      </td>
                    </tr>
                  ) : (
                    itens.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                        <td style={{ padding: '6px 8px' }}>
                          <select
                            value={item.produtoId}
                            onChange={e => onProdutoSelect(idx, e.target.value)}
                            style={inlineInput}
                          >
                            <option value="">Selecione...</option>
                            {produtosList.map(p => (
                              <option key={p._id} value={p._id}>{p.codigo} — {p.nome}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={item.quantidade}
                            onChange={e => updateItem(idx, { quantidade: Math.max(1, Number(e.target.value)) })}
                            style={{ ...inlineInput, textAlign: 'right' }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.precoUnitario}
                            onChange={e => updateItem(idx, { precoUnitario: Number(e.target.value) })}
                            style={{ ...inlineInput, textAlign: 'right' }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.1"
                            value={item.desconto}
                            onChange={e =>
                              updateItem(idx, {
                                desconto: Math.min(100, Math.max(0, Number(e.target.value))),
                              })
                            }
                            style={{ ...inlineInput, textAlign: 'right' }}
                          />
                        </td>
                        <td
                          style={{
                            padding: '6px 8px',
                            textAlign: 'right',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {fmtCurrency(item.subtotal)}
                        </td>
                        <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            style={{
                              background: 'none', border: 'none', color: 'var(--danger)',
                              cursor: 'pointer', fontSize: '1rem', padding: '2px 6px', lineHeight: 1,
                            }}
                            title="Remover item"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {itens.length > 0 && (
                  <tfoot>
                    <tr>
                      <td
                        colSpan={4}
                        style={{
                          padding: '10px 8px', textAlign: 'right',
                          fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-secondary)',
                        }}
                      >
                        Total da Proposta:
                      </td>
                      <td
                        style={{
                          padding: '10px 8px', textAlign: 'right',
                          fontWeight: 700, fontSize: '1rem', color: 'var(--accent)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {fmtCurrency(valorTotal)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <button
              type="button"
              className={styles.btnSecondary}
              onClick={addItem}
              style={{ alignSelf: 'flex-start', fontSize: '0.82rem', padding: '7px 14px' }}
            >
              + Adicionar Item
            </button>

            {saveError && <p className={styles.error}>{saveError}</p>}

            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setShowModal(false)}
              >
                Cancelar
              </button>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar Proposta'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Drawer de Detalhe ───────────────────────────────────────────────── */}
      {detalhe && (
        <div
          className={styles.drawerOverlay}
          onClick={e => { if (e.target === e.currentTarget) setDetalhe(null) }}
        >
          <div className={styles.drawer}>

            {/* Cabeçalho */}
            <div className={styles.drawerHead}>
              <div>
                <p className={styles.drawerTitle}>{detalhe.titulo}</p>
                <Badge label={detalhe.status} variant={statusVariant(detalhe.status)} />
              </div>
              <button className={styles.drawerClose} onClick={() => setDetalhe(null)}>✕</button>
            </div>

            {/* Campos gerais */}
            <dl className={styles.drawerDl}>
              <dt>Número</dt>
              <dd><strong>{detalhe.numero}</strong></dd>

              <dt>Cliente</dt>
              <dd>{nomeCliente(detalhe)}</dd>

              <dt>Valor Total</dt>
              <dd>
                <strong style={{ color: 'var(--accent)' }}>
                  {fmtCurrency(detalhe.valorTotal)}
                </strong>
              </dd>

              <dt>Validade</dt>
              <dd style={isValidadeExpirada(detalhe) ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
                {fmtDate(detalhe.validade)}
                {isValidadeExpirada(detalhe) && (
                  <span style={{ marginLeft: 6, fontSize: '0.72rem', opacity: 0.85 }}>— expirada</span>
                )}
              </dd>

              {detalhe.responsavelNome && (
                <>
                  <dt>Responsável</dt>
                  <dd>{detalhe.responsavelNome}</dd>
                </>
              )}

              {detalhe.condicoesPagamento && (
                <>
                  <dt>Cond. Pagamento</dt>
                  <dd>{detalhe.condicoesPagamento}</dd>
                </>
              )}

              {detalhe.observacoes && (
                <>
                  <dt>Observações</dt>
                  <dd>{detalhe.observacoes}</dd>
                </>
              )}

              {detalhe.aceiteEm && (
                <>
                  <dt>Aceite em</dt>
                  <dd>{fmtDate(detalhe.aceiteEm)}</dd>
                </>
              )}

              {detalhe.aceitePor && (
                <>
                  <dt>Aceito por</dt>
                  <dd>{detalhe.aceitePor}</dd>
                </>
              )}
            </dl>

            {/* Itens */}
            {detalhe.itens && detalhe.itens.length > 0 && (
              <div>
                <p style={{
                  fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px',
                }}>
                  Itens ({detalhe.itens.length})
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {detalhe.itens.map((it, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                        background: 'var(--surface-2)', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem',
                        gap: 8,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                          {it.nome || it.codigo}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                          {it.quantidade}x {fmtCurrency(it.precoUnitario)}
                          {it.desconto > 0 && (
                            <span style={{ marginLeft: 6, color: 'var(--warning)' }}>
                              −{it.desconto}%
                            </span>
                          )}
                        </div>
                      </div>
                      <strong style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                        {fmtCurrency(it.subtotal)}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ações */}
            <div className={styles.drawerFooter}>

              {/* Mudar Status */}
              {!changingStatus ? (
                <button
                  className={styles.btnSecondary}
                  onClick={() => { setChangingStatus(true); setNovoStatus(detalhe.status) }}
                >
                  Mudar Status
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <select
                    value={novoStatus}
                    onChange={e => setNovoStatus(e.target.value)}
                    style={{
                      padding: '8px 10px', border: '1px solid var(--input-border)',
                      borderRadius: 8, background: 'var(--input-bg)', color: 'var(--input-text)',
                      fontSize: '0.85rem', width: '100%',
                    }}
                  >
                    {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className={styles.btnPrimary}
                      onClick={handleMudarStatus}
                      disabled={submittingStatus || novoStatus === detalhe.status}
                      style={{ flex: 1, fontSize: '0.82rem' }}
                    >
                      {submittingStatus ? 'Aplicando...' : 'Aplicar'}
                    </button>
                    <button
                      className={styles.btnSecondary}
                      onClick={() => setChangingStatus(false)}
                      style={{ fontSize: '0.82rem' }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* Gerar Link de Aceite */}
              {!tokenUrl ? (
                <button
                  className={styles.btnSecondary}
                  onClick={handleGerarToken}
                  disabled={generatingToken}
                >
                  {generatingToken ? 'Gerando link...' : 'Gerar Link de Aceite'}
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <p style={{
                    fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0,
                  }}>
                    Link de Aceite
                  </p>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      readOnly
                      value={tokenUrl}
                      onClick={e => (e.target as HTMLInputElement).select()}
                      style={{
                        flex: 1, padding: '7px 10px', border: '1px solid var(--input-border)',
                        borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text-primary)',
                        fontSize: '0.75rem', outline: 'none',
                      }}
                    />
                    <button
                      className={styles.btnSecondary}
                      onClick={copyToken}
                      style={{ padding: '7px 12px', fontSize: '0.78rem', whiteSpace: 'nowrap' }}
                    >
                      {tokenCopied ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                  <button
                    className={styles.btnSecondary}
                    onClick={handleGerarToken}
                    disabled={generatingToken}
                    style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                  >
                    Regenerar
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Estilos utilitários inline ────────────────────────────────────────────────
function thStyle(align: 'left' | 'right', minWidth?: number): React.CSSProperties {
  return {
    textAlign: align,
    padding: '8px 8px',
    color: 'var(--text-muted)',
    fontWeight: 700,
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap',
    minWidth: minWidth ? `${minWidth}px` : undefined,
  }
}

const inlineInput: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid var(--input-border)',
  borderRadius: 6,
  background: 'var(--input-bg)',
  color: 'var(--input-text)',
  fontSize: '0.82rem',
  outline: 'none',
  boxSizing: 'border-box',
}
