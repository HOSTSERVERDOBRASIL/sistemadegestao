import { useEffect, useState } from 'react'
import AtlasLogo from '../components/AtlasLogo'
import { fmtDate, fmtCurrency } from '../utils/fmt'

// ─── Chave de storage ─────────────────────────────────────────────────────────
const TOKEN_KEY = 'portal_cliente_token'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ClienteData {
  _id: string
  nome: string
  email: string
  documento: string
  telefone?: string
  tipo: string
  statusCadastro?: string
}

interface Contrato {
  _id: string
  numero: string
  modalidade: string
  valorTotal: number
  valorFaturado: number
  ativo: boolean
  dataInicio: string
  dataFim: string
  documentos: Array<{ tipo: string; arquivoUrl: string; nomeOriginal?: string }>
}

interface Pedido {
  _id: string
  numero: string
  produtoId?: { nome?: string; codigo?: string }
  etapaOperacional: string
  status: string
  valorTotal: number
  createdAt: string
}

interface Cobranca {
  _id: string
  pedidoId: string
  tipo: string
  valor: number
  status: string
  vencimento?: string
  pagoEm?: string
  pixCopiaECola?: string
  boletoUrl?: string
  createdAt: string
}

interface Empenho {
  _id: string
  numero: string
  valor: number
  valorUtilizado: number
  status: string
  dataEmissao: string
  dataVencimento?: string
  descricao?: string
}

type Aba = 'visao-geral' | 'contratos' | 'pedidos' | 'cobrancas' | 'empenhos'

// ─── Estilos ──────────────────────────────────────────────────────────────────

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
    justifyContent: 'space-between',
  } as React.CSSProperties,
  container: {
    maxWidth: 960,
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
  tabsBar: {
    display: 'flex',
    gap: 4,
    borderBottom: '2px solid #e2e8f0',
    marginBottom: 20,
    overflowX: 'auto' as const,
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
    whiteSpace: 'nowrap' as const,
    transition: 'color .15s',
  }),
  badge: (variant: 'default' | 'info' | 'warning' | 'success' | 'danger'): React.CSSProperties => {
    const map: Record<string, { bg: string; color: string }> = {
      default: { bg: '#e2e8f0', color: '#475569' },
      info:    { bg: '#dbeafe', color: '#1d4ed8' },
      warning: { bg: '#fef9c3', color: '#92400e' },
      success: { bg: '#dcfce7', color: '#166534' },
      danger:  { bg: '#fee2e2', color: '#991b1b' },
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
      whiteSpace: 'nowrap' as const,
    }
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    marginBottom: 4,
  } as React.CSSProperties,
  value: {
    fontSize: 15,
    color: '#1e293b',
    fontWeight: 500,
  } as React.CSSProperties,
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 14,
  } as React.CSSProperties,
  th: {
    textAlign: 'left' as const,
    padding: '8px 12px',
    background: '#f8fafc',
    fontSize: 12,
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.6,
    borderBottom: '1px solid #e2e8f0',
  } as React.CSSProperties,
  td: {
    padding: '10px 12px',
    borderBottom: '1px solid #f1f5f9',
    color: '#334155',
    verticalAlign: 'middle' as const,
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
  }),
  btnGhost: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid #e2e8f0',
    background: '#fff',
    color: '#475569',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  } as React.CSSProperties,
  input: {
    width: '100%',
    borderRadius: 8,
    border: '1px solid #cbd5e1',
    padding: '10px 12px',
    fontSize: 15,
    color: '#1e293b',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
    marginBottom: 12,
  } as React.CSSProperties,
  alertError: {
    background: '#fee2e2',
    color: '#991b1b',
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: 14,
    fontWeight: 500,
    marginBottom: 12,
  } as React.CSSProperties,
  statCard: {
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 1px 4px rgba(0,0,0,.08)',
    padding: '18px 20px',
    flex: '1 1 200px',
    minWidth: 160,
  } as React.CSSProperties,
  statValue: {
    fontSize: 28,
    fontWeight: 800,
    color: '#1d4ed8',
    lineHeight: 1.1,
  } as React.CSSProperties,
  statLabel: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  } as React.CSSProperties,
  emptyState: {
    textAlign: 'center' as const,
    padding: '40px 0',
    color: '#94a3b8',
    fontSize: 14,
  } as React.CSSProperties,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function etapaBadgeVariant(etapa: string): 'default' | 'info' | 'warning' | 'success' | 'danger' {
  const map: Record<string, 'default' | 'info' | 'warning' | 'success' | 'danger'> = {
    Pedido: 'default',
    Pagamento: 'warning',
    Validacao: 'info',
    Preparacao: 'info',
    Processamento: 'warning',
    Entrega: 'info',
    Conclusao: 'success',
  }
  return map[etapa] ?? 'default'
}

