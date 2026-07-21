import { useEffect, useState, useCallback } from 'react'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import { fmtDate, fmtCurrency } from '../utils/fmt'
import styles from './Page.module.css'

interface Oportunidade {
  _id: string
  titulo: string
  clienteId?: { _id: string; nome: string } | string
  nomeContato?: string
  emailContato?: string
  etapa: string
  valor?: number
  probabilidade: number
  dataPrevisaoFechamento?: string
  origem?: string
  responsavelNome?: string
  observacoes?: string
  motivoPerda?: string
  tags: string[]
}

interface KpisFunil {
  totalAberto: number
  valorEstimado: number
  porEtapa: Array<{ etapa: string; count: number; valor: number }>
}

interface OportunidadeForm {
  titulo: string
  nomeContato: string
  emailContato: string
  etapa: string
  valor: string
  probabilidade: string
  dataPrevisaoFechamento: string
  origem: string
  observacoes: string
}

const ETAPAS = ['Contato', 'Qualificado', 'Proposta', 'Negociação', 'Fechado Ganho', 'Fechado Perdido'] as const
type Etapa = typeof ETAPAS[number]

const ETAPA_COLORS: Record<string, string> = {
  Contato: '#64748b',
  Qualificado: '#3b82f6',
  Proposta: '#f59e0b',
  Negociação: '#8b5cf6',
  'Fechado Ganho': '#22c55e',
  'Fechado Perdido': '#ef4444',
}

const BLANK: OportunidadeForm = {
  titulo: '',
  nomeContato: '',
  emailContato: '',
  etapa: 'Contato',
  valor: '',
  probabilidade: '50',
  dataPrevisaoFechamento: '',
  origem: '',
  observacoes: '',
}

function getToken() { return localStorage.getItem('token') || '' }

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }
}

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, headers: { ...authHeaders(), ...(opts?.headers ?? {}) } })
  if (res.status === 401) { localStorage.removeItem('token'); window.location.href = '/login'; throw new Error('Não autorizado') }
  if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.message || `Erro ${res.status}`) }
  return res.json()
}

