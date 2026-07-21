import { useEffect, useState, useCallback, useRef } from 'react'
import PageHeader from '../components/PageHeader'
import Table from '../components/Table'
import Badge from '../components/Badge'
import Pagination from '../components/Pagination'
import Modal from '../components/Modal'
import { fmtDate } from '../utils/fmt'
import styles from './Page.module.css'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ModalidadeAtendimento = 'Presencial' | 'Videoconferência'
type StatusAtendimento =
  | 'Agendado'
  | 'Confirmado'
  | 'Em Atendimento'
  | 'Concluído'
  | 'Cancelado'
  | 'Reagendado'
  | 'Falta'

interface DadosTitular {
  nomeCompleto: string
  cpf: string
  dataNascimento?: string
  email: string
  telefone: string
  nomeMae?: string
  rg?: string
  rgOrgaoEmissor?: string
  cnh?: string
  enderecoCompleto?: string
  cnpj?: string
  razaoSocial?: string
}

interface DocumentoAR {
  _id: string
  tipo: string
  arquivoUrl?: string
  nomeOriginal?: string
  verificado: boolean
  observacao?: string
}

interface AtendimentoAR {
  _id: string
  numeroAtendimento: string
  titular: DadosTitular
  tipoCertificado: string
  midiaEmissao?: string
  modalidade: ModalidadeAtendimento
  dataAgendamento: string
  horaInicio: string
  duracao: number
  agenteResponsavelNome?: string
  unidade?: string
  documentos: DocumentoAR[]
  status: StatusAtendimento
  observacoes?: string
  linkVideoconferencia?: string
  biometriaRealizada?: boolean
  emitidoEm?: string
  numeroSerieCertificado?: string
  createdAt: string
}

interface KPIs {
  agendadosHoje: number
  confirmados: number
  emAtendimento: number
  concluidosMes: number
  faltas: number
}

interface ListagemResponse {
  data: AtendimentoAR[]
  total: number
  page: number
  limit: number
  pages: number
  kpis: KPIs
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api'

function token() { return localStorage.getItem('token') || '' }
function authHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }
}

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, { ...opts, headers: { ...authHeaders(), ...(opts?.headers ?? {}) } })
  if (res.status === 401) { localStorage.removeItem('token'); window.location.href = '/login'; throw new Error('Não autorizado') }
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error((b as { message?: string }).message || `Erro ${res.status}`) }
  return res.json() as Promise<T>
}

