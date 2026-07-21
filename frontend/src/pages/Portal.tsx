import { useEffect, useState, useRef } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { useParams } from 'react-router-dom'
import AtlasLogo from '../components/AtlasLogo'
import { fmtDate, fmtDateTime } from '../utils/fmt'

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface TokenInfo {
  id: string
  escopo: 'acompanhamento' | 'envio_documentos' | 'aceite' | 'formulario_icp' | 'completo'
  expiresAt: string
  acessos: number
}

interface PedidoPortal {
  numero: string
  status: string
  etapa?: string
  dataPrazo?: string
  itens?: Array<{ descricao: string; quantidade: number }>
  historico?: Array<{ data: string; etapa?: string; descricao?: string; tipo?: string }>
  createdAt: string
}

interface ClientePortal {
  nome: string
  email: string
}

interface SubmissionResumo {
  _id: string
  tipo: string
  status: string
  createdAt: string
  arquivos: number
  observacao?: string
}

interface PortalData {
  token: TokenInfo
  pedido: PedidoPortal
  cliente: ClientePortal
  submissions: SubmissionResumo[]
}

// ─── Estilos inline ───────────────────────────────────────────────────────────

const s = {
  page: {
    minHeight: '100vh',
    background: '#f1f5f9',
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    color: '#1e293b',
  } as React.CSSProperties,
  header: {
    background: '#1d4ed8',
    padding: '20px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as React.CSSProperties,
  container: {
    maxWidth: 640,
    margin: '0 auto',
    padding: '24px 16px 48px',
  } as React.CSSProperties,
  card: {
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 1px 4px rgba(0,0,0,.08)',
    padding: '20px 24px',
    marginBottom: 16,
  } as React.CSSProperties,
  greeting: {
    fontSize: 20,
    fontWeight: 700,
    color: '#1e293b',
    marginBottom: 4,
  } as React.CSSProperties,
  subRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap' as const,
    marginBottom: 8,
  } as React.CSSProperties,
  pedidoNum: {
    fontSize: 14,
    color: '#475569',
    fontWeight: 500,
  } as React.CSSProperties,
  expiry: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  } as React.CSSProperties,
  tabsBar: {
    display: 'flex',
    gap: 4,
    borderBottom: '2px solid #e2e8f0',
    marginBottom: 20,
  } as React.CSSProperties,
  tabBtn: (active: boolean): React.CSSProperties => ({
    padding: '10px 18px',
    fontSize: 14,
    fontWeight: active ? 700 : 500,
    color: active ? '#1d4ed8' : '#64748b',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid #1d4ed8' : '2px solid transparent',
    marginBottom: -2,
    cursor: 'pointer',
    borderRadius: '6px 6px 0 0',
    transition: 'color .15s',
  }),
  badge: (variant: 'default' | 'info' | 'warning' | 'success' | 'danger'): React.CSSProperties => {
    const map: Record<string, { bg: string; color: string }> = {
      default:  { bg: '#e2e8f0', color: '#475569' },
      info:     { bg: '#dbeafe', color: '#1d4ed8' },
      warning:  { bg: '#fef9c3', color: '#92400e' },
      success:  { bg: '#dcfce7', color: '#166534' },
      danger:   { bg: '#fee2e2', color: '#991b1b' },
    }
    const { bg, color } = map[variant] ?? map.default
    return {
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 600,
      background: bg,
      color,
      whiteSpace: 'nowrap',
    }
  },
  // Timeline
  timelineWrap: {
    padding: '8px 0',
  } as React.CSSProperties,
  timelineRow: {
    display: 'flex',
    gap: 14,
    position: 'relative' as const,
    paddingBottom: 20,
  } as React.CSSProperties,
  timelineColLeft: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    width: 20,
    flexShrink: 0,
  } as React.CSSProperties,
  dot: (last: boolean): React.CSSProperties => ({
    width: last ? 16 : 12,
    height: last ? 16 : 12,
    borderRadius: '50%',
    background: last ? '#1d4ed8' : '#cbd5e1',
    border: last ? '3px solid #bfdbfe' : '2px solid #e2e8f0',
    flexShrink: 0,
    marginTop: 2,
    zIndex: 1,
  }),
  line: {
    width: 2,
    flex: 1,
    background: '#e2e8f0',
    marginTop: 2,
  } as React.CSSProperties,
  timelineContent: (last: boolean): React.CSSProperties => ({
    flex: 1,
    paddingBottom: 4,
    fontWeight: last ? 700 : 400,
  }),
  timelineDate: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 2,
  } as React.CSSProperties,
  timelineLabel: (last: boolean): React.CSSProperties => ({
    fontSize: last ? 14 : 13,
    color: last ? '#1e293b' : '#475569',
    fontWeight: last ? 700 : 500,
  }),
  timelineDesc: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  } as React.CSSProperties,
  // Itens
  itensList: {
    marginTop: 20,
    borderTop: '1px solid #f1f5f9',
    paddingTop: 16,
  } as React.CSSProperties,
  itemRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
    borderBottom: '1px solid #f8fafc',
    fontSize: 14,
    color: '#334155',
  } as React.CSSProperties,
  // Documentos
  submissionItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    background: '#f8fafc',
    borderRadius: 8,
    marginBottom: 8,
    gap: 8,
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,
  dropzone: (dragging: boolean): React.CSSProperties => ({
    border: `2px dashed ${dragging ? '#1d4ed8' : '#cbd5e1'}`,
    borderRadius: 10,
    background: dragging ? '#eff6ff' : '#f8fafc',
    padding: '28px 20px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all .2s',
    marginBottom: 12,
  }),
  fileList: {
    background: '#f1f5f9',
    borderRadius: 8,
    padding: '8px 12px',
    marginBottom: 12,
  } as React.CSSProperties,
  fileItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 13,
    color: '#334155',
    padding: '4px 0',
    borderBottom: '1px solid #e2e8f0',
  } as React.CSSProperties,
  textarea: {
    width: '100%',
    minHeight: 80,
    borderRadius: 8,
    border: '1px solid #cbd5e1',
    padding: '10px 12px',
    fontSize: 14,
    color: '#1e293b',
    resize: 'vertical' as const,
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  } as React.CSSProperties,
  btnPrimary: (disabled?: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 22px',
    borderRadius: 8,
    border: 'none',
    background: disabled ? '#93c5fd' : '#1d4ed8',
    color: '#fff',
    fontWeight: 600,
    fontSize: 14,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background .15s',
    marginTop: 8,
  }),
  alertSuccess: {
    background: '#dcfce7',
    color: '#166534',
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: 14,
    fontWeight: 500,
    marginTop: 12,
  } as React.CSSProperties,
  alertError: {
    background: '#fee2e2',
    color: '#991b1b',
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: 14,
    fontWeight: 500,
    marginTop: 12,
  } as React.CSSProperties,
  // Aceite
  checkRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 16,
    marginBottom: 8,
  } as React.CSSProperties,
  checkLabel: {
    fontSize: 14,
    color: '#334155',
    cursor: 'pointer',
    lineHeight: 1.5,
  } as React.CSSProperties,
  // Error page
  errorPage: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    gap: 12,
    textAlign: 'center' as const,
    padding: '0 24px',
  } as React.CSSProperties,
  errorIcon: {
    width: 64,
    height: 64,
    borderRadius: '50%',
    background: '#fee2e2',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 32,
    color: '#dc2626',
    marginBottom: 8,
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 12,
  } as React.CSSProperties,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function statusBadgeVariant(status: string): 'default' | 'info' | 'warning' | 'success' | 'danger' {
  const map: Record<string, 'default' | 'info' | 'warning' | 'success' | 'danger'> = {
    recebido: 'info',
    em_analise: 'warning',
    aprovado: 'success',
    rejeitado: 'danger',
    ativo: 'success',
    cancelado: 'danger',
    pendente: 'warning',
    concluido: 'success',
  }
  return map[status?.toLowerCase()] ?? 'default'
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    recebido: 'Recebido',
    em_analise: 'Em análise',
    aprovado: 'Aprovado',
    rejeitado: 'Rejeitado',
    ativo: 'Ativo',
    cancelado: 'Cancelado',
    pendente: 'Pendente',
    concluido: 'Concluído',
  }
  return map[status?.toLowerCase()] ?? status
}