function statusCobrancaBadge(status: string): 'default' | 'info' | 'warning' | 'success' | 'danger' {
  const map: Record<string, 'default' | 'info' | 'warning' | 'success' | 'danger'> = {
    ATIVA: 'warning',
    CONCLUIDA: 'success',
    REMOVIDA_PELO_USUARIO_RECEBEDOR: 'danger',
    REMOVIDA_PELO_PSP: 'danger',
    EXPIRADA: 'danger',
  }
  return map[status] ?? 'default'
}

function statusCobrancaLabel(status: string): string {
  const map: Record<string, string> = {
    ATIVA: 'Ativa',
    CONCLUIDA: 'Paga',
    REMOVIDA_PELO_USUARIO_RECEBEDOR: 'Removida',
    REMOVIDA_PELO_PSP: 'Removida (PSP)',
    EXPIRADA: 'Expirada',
  }
  return map[status] ?? status
}

function statusEmpenhoBadge(status: string): 'default' | 'info' | 'warning' | 'success' | 'danger' {
  const map: Record<string, 'default' | 'info' | 'warning' | 'success' | 'danger'> = {
    Aberto: 'info',
    'Parcialmente utilizado': 'warning',
    Encerrado: 'default',
  }
  return map[status] ?? 'default'
}

// ─── Fetch autenticado ────────────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY)
  const res = await fetch(`${API_BASE}/api/portal-cliente${path}`, {
    headers: { Authorization: `Bearer ${token ?? ''}` },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.message ?? `Erro ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function PortalCliente() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))

  // Login form
  const [loginEmail, setLoginEmail] = useState('')
  const [loginSenha, setLoginSenha] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginErro, setLoginErro] = useState('')

  // Aba ativa
  const [aba, setAba] = useState<Aba>('visao-geral')

  // Dados
  const [cliente, setCliente] = useState<ClienteData | null>(null)
  const [contratos, setContratos] = useState<Contrato[] | null>(null)
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null)
  const [cobrancas, setCobrancas] = useState<Cobranca[] | null>(null)
  const [empenhos, setEmpenhos] = useState<Empenho[] | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erroGeral, setErroGeral] = useState('')

  // ── Carrega dados ao logar ──────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return
    setCarregando(true)
    setErroGeral('')
    apiFetch<ClienteData>('/meus-dados')
      .then(setCliente)
      .catch((e: Error) => {
        setErroGeral(e.message)
        // token inválido
        if (e.message.includes('401') || e.message.toLowerCase().includes('inválido') || e.message.toLowerCase().includes('inativo')) {
          handleLogout()
        }
      })
      .finally(() => setCarregando(false))
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lazy load de abas ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return
    if (aba === 'contratos' && contratos === null) {
      apiFetch<Contrato[]>('/meus-contratos').then(setContratos).catch(() => setContratos([]))
    }
    if (aba === 'pedidos' && pedidos === null) {
      apiFetch<Pedido[]>('/meus-pedidos').then(setPedidos).catch(() => setPedidos([]))
    }
    if (aba === 'cobrancas' && cobrancas === null) {
      apiFetch<Cobranca[]>('/minhas-cobrancas').then(setCobrancas).catch(() => setCobrancas([]))
    }
    if (aba === 'empenhos' && empenhos === null) {
      apiFetch<Empenho[]>('/meus-empenhos').then(setEmpenhos).catch(() => setEmpenhos([]))
    }
  }, [aba, token]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setCliente(null)
    setContratos(null)
    setPedidos(null)
    setCobrancas(null)
    setEmpenhos(null)
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginLoading(true)
    setLoginErro('')
    try {
      const res = await fetch(`${API_BASE}/api/portal-cliente/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, senha: loginSenha }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.message ?? 'Erro ao fazer login')
      localStorage.setItem(TOKEN_KEY, body.token)
      setToken(body.token)
    } catch (err: unknown) {
      setLoginErro(err instanceof Error ? err.message : 'Erro ao fazer login')
    } finally {
      setLoginLoading(false)
    }
  }

  // ─── Tela de login ──────────────────────────────────────────────────────────

  if (!token) {
    return (
      <div style={s.page}>
        <div style={s.header}>
          <AtlasLogo variant="white" width={140} />
        </div>
        <div style={{ maxWidth: 400, margin: '60px auto', padding: '0 16px' }}>
          <div style={s.card}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
              Portal do Cliente
            </div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>
              Acesse sua área exclusiva para acompanhar contratos, pedidos e cobranças.
            </div>

            {loginErro && <div style={s.alertError}>{loginErro}</div>}

            <form onSubmit={handleLogin}>
              <label style={s.label}>E-mail</label>
              <input
                style={s.input}
                type="email"
                autoComplete="username"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="seu@email.com"
                required
              />
              <label style={s.label}>Senha</label>
              <input
                style={s.input}
                type="password"
                autoComplete="current-password"
                value={loginSenha}
                onChange={(e) => setLoginSenha(e.target.value)}
                placeholder="••••••••"
                required
              />
              <button
                type="submit"
                style={{ ...s.btnPrimary(loginLoading), width: '100%', justifyContent: 'center', marginTop: 4 }}
                disabled={loginLoading}
              >
                {loginLoading ? 'Entrando...' : 'Entrar'}
              </button>
            </form>
          </div>

          <div style={{ textAlign: 'center', fontSize: 12, color: '#cbd5e1', marginTop: 16 }}>
            Powered by AtlasX &mdash; Portal do Cliente
          </div>
        </div>
      </div>
    )
  }

  // ─── Loading inicial ────────────────────────────────────────────────────────

  if (carregando) {
    return (
      <div style={s.page}>
        <div style={s.header}>
          <AtlasLogo variant="white" width={140} />
          <button onClick={handleLogout} style={{ ...s.btnGhost, border: 'none', background: 'rgba(255,255,255,.15)', color: '#fff' }}>
            Sair
          </button>
        </div>
        <div style={{ ...s.container, textAlign: 'center', paddingTop: 60 }}>
          <div style={{ color: '#94a3b8', fontSize: 15 }}>Carregando...</div>
        </div>
      </div>
    )
  }

  // ─── Erro geral ─────────────────────────────────────────────────────────────

  if (erroGeral && !cliente) {
    return (
      <div style={s.page}>
        <div style={s.header}>
          <AtlasLogo variant="white" width={140} />
        </div>
        <div style={{ maxWidth: 640, margin: '60px auto', padding: '0 16px' }}>
          <div style={s.alertError}>{erroGeral}</div>
          <button style={s.btnPrimary()} onClick={handleLogout}>Fazer login novamente</button>
        </div>
      </div>
    )
  }

  // ─── Totais para visão geral ─────────────────────────────────────────────────

  const totalContratosAtivos = contratos ? contratos.filter((c) => c.ativo).length : '—'
  const totalPedidosAbertos = pedidos ? pedidos.filter((p) => p.status !== 'Concluido' && p.status !== 'Cancelado' && p.status !== 'Faturado').length : '—'
  const totalCobrancasAbertas = cobrancas ? cobrancas.filter((c) => c.status === 'ATIVA').length : '—'

  // ─── Aba: Visão Geral ────────────────────────────────────────────────────────

  const TabVisaoGeral = (
    <div>
      {/* Dados cadastrais */}
      {cliente && (
        <div style={s.card}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 16 }}>
            Dados Cadastrais
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
            <div>
              <div style={s.label}>Nome / Razão Social</div>
              <div style={s.value}>{cliente.nome}</div>
            </div>
            <div>
              <div style={s.label}>CNPJ / CPF</div>
              <div style={s.value}>{cliente.documento}</div>
            </div>
            <div>
              <div style={s.label}>E-mail</div>
              <div style={s.value}>{cliente.email}</div>
            </div>
            {cliente.telefone && (
              <div>
                <div style={s.label}>Telefone</div>
                <div style={s.value}>{cliente.telefone}</div>
              </div>
            )}
            {cliente.statusCadastro && (
              <div>
                <div style={s.label}>Status</div>
                <div style={s.value}>{cliente.statusCadastro}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cards de totais */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={s.statCard}>
          <div style={s.statValue}>{totalContratosAtivos}</div>
          <div style={s.statLabel}>Contratos ativos</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue}>{totalPedidosAbertos}</div>
          <div style={s.statLabel}>Pedidos em aberto</div>
        </div>
        <div style={s.statCard}>
          <div style={s.statValue}>{totalCobrancasAbertas}</div>
          <div style={s.statLabel}>Cobranças abertas</div>
        </div>
      </div>

      {(contratos === null || pedidos === null || cobrancas === null) && (
        <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '8px 0' }}>
          Navegue pelas abas para carregar os detalhes de cada seção.
        </div>
      )}
    </div>
  )

  // ─── Aba: Contratos ──────────────────────────────────────────────────────────

  const TabContratos = (
    <div>
      {contratos === null ? (
        <div style={s.emptyState}>Carregando contratos...</div>
      ) : contratos.length === 0 ? (
        <div style={s.emptyState}>Nenhum contrato encontrado.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Número</th>
                <th style={s.th}>Modalidade</th>
                <th style={s.th}>Vigência</th>
                <th style={s.th}>Valor Total</th>
                <th style={s.th}>Saldo</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Documentos</th>
              </tr>
            </thead>
            <tbody>
              {contratos.map((c) => (
                <tr key={c._id}>
                  <td style={s.td}><strong>{c.numero}</strong></td>
                  <td style={s.td}>{c.modalidade}</td>
                  <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
                    {fmtDate(c.dataInicio)} — {fmtDate(c.dataFim)}
                  </td>
                  <td style={s.td}>{fmtCurrency(c.valorTotal)}</td>
                  <td style={s.td}>{fmtCurrency(c.valorTotal - c.valorFaturado)}</td>
                  <td style={s.td}>
                    <span style={s.badge(c.ativo ? 'success' : 'default')}>
                      {c.ativo ? 'Ativo' : 'Encerrado'}
                    </span>
                  </td>
                  <td style={s.td}>
                    {c.documentos && c.documentos.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {c.documentos.map((doc, idx) => (
                          <a
                            key={idx}
                            href={doc.arquivoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: 12, color: '#1d4ed8', textDecoration: 'underline', whiteSpace: 'nowrap' }}
                          >
                            {doc.nomeOriginal ?? doc.tipo}
                          </a>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: 13 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  // ─── Aba: Pedidos ────────────────────────────────────────────────────────────

  const TabPedidos = (
    <div>
      {pedidos === null ? (
        <div style={s.emptyState}>Carregando pedidos...</div>
      ) : pedidos.length === 0 ? (
        <div style={s.emptyState}>Nenhum pedido encontrado.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Número</th>
                <th style={s.th}>Produto</th>
                <th style={s.th}>Etapa</th>
                <th style={s.th}>Valor</th>
                <th style={s.th}>Data</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p._id}>
                  <td style={s.td}><strong>{p.numero}</strong></td>
                  <td style={s.td}>{p.produtoId?.nome ?? '—'}</td>
                  <td style={s.td}>
                    <span style={s.badge(etapaBadgeVariant(p.etapaOperacional))}>
                      {p.etapaOperacional}
                    </span>
                  </td>
                  <td style={s.td}>{fmtCurrency(p.valorTotal)}</td>
                  <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{fmtDate(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  // ─── Aba: Cobranças ──────────────────────────────────────────────────────────

  const TabCobrancas = (
    <div>
      {cobrancas === null ? (
        <div style={s.emptyState}>Carregando cobranças...</div>
      ) : cobrancas.length === 0 ? (
        <div style={s.emptyState}>Nenhuma cobrança encontrada.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Tipo</th>
                <th style={s.th}>Valor</th>
                <th style={s.th}>Vencimento</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Pagar</th>
              </tr>
            </thead>
            <tbody>
              {cobrancas.map((c) => (
                <tr key={c._id}>
                  <td style={s.td}>{c.tipo === 'pix' || c.tipo === 'pix_vencimento' ? 'Pix' : 'Boleto'}</td>
                  <td style={s.td}><strong>{fmtCurrency(c.valor)}</strong></td>
                  <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{fmtDate(c.vencimento)}</td>
                  <td style={s.td}>
                    <span style={s.badge(statusCobrancaBadge(c.status))}>
                      {statusCobrancaLabel(c.status)}
                    </span>
                  </td>
                  <td style={s.td}>
                    {c.pixCopiaECola ? (
                      <button
                        style={s.btnGhost}
                        onClick={() => {
                          navigator.clipboard.writeText(c.pixCopiaECola!)
                            .then(() => alert('Código Pix copiado!'))
                            .catch(() => alert(c.pixCopiaECola!))
                        }}
                      >
                        Copiar Pix
                      </button>
                    ) : c.boletoUrl ? (
                      <a
                        href={c.boletoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ ...s.btnGhost, textDecoration: 'none' }}
                      >
                        Ver boleto
                      </a>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: 13 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  // ─── Aba: Empenhos ───────────────────────────────────────────────────────────

  const TabEmpenhos = (
    <div>
      {empenhos === null ? (
        <div style={s.emptyState}>Carregando empenhos...</div>
      ) : empenhos.length === 0 ? (
        <div style={s.emptyState}>Nenhuma nota de empenho encontrada.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Número</th>
                <th style={s.th}>Valor Total</th>
                <th style={s.th}>Utilizado</th>
                <th style={s.th}>Saldo</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Emissão</th>
              </tr>
            </thead>
            <tbody>
              {empenhos.map((e) => (
                <tr key={e._id}>
                  <td style={s.td}><strong>{e.numero}</strong></td>
                  <td style={s.td}>{fmtCurrency(e.valor)}</td>
                  <td style={s.td}>{fmtCurrency(e.valorUtilizado)}</td>
                  <td style={s.td}>{fmtCurrency(e.valor - e.valorUtilizado)}</td>
                  <td style={s.td}>
                    <span style={s.badge(statusEmpenhoBadge(e.status))}>
                      {e.status}
                    </span>
                  </td>
                  <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{fmtDate(e.dataEmissao)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  // ─── Render principal ────────────────────────────────────────────────────────

  const abas: Array<{ id: Aba; label: string }> = [
    { id: 'visao-geral', label: 'Visão Geral' },
    { id: 'contratos', label: 'Meus Contratos' },
    { id: 'pedidos', label: 'Meus Pedidos' },
    { id: 'cobrancas', label: 'Cobranças' },
    { id: 'empenhos', label: 'Empenhos' },
  ]

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <AtlasLogo variant="white" width={140} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {cliente && (
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,.8)', fontWeight: 500 }}>
              {cliente.nome}
            </span>
          )}
          <button
            onClick={handleLogout}
            style={{ ...s.btnGhost, border: 'none', background: 'rgba(255,255,255,.15)', color: '#fff' }}
          >
            Sair
          </button>
        </div>
      </div>

      <div style={s.container}>
        {/* Boas-vindas */}
        {cliente && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#1e293b' }}>
              Olá, {cliente.nome.split(' ')[0]}
            </div>
            <div style={{ fontSize: 14, color: '#64748b', marginTop: 2 }}>
              Bem-vindo ao seu Portal do Cliente AtlasX
            </div>
          </div>
        )}

        {/* Card com abas */}
        <div style={s.card}>
          {/* Barra de abas */}
          <div style={s.tabsBar}>
            {abas.map((a) => (
              <button
                key={a.id}
                style={s.tabBtn(aba === a.id)}
                onClick={() => setAba(a.id)}
              >
                {a.label}
              </button>
            ))}
          </div>

          {/* Conteúdo */}
          {aba === 'visao-geral' && TabVisaoGeral}
          {aba === 'contratos' && TabContratos}
          {aba === 'pedidos' && TabPedidos}
          {aba === 'cobrancas' && TabCobrancas}
          {aba === 'empenhos' && TabEmpenhos}
        </div>

        {/* Rodapé */}
        <div style={{ textAlign: 'center', fontSize: 12, color: '#cbd5e1', marginTop: 8 }}>
          Powered by AtlasX &mdash; Portal do Cliente
        </div>
      </div>
    </div>
  )
}