async function uploadDocumento(id: string, fd: FormData): Promise<AtendimentoAR> {
  const res = await fetch(`${BASE}/atendimento-ar/${id}/documento`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}` },
    body: fd,
  })
  if (res.status === 401) { localStorage.removeItem('token'); window.location.href = '/login'; throw new Error('Não autorizado') }
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error((b as { message?: string }).message || `Erro ${res.status}`) }
  return res.json()
}

function mascaraCPF(cpf?: string) {
  if (!cpf) return '—'
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11) return cpf
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.***.${d.slice(9, 11)}`
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

const TIPOS_CERT = [
  'e-CPF A1', 'e-CPF A3', 'e-CNPJ A1', 'e-CNPJ A3',
  'e-PJ', 'Bancário', 'NF-e A1', 'NF-e A3', 'Equipamento A3', 'Outro',
]

const MIDIAS = ['A1', 'A3-Token', 'A3-Cartão', 'A3-Nuvem']

const TIPOS_DOC = [
  'RG', 'CPF', 'CNH', 'Comprovante Residência', 'Procuração', 'Contrato Social', 'Outro',
]

const STATUS_LIST: StatusAtendimento[] = [
  'Agendado', 'Confirmado', 'Em Atendimento', 'Concluído', 'Cancelado', 'Reagendado', 'Falta',
]

type BadgeVariant = 'info' | 'success' | 'warning' | 'danger' | 'default'

function statusVariant(s: StatusAtendimento): BadgeVariant {
  switch (s) {
    case 'Agendado':      return 'info'
    case 'Confirmado':    return 'success'
    case 'Em Atendimento': return 'warning'
    case 'Concluído':     return 'success'
    case 'Cancelado':     return 'default'
    case 'Reagendado':    return 'info'
    case 'Falta':         return 'danger'
    default:              return 'default'
  }
}

function modalidadeVariant(m: ModalidadeAtendimento): BadgeVariant {
  return m === 'Presencial' ? 'info' : 'warning'
}

// ─── Formulário de agendamento ────────────────────────────────────────────────

interface FormAgendamento {
  tipoCertificado: string
  midiaEmissao: string
  modalidade: ModalidadeAtendimento | ''
  dataAgendamento: string
  horaInicio: string
  duracao: string
  agenteResponsavelNome: string
  unidade: string
  linkVideoconferencia: string
  observacoes: string
  // Titular
  nomeCompleto: string
  cpf: string
  dataNascimento: string
  email: string
  telefone: string
  nomeMae: string
  rg: string
  rgOrgaoEmissor: string
  cnpj: string
  razaoSocial: string
}

const BLANK_FORM: FormAgendamento = {
  tipoCertificado: '',
  midiaEmissao: '',
  modalidade: '',
  dataAgendamento: todayISO(),
  horaInicio: '09:00',
  duracao: '30',
  agenteResponsavelNome: '',
  unidade: '',
  linkVideoconferencia: '',
  observacoes: '',
  nomeCompleto: '',
  cpf: '',
  dataNascimento: '',
  email: '',
  telefone: '',
  nomeMae: '',
  rg: '',
  rgOrgaoEmissor: '',
  cnpj: '',
  razaoSocial: '',
}

function isECNPJ(tipo: string) {
  return tipo.startsWith('e-CNPJ') || tipo === 'e-PJ'
}

const LIMIT = 20

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function AtendimentoAR() {
  const [tab, setTab] = useState<'agenda' | 'todos'>('agenda')

  // ── Agenda
  const [agendaData, setAgendaData] = useState(todayISO())
  const [agendaItems, setAgendaItems] = useState<AtendimentoAR[]>([])
  const [agendaLoading, setAgendaLoading] = useState(false)

  // ── Todos
  const [rows, setRows]   = useState<AtendimentoAR[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage]   = useState(1)
  const [loading, setLoading] = useState(false)
  const [kpis, setKpis]   = useState<KPIs>({ agendadosHoje: 0, confirmados: 0, emAtendimento: 0, concluidosMes: 0, faltas: 0 })
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroModalidade, setFiltroModalidade] = useState('')
  const [busca, setBusca] = useState('')

  // ── Modal criação
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<FormAgendamento>(BLANK_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // ── Drawer detalhe
  const [detalhe, setDetalhe] = useState<AtendimentoAR | null>(null)
  const [atualizandoStatus, setAtualizandoStatus] = useState(false)
  const [obsStatus, setObsStatus] = useState('')

  // ── Documentos no drawer
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [novoDocTipo, setNovoDocTipo] = useState('')
  const [novoDocObs, setNovoDocObs] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Carregamento agenda ───────────────────────────────────────────────────

  const loadAgenda = useCallback(async () => {
    setAgendaLoading(true)
    try {
      const data = await apiFetch<AtendimentoAR[]>(`/atendimento-ar/agenda/${agendaData}`)
      setAgendaItems(data)
    } catch {
      setAgendaItems([])
    } finally {
      setAgendaLoading(false)
    }
  }, [agendaData])

  useEffect(() => { if (tab === 'agenda') loadAgenda() }, [tab, loadAgenda])

  // ── Carregamento listagem ─────────────────────────────────────────────────

  const loadTodos = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIMIT),
      })
      if (filtroStatus)     params.set('status', filtroStatus)
      if (filtroModalidade) params.set('modalidade', filtroModalidade)
      if (busca)            params.set('busca', busca)
      const res = await apiFetch<ListagemResponse>(`/atendimento-ar?${params}`)
      setRows(res.data)
      setTotal(res.total)
      setKpis(res.kpis)
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [page, filtroStatus, filtroModalidade, busca])

  useEffect(() => { if (tab === 'todos') loadTodos() }, [tab, loadTodos])

  // Recarregar KPIs mesmo na aba agenda
  useEffect(() => {
    apiFetch<ListagemResponse>(`/atendimento-ar?limit=1`)
      .then(r => setKpis(r.kpis))
      .catch(() => {})
  }, [])

  // ── Criar agendamento ─────────────────────────────────────────────────────

  function setF(patch: Partial<FormAgendamento>) {
    setForm(prev => ({ ...prev, ...patch }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nomeCompleto) { setFormError('Nome completo é obrigatório'); return }
    if (!form.cpf)          { setFormError('CPF é obrigatório'); return }
    if (!form.email)        { setFormError('E-mail é obrigatório'); return }
    if (!form.telefone)     { setFormError('Telefone é obrigatório'); return }
    if (!form.tipoCertificado) { setFormError('Tipo de certificado é obrigatório'); return }
    if (!form.modalidade)   { setFormError('Modalidade é obrigatória'); return }
    if (!form.dataAgendamento) { setFormError('Data é obrigatória'); return }
    if (!form.horaInicio)   { setFormError('Hora é obrigatória'); return }

    setSaving(true); setFormError('')
    try {
      await apiFetch<AtendimentoAR>('/atendimento-ar', {
        method: 'POST',
        body: JSON.stringify({
          tipoCertificado:      form.tipoCertificado,
          midiaEmissao:         form.midiaEmissao || undefined,
          modalidade:           form.modalidade,
          dataAgendamento:      form.dataAgendamento,
          horaInicio:           form.horaInicio,
          duracao:              Number(form.duracao) || 30,
          agenteResponsavelNome: form.agenteResponsavelNome || undefined,
          unidade:              form.unidade || undefined,
          linkVideoconferencia: form.linkVideoconferencia || undefined,
          observacoes:          form.observacoes || undefined,
          titular: {
            nomeCompleto:   form.nomeCompleto,
            cpf:            form.cpf,
            dataNascimento: form.dataNascimento || undefined,
            email:          form.email,
            telefone:       form.telefone,
            nomeMae:        form.nomeMae || undefined,
            rg:             form.rg || undefined,
            rgOrgaoEmissor: form.rgOrgaoEmissor || undefined,
            cnpj:           isECNPJ(form.tipoCertificado) ? form.cnpj || undefined : undefined,
            razaoSocial:    isECNPJ(form.tipoCertificado) ? form.razaoSocial || undefined : undefined,
          },
        }),
      })
      setShowModal(false)
      setForm(BLANK_FORM)
      loadAgenda()
      if (tab === 'todos') loadTodos()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  // ── Mudar status ──────────────────────────────────────────────────────────

  async function mudarStatus(newStatus: StatusAtendimento, obs?: string) {
    if (!detalhe) return
    setAtualizandoStatus(true)
    try {
      const updated = await apiFetch<AtendimentoAR>(`/atendimento-ar/${detalhe._id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus, observacoes: obs }),
      })
      setDetalhe(updated)
      setObsStatus('')
      loadAgenda()
      if (tab === 'todos') loadTodos()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao atualizar status')
    } finally {
      setAtualizandoStatus(false)
    }
  }

  // ── Upload documento ──────────────────────────────────────────────────────

  async function handleUploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !detalhe) return
    if (!novoDocTipo) { alert('Selecione o tipo do documento'); return }
    setUploadingDoc(true)
    try {
      const fd = new FormData()
      fd.append('arquivo', file)
      fd.append('tipo', novoDocTipo)
      if (novoDocObs) fd.append('observacao', novoDocObs)
      const updated = await uploadDocumento(detalhe._id, fd)
      setDetalhe(updated)
      setNovoDocTipo('')
      setNovoDocObs('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao enviar documento')
    } finally {
      setUploadingDoc(false)
    }
  }

  async function verificarDoc(docId: string, verificado: boolean) {
    if (!detalhe) return
    try {
      const updated = await apiFetch<AtendimentoAR>(`/atendimento-ar/${detalhe._id}/documento/${docId}/verificar`, {
        method: 'PATCH',
        body: JSON.stringify({ verificado }),
      })
      setDetalhe(updated)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro')
    }
  }

  // ── Abrir detalhe ─────────────────────────────────────────────────────────

  async function openDetalhe(id: string) {
    try {
      const at = await apiFetch<AtendimentoAR>(`/atendimento-ar/${id}`)
      setDetalhe(at)
      setObsStatus('')
    } catch {
      alert('Erro ao carregar atendimento')
    }
  }

  // ─── Colunas da tabela ────────────────────────────────────────────────────

  const columns = [
    {
      key: 'numeroAtendimento',
      header: 'Número',
      render: (r: AtendimentoAR) => (
        <span style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--accent)' }}>
          {r.numeroAtendimento}
        </span>
      ),
    },
    {
      key: 'titular',
      header: 'Titular',
      render: (r: AtendimentoAR) => (
        <span>
          <span style={{ display: 'block', fontWeight: 600 }}>{r.titular.nomeCompleto}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.titular.email}</span>
        </span>
      ),
    },
    {
      key: 'cpf',
      header: 'CPF',
      render: (r: AtendimentoAR) => (
        <span style={{ fontSize: '0.82rem', fontFamily: 'monospace' }}>
          {mascaraCPF(r.titular.cpf)}
        </span>
      ),
    },
    {
      key: 'tipoCertificado',
      header: 'Tipo',
      render: (r: AtendimentoAR) => (
        <span style={{ fontSize: '0.82rem' }}>{r.tipoCertificado}</span>
      ),
    },
    {
      key: 'modalidade',
      header: 'Modalidade',
      render: (r: AtendimentoAR) => (
        <Badge label={r.modalidade} variant={modalidadeVariant(r.modalidade)} />
      ),
    },
    {
      key: 'dataHora',
      header: 'Data / Hora',
      render: (r: AtendimentoAR) => (
        <span style={{ fontSize: '0.82rem' }}>
          {fmtDate(r.dataAgendamento)} {r.horaInicio}
        </span>
      ),
    },
    {
      key: 'agente',
      header: 'Agente',
      render: (r: AtendimentoAR) => (
        <span style={{ fontSize: '0.82rem' }}>{r.agenteResponsavelNome || '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r: AtendimentoAR) => (
        <Badge label={r.status} variant={statusVariant(r.status)} />
      ),
    },
    {
      key: '_actions',
      header: '',
      width: '80px',
      render: (r: AtendimentoAR) => (
        <div className={styles.rowActions}>
          <button className={styles.btnLink} onClick={e => { e.stopPropagation(); openDetalhe(r._id) }}>
            Ver
          </button>
        </div>
      ),
    },
  ]

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <PageHeader
        title="Atendimento AR — ICP-Brasil"
        subtitle="Autoridade de Registro"
        action={
          <button className={styles.btnPrimary} onClick={() => { setForm(BLANK_FORM); setFormError(''); setShowModal(true) }}>
            + Novo Agendamento
          </button>
        }
      />

      {/* ── Tabs ────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--surface-border)', paddingBottom: 0 }}>
        {(['agenda', 'todos'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: tab === t ? 700 : 500,
              fontSize: '0.875rem',
              padding: '8px 16px',
              cursor: 'pointer',
              marginBottom: '-1px',
              transition: 'all 0.15s',
            }}
          >
            {t === 'agenda' ? 'Agenda do Dia' : 'Todos os Atendimentos'}
          </button>
        ))}
      </div>

      {/* ── Tab: Agenda do Dia ───────────────────────────── */}
      {tab === 'agenda' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              Data
              <input
                type="date"
                value={agendaData}
                onChange={e => setAgendaData(e.target.value)}
                style={{
                  padding: '8px 12px',
                  border: '1px solid var(--input-border)',
                  borderRadius: 8,
                  fontSize: '0.875rem',
                  color: 'var(--input-text)',
                  background: 'var(--input-bg)',
                  outline: 'none',
                }}
              />
            </label>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 20 }}>
              {agendaLoading ? 'Carregando...' : `${agendaItems.length} atendimento(s)`}
            </span>
          </div>

          {agendaItems.length === 0 && !agendaLoading ? (
            <div style={{
              textAlign: 'center', padding: '48px 0',
              color: 'var(--text-muted)', fontSize: '0.9rem',
            }}>
              Nenhum atendimento neste dia.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {agendaItems.map(item => (
                <div
                  key={item._id}
                  onClick={() => openDetalhe(item._id)}
                  style={{
                    display: 'flex',
                    gap: 16,
                    alignItems: 'flex-start',
                    background: 'var(--surface)',
                    border: '1px solid var(--surface-border)',
                    borderRadius: 10,
                    padding: '14px 18px',
                    cursor: 'pointer',
                    transition: 'box-shadow 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.12)')}
                  onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}
                >
                  {/* Hora */}
                  <div style={{
                    minWidth: 50, fontWeight: 700, fontSize: '1rem',
                    color: 'var(--accent)', paddingTop: 2, textAlign: 'center',
                  }}>
                    {item.horaInicio}
                  </div>
                  {/* Separador */}
                  <div style={{ width: 2, background: 'var(--surface-border)', borderRadius: 2, alignSelf: 'stretch' }} />
                  {/* Conteúdo */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{item.titular.nomeCompleto}</span>
                      <Badge label={item.tipoCertificado} variant="default" />
                      <Badge label={item.modalidade} variant={modalidadeVariant(item.modalidade)} />
                      <Badge label={item.status} variant={statusVariant(item.status)} />
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {item.agenteResponsavelNome && <span>Agente: <b>{item.agenteResponsavelNome}</b></span>}
                      {item.unidade && <span>Unidade: <b>{item.unidade}</b></span>}
                      <span>{item.duracao} min</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{item.numeroAtendimento}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Todos os Atendimentos ───────────────────── */}
      {tab === 'todos' && (
        <div>
          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Agendados Hoje', value: kpis.agendadosHoje, color: 'var(--accent)' },
              { label: 'Confirmados', value: kpis.confirmados, color: 'var(--success)' },
              { label: 'Em Atendimento', value: kpis.emAtendimento, color: '#f59e0b' },
              { label: 'Concluídos (mês)', value: kpis.concluidosMes, color: 'var(--success)' },
              { label: 'Faltas (mês)', value: kpis.faltas, color: 'var(--danger)' },
            ].map(kpi => (
              <div
                key={kpi.label}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--surface-border)',
                  borderRadius: 10,
                  padding: '14px 16px',
                }}
              >
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  {kpi.label}
                </div>
                <div style={{ fontSize: '1.7rem', fontWeight: 800, color: kpi.color, lineHeight: 1 }}>
                  {kpi.value}
                </div>
              </div>
            ))}
          </div>

          {/* Filtros */}
          <div className={styles.filters}>
            <input
              className={styles.search}
              placeholder="Buscar por nome / número..."
              value={busca}
              onChange={e => { setBusca(e.target.value); setPage(1) }}
            />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select
                value={filtroStatus}
                onChange={e => { setFiltroStatus(e.target.value); setPage(1) }}
                style={{
                  padding: '8px 10px', border: '1px solid var(--input-border)', borderRadius: 8,
                  fontSize: '0.875rem', background: 'var(--input-bg)', color: 'var(--text-secondary)', outline: 'none',
                }}
              >
                <option value="">Todos os status</option>
                {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select
                value={filtroModalidade}
                onChange={e => { setFiltroModalidade(e.target.value); setPage(1) }}
                style={{
                  padding: '8px 10px', border: '1px solid var(--input-border)', borderRadius: 8,
                  fontSize: '0.875rem', background: 'var(--input-bg)', color: 'var(--text-secondary)', outline: 'none',
                }}
              >
                <option value="">Todas as modalidades</option>
                <option value="Presencial">Presencial</option>
                <option value="Videoconferência">Videoconferência</option>
              </select>
            </div>
          </div>

          <Table<AtendimentoAR>
            columns={columns}
            rows={rows}
            loading={loading}
            empty="Nenhum atendimento encontrado"
            onRowClick={r => openDetalhe(r._id)}
          />
          <Pagination page={page} total={total} limit={LIMIT} onChange={setPage} />
        </div>
      )}

      {/* ── Modal: Novo Agendamento ──────────────────────── */}
      {showModal && (
        <Modal title="Novo Agendamento AR" onClose={() => setShowModal(false)} size="lg">
          <form onSubmit={handleSave} noValidate className={styles.form}>

            {/* Certificado e Agendamento */}
            <div className={styles.formDivider}>
              <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)' }}>Certificado &amp; Agendamento</span>
            </div>
            <div className={styles.formGrid2}>
              <label>Tipo de Certificado *
                <select value={form.tipoCertificado} onChange={e => setF({ tipoCertificado: e.target.value })}>
                  <option value="">Selecione...</option>
                  {TIPOS_CERT.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label>Mídia de Emissão
                <select value={form.midiaEmissao} onChange={e => setF({ midiaEmissao: e.target.value })}>
                  <option value="">Selecione...</option>
                  {MIDIAS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label>Modalidade *
                <select value={form.modalidade} onChange={e => setF({ modalidade: e.target.value as ModalidadeAtendimento })}>
                  <option value="">Selecione...</option>
                  <option value="Presencial">Presencial</option>
                  <option value="Videoconferência">Videoconferência</option>
                </select>
              </label>
              <label>Data *
                <input type="date" value={form.dataAgendamento} onChange={e => setF({ dataAgendamento: e.target.value })} />
              </label>
              <label>Hora Início *
                <input type="time" value={form.horaInicio} onChange={e => setF({ horaInicio: e.target.value })} />
              </label>
              <label>Duração (minutos)
                <input type="number" min={10} step={5} value={form.duracao} onChange={e => setF({ duracao: e.target.value })} />
              </label>
              <label>Agente Responsável
                <input value={form.agenteResponsavelNome} onChange={e => setF({ agenteResponsavelNome: e.target.value })} placeholder="Nome do agente" />
              </label>
              <label>Unidade
                <input value={form.unidade} onChange={e => setF({ unidade: e.target.value })} placeholder="Unidade de atendimento" />
              </label>
              {form.modalidade === 'Videoconferência' && (
                <label style={{ gridColumn: '1 / -1' }}>Link Videoconferência
                  <input value={form.linkVideoconferencia} onChange={e => setF({ linkVideoconferencia: e.target.value })} placeholder="https://..." />
                </label>
              )}
            </div>

            {/* Dados do Titular */}
            <div className={styles.formDivider}>
              <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)' }}>Dados do Titular</span>
            </div>
            <div className={styles.formGrid2}>
              <label style={{ gridColumn: '1 / -1' }}>Nome Completo *
                <input value={form.nomeCompleto} onChange={e => setF({ nomeCompleto: e.target.value })} placeholder="Nome completo do titular" />
              </label>
              <label>CPF *
                <input value={form.cpf} onChange={e => setF({ cpf: e.target.value })} placeholder="000.000.000-00" />
              </label>
              <label>Data de Nascimento
                <input type="date" value={form.dataNascimento} onChange={e => setF({ dataNascimento: e.target.value })} />
              </label>
              <label>E-mail *
                <input type="email" value={form.email} onChange={e => setF({ email: e.target.value })} placeholder="email@dominio.com" />
              </label>
              <label>Telefone *
                <input value={form.telefone} onChange={e => setF({ telefone: e.target.value })} placeholder="(00) 00000-0000" />
              </label>
              <label>Nome da Mãe
                <input value={form.nomeMae} onChange={e => setF({ nomeMae: e.target.value })} />
              </label>
              <label>RG
                <input value={form.rg} onChange={e => setF({ rg: e.target.value })} />
              </label>
              <label>Órgão Emissor RG
                <input value={form.rgOrgaoEmissor} onChange={e => setF({ rgOrgaoEmissor: e.target.value })} placeholder="SSP/SP" />
              </label>
              {isECNPJ(form.tipoCertificado) && (
                <>
                  <label>CNPJ
                    <input value={form.cnpj} onChange={e => setF({ cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
                  </label>
                  <label>Razão Social
                    <input value={form.razaoSocial} onChange={e => setF({ razaoSocial: e.target.value })} />
                  </label>
                </>
              )}
            </div>

            <label>Observações
              <textarea rows={2} value={form.observacoes} onChange={e => setF({ observacoes: e.target.value })} placeholder="Observações gerais..." />
            </label>

            {formError && <p className={styles.error}>{formError}</p>}

            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowModal(false)}>
                Cancelar
              </button>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>
                {saving ? 'Salvando...' : 'Agendar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Drawer: Detalhe do Atendimento ──────────────── */}
      {detalhe && (
        <div className={styles.drawerOverlay} onClick={e => { if (e.target === e.currentTarget) setDetalhe(null) }}>
          <div className={styles.drawer} style={{ width: 440, maxWidth: '96vw' }}>
            {/* Cabeçalho */}
            <div className={styles.drawerHead}>
              <div>
                <p className={styles.drawerTitle}>{detalhe.titular.nomeCompleto}</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {detalhe.numeroAtendimento}
                  </span>
                  <Badge label={detalhe.status} variant={statusVariant(detalhe.status)} />
                  <Badge label={detalhe.modalidade} variant={modalidadeVariant(detalhe.modalidade)} />
                </div>
              </div>
              <button className={styles.drawerClose} onClick={() => setDetalhe(null)}>✕</button>
            </div>

            {/* Corpo com scroll */}
            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Agendamento */}
              <section>
                <p className={styles.panelTitle}>Agendamento</p>
                <dl className={styles.drawerDl}>
                  <dt>Data</dt>      <dd>{fmtDate(detalhe.dataAgendamento)} {detalhe.horaInicio}</dd>
                  <dt>Duração</dt>   <dd>{detalhe.duracao} min</dd>
                  <dt>Tipo Cert.</dt><dd>{detalhe.tipoCertificado}</dd>
                  {detalhe.midiaEmissao && <><dt>Mídia</dt><dd>{detalhe.midiaEmissao}</dd></>}
                  {detalhe.agenteResponsavelNome && <><dt>Agente</dt><dd>{detalhe.agenteResponsavelNome}</dd></>}
                  {detalhe.unidade && <><dt>Unidade</dt><dd>{detalhe.unidade}</dd></>}
                  {detalhe.linkVideoconferencia && (
                    <><dt>Link</dt><dd><a href={detalhe.linkVideoconferencia} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontSize: '0.8rem' }}>Abrir</a></dd></>
                  )}
                </dl>
              </section>

              {/* Titular */}
              <section>
                <p className={styles.panelTitle}>Dados do Titular</p>
                <dl className={styles.drawerDl}>
                  <dt>CPF</dt>       <dd style={{ fontFamily: 'monospace' }}>{detalhe.titular.cpf}</dd>
                  <dt>E-mail</dt>    <dd>{detalhe.titular.email}</dd>
                  <dt>Telefone</dt>  <dd>{detalhe.titular.telefone}</dd>
                  {detalhe.titular.dataNascimento && <><dt>Nascimento</dt><dd>{fmtDate(detalhe.titular.dataNascimento)}</dd></>}
                  {detalhe.titular.nomeMae && <><dt>Nome da Mãe</dt><dd>{detalhe.titular.nomeMae}</dd></>}
                  {detalhe.titular.rg && (
                    <><dt>RG</dt><dd>{detalhe.titular.rg} {detalhe.titular.rgOrgaoEmissor && `/ ${detalhe.titular.rgOrgaoEmissor}`}</dd></>
                  )}
                  {detalhe.titular.cnpj && <><dt>CNPJ</dt><dd>{detalhe.titular.cnpj}</dd></>}
                  {detalhe.titular.razaoSocial && <><dt>Razão Social</dt><dd>{detalhe.titular.razaoSocial}</dd></>}
                  {detalhe.titular.enderecoCompleto && <><dt>Endereço</dt><dd>{detalhe.titular.enderecoCompleto}</dd></>}
                </dl>
              </section>

              {/* Emissão */}
              {(detalhe.emitidoEm || detalhe.numeroSerieCertificado || detalhe.biometriaRealizada !== undefined) && (
                <section>
                  <p className={styles.panelTitle}>Emissão</p>
                  <dl className={styles.drawerDl}>
                    {detalhe.emitidoEm && <><dt>Emitido em</dt><dd>{fmtDate(detalhe.emitidoEm)}</dd></>}
                    {detalhe.numeroSerieCertificado && <><dt>Nº Série</dt><dd style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{detalhe.numeroSerieCertificado}</dd></>}
                    {detalhe.biometriaRealizada !== undefined && <><dt>Biometria</dt><dd>{detalhe.biometriaRealizada ? 'Realizada' : 'Não realizada'}</dd></>}
                  </dl>
                </section>
              )}

              {/* Observações */}
              {detalhe.observacoes && (
                <section>
                  <p className={styles.panelTitle}>Observações</p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.5 }}>
                    {detalhe.observacoes}
                  </p>
                </section>
              )}

              {/* Documentos */}
              <section>
                <p className={styles.panelTitle}>Documentos</p>
                {detalhe.documentos.length === 0 ? (
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>Nenhum documento enviado.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {detalhe.documentos.map(doc => (
                      <div
                        key={doc._id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          background: 'var(--surface-2)', borderRadius: 8, padding: '8px 12px',
                          border: '1px solid var(--surface-border)',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{doc.tipo}</span>
                          {doc.nomeOriginal && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>{doc.nomeOriginal}</span>
                          )}
                          {doc.observacao && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>{doc.observacao}</span>
                          )}
                        </div>
                        {doc.arquivoUrl && (
                          <a
                            href={doc.arquivoUrl} target="_blank" rel="noreferrer"
                            style={{ fontSize: '0.75rem', color: 'var(--accent)', whiteSpace: 'nowrap' }}
                          >
                            Ver
                          </a>
                        )}
                        <button
                          onClick={() => verificarDoc(doc._id, !doc.verificado)}
                          style={{
                            background: doc.verificado ? 'var(--success-bg)' : 'var(--surface)',
                            color: doc.verificado ? 'var(--success)' : 'var(--text-muted)',
                            border: `1px solid ${doc.verificado ? 'var(--success)' : 'var(--surface-border)'}`,
                            borderRadius: 6, padding: '3px 8px', fontSize: '0.72rem', fontWeight: 700,
                            cursor: 'pointer', whiteSpace: 'nowrap',
                          }}
                        >
                          {doc.verificado ? 'Verificado' : 'Verificar'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload novo documento */}
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select
                      value={novoDocTipo}
                      onChange={e => setNovoDocTipo(e.target.value)}
                      style={{
                        flex: 1, padding: '6px 8px', border: '1px solid var(--input-border)',
                        borderRadius: 6, fontSize: '0.8rem', background: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none',
                      }}
                    >
                      <option value="">Tipo do documento...</option>
                      {TIPOS_DOC.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input
                      value={novoDocObs}
                      onChange={e => setNovoDocObs(e.target.value)}
                      placeholder="Observação"
                      style={{
                        flex: 1, padding: '6px 8px', border: '1px solid var(--input-border)',
                        borderRadius: 6, fontSize: '0.8rem', background: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none',
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                    disabled={uploadingDoc}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadingDoc ? 'Enviando...' : 'Anexar documento'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.docx"
                    style={{ display: 'none' }}
                    onChange={handleUploadDoc}
                  />
                </div>
              </section>

              {/* Atualizar status — campo obs para Falta/Cancelado */}
              {(detalhe.status === 'Confirmado' || detalhe.status === 'Em Atendimento') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Observação ao mudar status
                    <input
                      value={obsStatus}
                      onChange={e => setObsStatus(e.target.value)}
                      placeholder="Opcional..."
                      style={{
                        marginTop: 4, padding: '7px 10px', border: '1px solid var(--input-border)',
                        borderRadius: 6, fontSize: '0.82rem', background: 'var(--input-bg)',
                        color: 'var(--input-text)', outline: 'none', width: '100%', boxSizing: 'border-box',
                      }}
                    />
                  </label>
                </div>
              )}

            </div>

            {/* Rodapé com ações */}
            <div className={styles.drawerFooter}>
              {detalhe.status === 'Agendado' && (
                <>
                  <button
                    className={styles.btnPrimary}
                    disabled={atualizandoStatus}
                    onClick={() => mudarStatus('Confirmado')}
                    style={{ width: '100%' }}
                  >
                    Confirmar Atendimento
                  </button>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className={styles.btnSecondary}
                      disabled={atualizandoStatus}
                      onClick={() => mudarStatus('Reagendado', obsStatus || undefined)}
                      style={{ flex: 1 }}
                    >
                      Reagendar
                    </button>
                    <button
                      className={styles.btnDanger}
                      disabled={atualizandoStatus}
                      onClick={() => mudarStatus('Falta', obsStatus || undefined)}
                      style={{ flex: 1 }}
                    >
                      Registrar Falta
                    </button>
                    <button
                      className={styles.btnDanger}
                      disabled={atualizandoStatus}
                      onClick={() => mudarStatus('Cancelado', obsStatus || undefined)}
                      style={{ flex: 1 }}
                    >
                      Cancelar
                    </button>
                  </div>
                </>
              )}
              {detalhe.status === 'Confirmado' && (
                <>
                  <button
                    className={styles.btnPrimary}
                    disabled={atualizandoStatus}
                    onClick={() => mudarStatus('Em Atendimento', obsStatus || undefined)}
                    style={{ width: '100%' }}
                  >
                    Iniciar Atendimento
                  </button>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className={styles.btnDanger}
                      disabled={atualizandoStatus}
                      onClick={() => mudarStatus('Falta', obsStatus || undefined)}
                      style={{ flex: 1 }}
                    >
                      Registrar Falta
                    </button>
                    <button
                      className={styles.btnDanger}
                      disabled={atualizandoStatus}
                      onClick={() => mudarStatus('Cancelado', obsStatus || undefined)}
                      style={{ flex: 1 }}
                    >
                      Cancelar
                    </button>
                  </div>
                </>
              )}
              {detalhe.status === 'Em Atendimento' && (
                <button
                  className={styles.btnPrimary}
                  disabled={atualizandoStatus}
                  onClick={() => mudarStatus('Concluído', obsStatus || undefined)}
                  style={{ width: '100%', background: 'var(--success)', color: '#fff' }}
                >
                  Concluir Atendimento
                </button>
              )}
              {(detalhe.status === 'Concluído' || detalhe.status === 'Cancelado' || detalhe.status === 'Falta') && (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
                  Atendimento {detalhe.status.toLowerCase()}
                  {detalhe.emitidoEm && ` em ${fmtDate(detalhe.emitidoEm)}`}.
                </p>
              )}
              {detalhe.status === 'Reagendado' && (
                <button
                  className={styles.btnSecondary}
                  disabled={atualizandoStatus}
                  onClick={() => mudarStatus('Agendado')}
                  style={{ width: '100%' }}
                >
                  Confirmar Novo Horário
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