const API_BASE = import.meta.env.VITE_API_URL ?? ''

// ─── Componente principal ────────────────────────────────────────────────────

export default function Portal() {
  const { token } = useParams<{ token: string }>()

  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [data, setData] = useState<PortalData | null>(null)

  const [aba, setAba] = useState<'pedido' | 'documentos' | 'aceite'>('pedido')

  // Documentos
  const [arquivos, setArquivos] = useState<File[]>([])
  const [observacaoDoc, setObservacaoDoc] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [erroEnvio, setErroEnvio] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Aceite
  const [aceitando, setAceitando] = useState(false)
  const [aceiteConfirmado, setAceiteConfirmado] = useState(false)
  const [erroAceite, setErroAceite] = useState('')
  const [checkAceite, setCheckAceite] = useState(false)

  // ── Fetch inicial ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) {
      setErro('Link inválido.')
      setLoading(false)
      return
    }
    fetch(`${API_BASE}/api/portal/acesso/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.message ?? 'Token inválido ou expirado.')
        }
        return res.json()
      })
      .then((json: PortalData) => {
        setData(json)
        // Definir aba inicial baseada no escopo
        const esc = json.token.escopo
        if (esc === 'envio_documentos' || esc === 'formulario_icp') {
          setAba('documentos')
        } else if (esc === 'aceite') {
          setAba('aceite')
        } else {
          setAba('pedido')
        }
      })
      .catch((e: Error) => setErro(e.message ?? 'Erro desconhecido.'))
      .finally(() => setLoading(false))
  }, [token])

  // ── Abas permitidas por escopo ───────────────────────────────────────────

  function abasPermitidas(): Array<'pedido' | 'documentos' | 'aceite'> {
    if (!data) return []
    const esc = data.token.escopo
    if (esc === 'acompanhamento') return ['pedido']
    if (esc === 'envio_documentos' || esc === 'formulario_icp') return ['pedido', 'documentos']
    if (esc === 'aceite') return ['pedido', 'aceite']
    if (esc === 'completo') return ['pedido', 'documentos', 'aceite']
    return ['pedido']
  }

  // ── Upload de documentos ─────────────────────────────────────────────────

  function handleFilesSelected(files: FileList | null) {
    if (!files) return
    const MAX = 10 * 1024 * 1024
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    const validos = Array.from(files).filter((f) => {
      if (!allowed.includes(f.type)) return false
      if (f.size > MAX) return false
      return true
    })
    setArquivos((prev) => {
      const names = new Set(prev.map((f) => f.name))
      return [...prev, ...validos.filter((f) => !names.has(f.name))]
    })
  }

  function handleDropzoneDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    handleFilesSelected(e.dataTransfer.files)
  }

  function removeArquivo(idx: number) {
    setArquivos((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleEnviarDocumentos() {
    if (!arquivos.length || !token) return
    setEnviando(true)
    setErroEnvio('')
    try {
      const form = new FormData()
      arquivos.forEach((f) => form.append('arquivos', f))
      if (observacaoDoc.trim()) form.append('observacao', observacaoDoc.trim())
      const res = await fetch(`${API_BASE}/api/portal/acesso/${token}/documentos`, {
        method: 'POST',
        body: form,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.message ?? 'Erro ao enviar documentos.')
      }
      setEnviado(true)
      setArquivos([])
      setObservacaoDoc('')
    } catch (e: unknown) {
      setErroEnvio(e instanceof Error ? e.message : 'Erro ao enviar documentos.')
    } finally {
      setEnviando(false)
    }
  }

  // ── Aceite ───────────────────────────────────────────────────────────────

  async function handleConfirmarAceite() {
    if (!checkAceite || !token) return
    setAceitando(true)
    setErroAceite('')
    try {
      const res = await fetch(`${API_BASE}/api/portal/acesso/${token}/aceite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.message ?? 'Erro ao confirmar aceite.')
      }
      setAceiteConfirmado(true)
    } catch (e: unknown) {
      setErroAceite(e instanceof Error ? e.message : 'Erro ao confirmar aceite.')
    } finally {
      setAceitando(false)
    }
  }

  // ─── Render: loading ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={s.page}>
        <div style={s.header}>
          <AtlasLogo variant="white" width={140} />
        </div>
        <div style={{ ...s.container, textAlign: 'center', paddingTop: 60 }}>
          <div style={{ color: '#94a3b8', fontSize: 15 }}>Carregando...</div>
        </div>
      </div>
    )
  }

  // ─── Render: erro ────────────────────────────────────────────────────────

  if (erro || !data) {
    return (
      <div style={s.page}>
        <div style={s.header}>
          <AtlasLogo variant="white" width={140} />
        </div>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div style={s.errorPage}>
            <div style={s.errorIcon}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>
              Link indisponível
            </div>
            <div style={{ fontSize: 14, color: '#64748b', maxWidth: 380, lineHeight: 1.6 }}>
              {erro ?? 'Este link não pôde ser carregado.'} <br />
              Verifique se o link está correto ou entre em contato com a empresa responsável.
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{ ...s.btnPrimary(false), marginTop: 20 }}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </div>
    )
  }

  const { token: tokenInfo, pedido, cliente, submissions } = data
  const abas = abasPermitidas()

  // ─── Aba: Pedido ─────────────────────────────────────────────────────────

  const historico = pedido.historico ?? []

  const TabPedido = (
    <div>
      {/* Timeline */}
      {historico.length > 0 ? (
        <div>
          <div style={s.sectionTitle}>Histórico</div>
          <div style={s.timelineWrap}>
            {historico.map((ev, idx) => {
              const isLast = idx === historico.length - 1
              return (
                <div key={idx} style={s.timelineRow}>
                  <div style={s.timelineColLeft}>
                    <div style={s.dot(isLast)} />
                    {!isLast && <div style={s.line} />}
                  </div>
                  <div style={s.timelineContent(isLast)}>
                    <div style={s.timelineDate}>{fmtDateTime(ev.data)}</div>
                    {ev.etapa && (
                      <div style={s.timelineLabel(isLast)}>{ev.etapa}</div>
                    )}
                    {ev.descricao && (
                      <div style={s.timelineDesc}>{ev.descricao}</div>
                    )}
                    {!ev.etapa && !ev.descricao && ev.tipo && (
                      <div style={s.timelineLabel(isLast)}>{ev.tipo}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div style={{ color: '#94a3b8', fontSize: 14, marginBottom: 16 }}>
          Nenhum histórico disponível.
        </div>
      )}

      {/* Itens */}
      {pedido.itens && pedido.itens.length > 0 && (
        <div style={s.itensList}>
          <div style={s.sectionTitle}>Itens do pedido</div>
          {pedido.itens.map((item, idx) => (
            <div key={idx} style={s.itemRow}>
              <span>{item.descricao}</span>
              <span style={{ color: '#64748b', fontSize: 13, whiteSpace: 'nowrap', marginLeft: 12 }}>
                Qtd: <strong>{item.quantidade}</strong>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // ─── Aba: Documentos ─────────────────────────────────────────────────────

  const TabDocumentos = (
    <div>
      {/* Submissions anteriores */}
      {submissions.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={s.sectionTitle}>Envios anteriores</div>
          {submissions.map((sub) => (
            <div key={sub._id} style={s.submissionItem}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                  {sub.tipo ?? 'Documento'}
                  <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 8 }}>
                    {fmtDate(sub.createdAt)}
                  </span>
                </div>
                {sub.observacao && (
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{sub.observacao}</div>
                )}
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {sub.arquivos} arquivo{sub.arquivos !== 1 ? 's' : ''}
                </div>
              </div>
              <span style={s.badge(statusBadgeVariant(sub.status))}>
                {statusLabel(sub.status)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Formulário de envio */}
      <div style={s.sectionTitle}>Enviar documentos</div>

      {enviado ? (
        <div style={s.alertSuccess}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Documentos enviados com sucesso! Nossa equipe irá analisar em breve.
          <div style={{ marginTop: 8 }}>
            <button
              style={{ ...s.btnPrimary(false), padding: '6px 14px', fontSize: 13, marginTop: 0 }}
              onClick={() => { setEnviado(false) }}
            >
              Enviar mais documentos
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Dropzone */}
          <div
            style={s.dropzone(dragging)}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDropzoneDrop}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8 }}>
              <polyline points="16 16 12 12 8 16" />
              <line x1="12" y1="12" x2="12" y2="21" />
              <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
            </svg>
            <div style={{ fontSize: 14, color: '#64748b', fontWeight: 500 }}>
              Arraste arquivos aqui ou <span style={{ color: '#1d4ed8', textDecoration: 'underline' }}>clique para selecionar</span>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
              PDF, JPG, PNG, WEBP — máx. 10 MB por arquivo
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            style={{ display: 'none' }}
            onChange={(e: ChangeEvent<HTMLInputElement>) => handleFilesSelected(e.target.files)}
          />

          {/* Lista de arquivos selecionados */}
          {arquivos.length > 0 && (
            <div style={s.fileList}>
              {arquivos.map((f, idx) => (
                <div key={idx} style={s.fileItem}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                    {f.name}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>{formatBytes(f.size)}</span>
                    <button
                      onClick={() => removeArquivo(idx)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0, fontSize: 16, lineHeight: 1 }}
                      title="Remover"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Observação */}
          <textarea
            style={s.textarea}
            placeholder="Observação (opcional)..."
            value={observacaoDoc}
            onChange={(e) => setObservacaoDoc(e.target.value)}
          />

          {/* Botão enviar */}
          <button
            style={s.btnPrimary(enviando || arquivos.length === 0)}
            onClick={handleEnviarDocumentos}
            disabled={enviando || arquivos.length === 0}
          >
            {enviando ? 'Enviando...' : 'Enviar documentos'}
          </button>

          {erroEnvio && <div style={s.alertError}>{erroEnvio}</div>}
        </>
      )}
    </div>
  )

  // ─── Aba: Aceite ─────────────────────────────────────────────────────────

  const TabAceite = (
    <div>
      {aceiteConfirmado ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ ...s.errorIcon, background: '#dcfce7', color: '#166534', margin: '0 auto 16px' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#166534', marginBottom: 8 }}>
            Aceite confirmado
          </div>
          <div style={{ fontSize: 14, color: '#64748b' }}>
            Pedido <strong>{pedido.numero}</strong> aceito em {fmtDateTime(new Date())}.
          </div>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <div style={s.sectionTitle}>Resumo do pedido</div>
            <div style={{ fontSize: 15, color: '#1e293b', marginBottom: 8 }}>
              Pedido <strong>{pedido.numero}</strong>
            </div>

            {pedido.itens && pedido.itens.length > 0 ? (
              pedido.itens.map((item, idx) => (
                <div key={idx} style={s.itemRow}>
                  <span>{item.descricao}</span>
                  <span style={{ color: '#64748b', fontSize: 13, whiteSpace: 'nowrap', marginLeft: 12 }}>
                    Qtd: <strong>{item.quantidade}</strong>
                  </span>
                </div>
              ))
            ) : (
              <div style={{ color: '#94a3b8', fontSize: 14 }}>Sem itens detalhados.</div>
            )}
          </div>

          <div style={s.checkRow}>
            <input
              type="checkbox"
              id="check-aceite"
              checked={checkAceite}
              onChange={(e) => setCheckAceite(e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer', marginTop: 2, flexShrink: 0 }}
            />
            <label htmlFor="check-aceite" style={s.checkLabel}>
              Li e concordo com os termos deste pedido
            </label>
          </div>

          <button
            style={s.btnPrimary(aceitando || !checkAceite)}
            onClick={handleConfirmarAceite}
            disabled={aceitando || !checkAceite}
          >
            {aceitando ? 'Confirmando...' : 'Confirmar Aceite'}
          </button>

          {erroAceite && <div style={s.alertError}>{erroAceite}</div>}
        </>
      )}
    </div>
  )

  // ─── Render principal ────────────────────────────────────────────────────

  const abaLabels: Record<string, string> = {
    pedido: 'Pedido',
    documentos: 'Documentos',
    aceite: 'Aceite',
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <AtlasLogo variant="white" width={140} />
      </div>

      <div style={s.container}>
        {/* Card de boas-vindas */}
        <div style={s.card}>
          <div style={s.greeting}>Olá, {cliente.nome}</div>
          <div style={s.subRow}>
            <span style={s.pedidoNum}>Pedido {pedido.numero}</span>
            <span style={s.badge(statusBadgeVariant(pedido.status))}>
              {statusLabel(pedido.status)}
            </span>
          </div>
          <div style={s.expiry}>
            Acesso expira em {fmtDateTime(tokenInfo.expiresAt)}
          </div>
        </div>

        {/* Card principal com abas */}
        <div style={s.card}>
          {/* Barra de abas */}
          {abas.length > 1 && (
            <div style={s.tabsBar}>
              {abas.map((a) => (
                <button
                  key={a}
                  style={s.tabBtn(aba === a)}
                  onClick={() => setAba(a)}
                >
                  {abaLabels[a]}
                </button>
              ))}
            </div>
          )}

          {/* Conteúdo da aba */}
          {aba === 'pedido' && TabPedido}
          {aba === 'documentos' && TabDocumentos}
          {aba === 'aceite' && TabAceite}
        </div>

        {/* Rodapé */}
        <div style={{ textAlign: 'center', fontSize: 12, color: '#cbd5e1', marginTop: 8 }}>
          Powered by AtlasX &mdash; Acesso seguro por token
        </div>
      </div>
    </div>
  )
}