export default function CrmOportunidades() {
  const [oportunidades, setOportunidades] = useState<Oportunidade[]>([])
  const [kpis, setKpis] = useState<KpisFunil | null>(null)
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Oportunidade | null>(null)
  const [form, setForm] = useState<OportunidadeForm>(BLANK)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [detalhe, setDetalhe] = useState<Oportunidade | null>(null)
  const [showPerdido, setShowPerdido] = useState(false)
  const [motivoPerdaInput, setMotivoPerdaInput] = useState('')
  const [movendo, setMovendo] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (busca) params.set('busca', busca)
      const data = await apiFetch(`/api/crm/oportunidades?${params}`)
      setOportunidades(data.data ?? [])
      if (data.kpis) setKpis(data.kpis)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [busca])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditing(null)
    setForm(BLANK)
    setFormError('')
    setShowModal(true)
  }

  function openEdit(o: Oportunidade) {
    setEditing(o)
    setForm({
      titulo: o.titulo,
      nomeContato: o.nomeContato ?? '',
      emailContato: o.emailContato ?? '',
      etapa: o.etapa,
      valor: o.valor != null ? String(o.valor) : '',
      probabilidade: String(o.probabilidade),
      dataPrevisaoFechamento: o.dataPrevisaoFechamento ? o.dataPrevisaoFechamento.slice(0, 10) : '',
      origem: o.origem ?? '',
      observacoes: o.observacoes ?? '',
    })
    setFormError('')
    setShowModal(true)
  }

  function updateForm(patch: Partial<OportunidadeForm>) {
    setForm(prev => ({ ...prev, ...patch }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.titulo.trim()) { setFormError('Título é obrigatório'); return }
    if (!form.etapa) { setFormError('Etapa é obrigatória'); return }
    setSaving(true); setFormError('')
    const payload = {
      titulo: form.titulo.trim(),
      nomeContato: form.nomeContato || undefined,
      emailContato: form.emailContato || undefined,
      etapa: form.etapa,
      valor: form.valor !== '' ? Number(form.valor) : undefined,
      probabilidade: Number(form.probabilidade),
      dataPrevisaoFechamento: form.dataPrevisaoFechamento || undefined,
      origem: form.origem || undefined,
      observacoes: form.observacoes || undefined,
    }
    try {
      if (editing) {
        const result = await apiFetch(`/api/crm/oportunidades/${editing._id}`, { method: 'PUT', body: JSON.stringify(payload) })
        const fresh: Oportunidade = result.data ?? result
        setOportunidades(prev => prev.map(o => o._id === editing._id ? fresh : o))
        if (detalhe?._id === editing._id) setDetalhe(fresh)
      } else {
        await apiFetch('/api/crm/oportunidades', { method: 'POST', body: JSON.stringify(payload) })
        load()
      }
      setShowModal(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  async function handleMoverProxima(o: Oportunidade) {
    const idx = ETAPAS.indexOf(o.etapa as Etapa)
    if (idx < 0 || idx >= ETAPAS.length - 2) return
    setMovendo(true)
    try {
      const result = await apiFetch(`/api/crm/oportunidades/${o._id}`, {
        method: 'PUT',
        body: JSON.stringify({ etapa: ETAPAS[idx + 1] }),
      })
      const fresh: Oportunidade = result.data ?? result
      setOportunidades(prev => prev.map(x => x._id === o._id ? fresh : x))
      setDetalhe(fresh)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao mover etapa')
    } finally { setMovendo(false) }
  }

  async function handleFecharPerdido(o: Oportunidade) {
    if (!motivoPerdaInput.trim()) { alert('Informe o motivo da perda'); return }
    setMovendo(true)
    try {
      const result = await apiFetch(`/api/crm/oportunidades/${o._id}`, {
        method: 'PUT',
        body: JSON.stringify({ etapa: 'Fechado Perdido', motivoPerda: motivoPerdaInput.trim() }),
      })
      const fresh: Oportunidade = result.data ?? result
      setOportunidades(prev => prev.map(x => x._id === o._id ? fresh : x))
      setDetalhe(fresh)
      setShowPerdido(false)
      setMotivoPerdaInput('')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao fechar oportunidade')
    } finally { setMovendo(false) }
  }

  function closeDrawer() {
    setDetalhe(null)
    setShowPerdido(false)
    setMotivoPerdaInput('')
  }

  const filtered = busca
    ? oportunidades.filter(o =>
        o.titulo.toLowerCase().includes(busca.toLowerCase()) ||
        (o.nomeContato ?? '').toLowerCase().includes(busca.toLowerCase())
      )
    : oportunidades

  const totalAberto = kpis?.totalAberto ?? filtered.filter(o => !['Fechado Ganho', 'Fechado Perdido'].includes(o.etapa)).length
  const valorEstimado = kpis?.valorEstimado ?? filtered.reduce((s, o) => s + (o.valor ?? 0), 0)
  const kpiPorEtapa = kpis?.porEtapa ?? ETAPAS.map(etapa => ({
    etapa,
    count: filtered.filter(o => o.etapa === etapa).length,
    valor: filtered.filter(o => o.etapa === etapa).reduce((s, o) => s + (o.valor ?? 0), 0),
  }))
  const maxKpiCount = Math.max(...kpiPorEtapa.map(k => k.count), 1)

  const currentEtapaIdx = detalhe ? ETAPAS.indexOf(detalhe.etapa as Etapa) : -1
  const canMoveNext = currentEtapaIdx >= 0 && currentEtapaIdx < ETAPAS.length - 2

  return (
    <div className={styles.page} style={{ maxWidth: 'none' }}>
      <PageHeader
        title="CRM — Funil de Oportunidades"
        subtitle={`${totalAberto} oportunidades abertas`}
        action={<button className={styles.btnPrimary} onClick={openCreate}>+ Nova Oportunidade</button>}
      />

      {/* KPI row */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap', alignItems: 'stretch' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 12, padding: '14px 20px', minWidth: 150 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Abertas
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
            {totalAberto}
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 12, padding: '14px 20px', minWidth: 200 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Valor Estimado
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
            {fmtCurrency(valorEstimado)}
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 12, padding: '14px 20px', flex: 1, minWidth: 300 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Por Etapa
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {kpiPorEtapa.map(({ etapa, count }) => {
              const pct = (count / maxKpiCount) * 100
              const color = ETAPA_COLORS[etapa] ?? '#64748b'
              return (
                <div key={etapa} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', width: 116, flexShrink: 0 }}>{etapa}</span>
                  <div style={{ flex: 1, height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s ease' }} />
                  </div>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', width: 18, textAlign: 'right', flexShrink: 0 }}>
                    {count}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          className={styles.search}
          style={{ maxWidth: 320 }}
          placeholder="Buscar por título ou contato..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
      </div>

      {/* Kanban board */}
      {loading ? (
        <p style={{ color: 'var(--text-muted)', padding: '32px 0' }}>Carregando...</p>
      ) : (
        <div style={{ overflowX: 'auto', display: 'flex', gap: 12, paddingBottom: 24, alignItems: 'flex-start' }}>
          {ETAPAS.map(etapa => {
            const cards = filtered.filter(o => o.etapa === etapa)
            const color = ETAPA_COLORS[etapa]
            return (
              <div key={etapa} style={{ flex: '0 0 228px', minWidth: 228 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: '10px 10px 0 0',
                  background: `${color}14`,
                  borderBottom: `3px solid ${color}`,
                  marginBottom: 8,
                }}>
                  <span style={{ fontSize: '0.77rem', fontWeight: 700, color }}>{etapa}</span>
                  <span style={{
                    fontSize: '0.68rem', fontWeight: 700,
                    background: `${color}22`, color,
                    borderRadius: 8, padding: '1px 7px',
                  }}>{cards.length}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cards.length === 0 && (
                    <div style={{
                      fontSize: '0.73rem', color: 'var(--text-muted)', textAlign: 'center',
                      padding: '18px 8px',
                      border: '1px dashed var(--surface-border)', borderRadius: 8,
                    }}>
                      Sem oportunidades
                    </div>
                  )}
                  {cards.map(o => (
                    <KanbanCard key={o._id} o={o} color={color} onClick={() => setDetalhe(o)} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Detail drawer */}
      {detalhe && (
        <div className={styles.drawerOverlay} onClick={closeDrawer}>
          <aside className={styles.drawer} onClick={e => e.stopPropagation()}>
            <div className={styles.drawerHead}>
              <div>
                <h3 className={styles.drawerTitle}>{detalhe.titulo}</h3>
                <span style={{
                  display: 'inline-block', fontSize: '0.7rem', fontWeight: 700,
                  color: ETAPA_COLORS[detalhe.etapa] ?? '#64748b',
                  background: `${ETAPA_COLORS[detalhe.etapa] ?? '#64748b'}16`,
                  borderRadius: 6, padding: '2px 8px', marginTop: 4,
                }}>
                  {detalhe.etapa}
                </span>
              </div>
              <button className={styles.drawerClose} onClick={closeDrawer}>✕</button>
            </div>

            <dl className={styles.drawerDl} style={{ overflowY: 'auto', flex: 1 }}>
              {detalhe.nomeContato && <><dt>Contato</dt><dd>{detalhe.nomeContato}</dd></>}
              {detalhe.emailContato && <><dt>E-mail</dt><dd>{detalhe.emailContato}</dd></>}
              {detalhe.valor != null && <><dt>Valor</dt><dd>{fmtCurrency(detalhe.valor)}</dd></>}
              <dt>Probabilidade</dt><dd>{detalhe.probabilidade}%</dd>
              {detalhe.dataPrevisaoFechamento && <><dt>Prev. Fechamento</dt><dd>{fmtDate(detalhe.dataPrevisaoFechamento)}</dd></>}
              {detalhe.origem && <><dt>Origem</dt><dd>{detalhe.origem}</dd></>}
              {detalhe.responsavelNome && <><dt>Responsável</dt><dd>{detalhe.responsavelNome}</dd></>}
              {detalhe.observacoes && <><dt>Observações</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{detalhe.observacoes}</dd></>}
              {detalhe.motivoPerda && <><dt>Motivo Perda</dt><dd style={{ color: '#ef4444' }}>{detalhe.motivoPerda}</dd></>}
              {(detalhe.tags?.length ?? 0) > 0 && (
                <>
                  <dt>Tags</dt>
                  <dd style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {detalhe.tags.map(t => (
                      <span key={t} style={{ fontSize: '0.68rem', background: 'var(--surface-2)', color: 'var(--text-secondary)', borderRadius: 4, padding: '1px 6px' }}>
                        {t}
                      </span>
                    ))}
                  </dd>
                </>
              )}
            </dl>

            {showPerdido && (
              <div style={{ paddingTop: 12, borderTop: '1px solid var(--surface-border)' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  Motivo da Perda *
                  <textarea
                    rows={2}
                    value={motivoPerdaInput}
                    onChange={e => setMotivoPerdaInput(e.target.value)}
                    placeholder="Descreva o motivo da perda..."
                    style={{
                      padding: '8px 10px', borderRadius: 8,
                      border: '1px solid var(--input-border)',
                      background: 'var(--input-bg)', color: 'var(--input-text)',
                      fontSize: '0.82rem', resize: 'vertical',
                    }}
                  />
                </label>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    className={styles.btnSecondary}
                    onClick={() => { setShowPerdido(false); setMotivoPerdaInput('') }}
                    style={{ flex: 1 }}
                  >
                    Cancelar
                  </button>
                  <button
                    className={styles.btnDanger}
                    onClick={() => handleFecharPerdido(detalhe)}
                    disabled={movendo}
                    style={{ flex: 1 }}
                  >
                    {movendo ? 'Salvando...' : 'Confirmar Perda'}
                  </button>
                </div>
              </div>
            )}

            <div className={styles.drawerFooter}>
              <button className={styles.btnPrimary} onClick={() => openEdit(detalhe)}>
                Editar
              </button>
              {canMoveNext && (
                <button className={styles.btnSecondary} onClick={() => handleMoverProxima(detalhe)} disabled={movendo}>
                  {movendo ? 'Movendo...' : `Mover para ${ETAPAS[currentEtapaIdx + 1]}`}
                </button>
              )}
              {detalhe.etapa !== 'Fechado Perdido' && !showPerdido && (
                <button
                  onClick={() => setShowPerdido(true)}
                  style={{
                    background: '#ef444418', color: '#ef4444',
                    border: '1px solid #ef444430',
                    padding: '9px 18px', borderRadius: 8,
                    fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Fechar Perdido
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Create / Edit modal */}
      {showModal && (
        <Modal title={editing ? 'Editar Oportunidade' : 'Nova Oportunidade'} onClose={() => setShowModal(false)} size="lg">
          <form onSubmit={handleSave} noValidate className={styles.form}>
            <div className={styles.formGrid2}>
              <label style={{ gridColumn: 'span 2' }}>
                Título *
                <input
                  value={form.titulo}
                  onChange={e => updateForm({ titulo: e.target.value })}
                  className={formError && !form.titulo.trim() ? styles.inputError : ''}
                  autoFocus
                />
              </label>

              <label>
                Nome do Contato
                <input value={form.nomeContato} onChange={e => updateForm({ nomeContato: e.target.value })} />
              </label>
              <label>
                E-mail do Contato
                <input type="email" value={form.emailContato} onChange={e => updateForm({ emailContato: e.target.value })} />
              </label>

              <label>
                Etapa *
                <select value={form.etapa} onChange={e => updateForm({ etapa: e.target.value })}>
                  {ETAPAS.map(etapa => <option key={etapa} value={etapa}>{etapa}</option>)}
                </select>
              </label>
              <label>
                Origem
                <select value={form.origem} onChange={e => updateForm({ origem: e.target.value })}>
                  <option value="">Selecione...</option>
                  {['Site', 'Indicação', 'Ligação', 'E-mail', 'Evento', 'Outro'].map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </label>

              <label>
                Valor Estimado (R$)
                <input
                  type="number" min="0" step="0.01"
                  value={form.valor}
                  onChange={e => updateForm({ valor: e.target.value })}
                  placeholder="0,00"
                />
              </label>
              <label>
                Probabilidade (%)
                <input
                  type="number" min="0" max="100"
                  value={form.probabilidade}
                  onChange={e => updateForm({ probabilidade: e.target.value })}
                />
              </label>

              <label style={{ gridColumn: 'span 2' }}>
                Previsão de Fechamento
                <input
                  type="date"
                  value={form.dataPrevisaoFechamento}
                  onChange={e => updateForm({ dataPrevisaoFechamento: e.target.value })}
                />
              </label>

              <label style={{ gridColumn: 'span 2' }}>
                Observações
                <textarea
                  rows={3}
                  value={form.observacoes}
                  onChange={e => updateForm({ observacoes: e.target.value })}
                />
              </label>
            </div>

            {formError && <p className={styles.error}>{formError}</p>}

            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowModal(false)}>
                Cancelar
              </button>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

interface KanbanCardProps {
  o: Oportunidade
  color: string
  onClick: () => void
}

function KanbanCard({ o, color, onClick }: KanbanCardProps) {
  const [hovered, setHovered] = useState(false)
  const probColor = o.probabilidade >= 70 ? '#22c55e' : o.probabilidade >= 40 ? '#f59e0b' : '#ef4444'

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--surface-border)',
        borderLeft: `3px solid ${color}`,
        borderRadius: 10,
        padding: '10px 12px',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s, border-color 0.15s',
        boxShadow: hovered ? '0 2px 12px rgba(0,0,0,0.12)' : 'none',
      }}
    >
      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3, lineHeight: 1.35 }}>
        {o.titulo}
      </div>
      {o.nomeContato && (
        <div style={{ fontSize: '0.71rem', color: 'var(--text-secondary)', marginBottom: 5 }}>
          {o.nomeContato}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 6 }}>
        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-primary)' }}>
          {o.valor != null ? fmtCurrency(o.valor) : ''}
        </span>
        <span style={{
          fontSize: '0.68rem', fontWeight: 700,
          background: `${probColor}1a`, color: probColor,
          borderRadius: 6, padding: '1px 6px',
          flexShrink: 0,
        }}>
          {o.probabilidade}%
        </span>
      </div>
      {o.dataPrevisaoFechamento && (
        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 5 }}>
          Prev: {fmtDate(o.dataPrevisaoFechamento)}
        </div>
      )}
    </div>
  )
}
