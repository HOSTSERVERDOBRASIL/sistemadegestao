import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import Badge from '../components/Badge'
import { fmtCurrency } from '../utils/fmt'
import styles from './Page.module.css'

// ─── tipos locais ────────────────────────────────────────────────────────────

interface PedidoSimples {
  _id: string
  numero: string
  clienteId: string | { _id: string; nome: string }
  valorTotal: number
  etapaOperacional: string
  status: string
  createdAt: string
}

interface ApiPage<T> {
  data: T[]
  total: number
}

interface AlertaEstoque {
  _id: string
  codigo: string
  nome: string
  quantidadeAtual: number
  quantidadeMinima: number
}

// ─── constantes ──────────────────────────────────────────────────────────────

const ETAPAS = [
  'Pedido', 'Pagamento', 'Validacao', 'Preparacao',
  'Processamento', 'Entrega', 'Conclusao',
] as const

type Etapa = typeof ETAPAS[number]

const ETAPA_BG: Record<Etapa, string> = {
  Pedido:        '#e2e8f0',
  Pagamento:     '#fef3c7',
  Validacao:     '#dbeafe',
  Preparacao:    '#ede9fe',
  Processamento: '#f3e8ff',
  Entrega:       '#dcfce7',
  Conclusao:     '#f0fdf4',
}

const ETAPA_TEXT: Record<Etapa, string> = {
  Pedido:        '#334155',
  Pagamento:     '#92400e',
  Validacao:     '#1e3a8a',
  Preparacao:    '#4c1d95',
  Processamento: '#5b21b6',
  Entrega:       '#14532d',
  Conclusao:     '#166534',
}

const STATUS_ABERTOS = [
  'Rascunho', 'Aprovado', 'Aguardando aprovação',
  'Aguardando pagamento', 'Em processo', 'Faturado',
].join(',')

// ─── helpers ─────────────────────────────────────────────────────────────────

function auth() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` }
}

function fetchJson<T>(url: string): Promise<T> {
  return fetch(url, { headers: auth() }).then(r => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
    return r.json() as Promise<T>
  })
}

function nomeCliente(c: string | { _id: string; nome: string }): string {
  if (typeof c === 'object' && c !== null) return c.nome
  return c ?? '—'
}

function diasAtras(d: string): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24))
}

function isVencido(d: string): boolean {
  return diasAtras(d) > 30
}

function isEstesMes(d: string): boolean {
  const dt = new Date(d)
  const now = new Date()
  return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth()
}

// ─── componente ──────────────────────────────────────────────────────────────

export default function DashboardOperacional() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  // KPIs
  const [kpiAberto, setKpiAberto]             = useState(0)
  const [kpiEntrega, setKpiEntrega]           = useState(0)
  const [kpiVencidos, setKpiVencidos]         = useState(0)
  const [kpiConcluidosMes, setKpiConcluidosMes] = useState(0)

  // Filas por etapa
  const [filas, setFilas]                 = useState<Partial<Record<Etapa, PedidoSimples[]>>>({})
  const [contagemEtapa, setContagemEtapa] = useState<Partial<Record<Etapa, number>>>({})

  // Recentes com pendências
  const [recentes, setRecentes] = useState<PedidoSimples[]>([])

  // Alertas
  const [alertaCobrancas, setAlertaCobrancas] = useState(0)
  const [alertaContratos, setAlertaContratos] = useState(0)
  const [alertaEstoque, setAlertaEstoque]     = useState<AlertaEstoque[]>([])

  // Relógio
  const [hora, setHora] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setHora(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  // Carga de dados
  useEffect(() => {
    const all: Promise<unknown>[] = [
      // 0 — KPI aberto: total de abertos
      fetchJson<ApiPage<PedidoSimples>>(`/api/pedidos?limit=1&status=${encodeURIComponent(STATUS_ABERTOS)}`),
      // 1 — abertos com dados (para calcular vencidos)
      fetchJson<ApiPage<PedidoSimples>>(`/api/pedidos?limit=300&status=${encodeURIComponent(STATUS_ABERTOS)}`),
      // 2 — concluídos (para filtrar pelo mês)
      fetchJson<ApiPage<PedidoSimples>>('/api/pedidos?limit=300&status=Concluido'),
      // 3‥9 — filas: uma por etapa, limit=5 (total vem junto)
      ...ETAPAS.map(e =>
        fetchJson<ApiPage<PedidoSimples>>(`/api/pedidos?etapa=${e}&limit=5`)
      ),
      // 10 — recentes (todos, filtraremos client-side)
      fetchJson<ApiPage<PedidoSimples>>('/api/pedidos?limit=20'),
      // 11 — alertas cobranças
      fetchJson<ApiPage<unknown>>('/api/cobrancas?status=VENCIDA&limit=1').catch(() => ({ total: 0, data: [] })),
      // 12 — alertas contratos
      fetchJson<ApiPage<unknown>>('/api/contratos?vencendo=true&limit=1').catch(() => ({ total: 0, data: [] })),
      // 13 — alertas estoque
      fetchJson<AlertaEstoque[] | ApiPage<AlertaEstoque>>('/api/estoque/items/alertas').catch(() => []),
    ]

    Promise.all(all)
      .then(results => {
        const r0  = results[0]  as ApiPage<PedidoSimples>
        const r1  = results[1]  as ApiPage<PedidoSimples>
        const r2  = results[2]  as ApiPage<PedidoSimples>
        const rFilas = results.slice(3, 10) as ApiPage<PedidoSimples>[]
        const r10 = results[10] as ApiPage<PedidoSimples>
        const r11 = results[11] as { total?: number }
        const r12 = results[12] as { total?: number }
        const r13 = results[13] as AlertaEstoque[] | ApiPage<AlertaEstoque>

        // ── KPIs ──
        setKpiAberto(r0.total ?? 0)
        setKpiEntrega(rFilas[ETAPAS.indexOf('Entrega')].total ?? 0)
        setKpiVencidos((r1.data ?? []).filter(p => isVencido(p.createdAt)).length)
        setKpiConcluidosMes((r2.data ?? []).filter(p => isEstesMes(p.createdAt)).length)

        // ── Filas ──
        const filasObj: Partial<Record<Etapa, PedidoSimples[]>> = {}
        const contagemObj: Partial<Record<Etapa, number>> = {}
        ETAPAS.forEach((etapa, i) => {
          filasObj[etapa]    = rFilas[i].data  ?? []
          contagemObj[etapa] = rFilas[i].total ?? 0
        })
        setFilas(filasObj)
        setContagemEtapa(contagemObj)

        // ── Recentes com pendências ──
        setRecentes(
          (r10.data ?? []).filter(
            p => p.etapaOperacional !== 'Conclusao' && p.status !== 'Cancelado'
          )
        )

        // ── Alertas ──
        setAlertaCobrancas(r11.total ?? 0)
        setAlertaContratos(r12.total ?? 0)
        setAlertaEstoque(
          Array.isArray(r13)
            ? r13
            : (r13 as ApiPage<AlertaEstoque>).data ?? []
        )
      })
      .catch(e => setErro(e instanceof Error ? e.message : 'Erro ao carregar dashboard'))
      .finally(() => setLoading(false))
  }, [])

  const dataHora = hora.toLocaleString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const totalAlertas = alertaCobrancas + alertaContratos + alertaEstoque.length

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <PageHeader
        title="Dashboard Operacional"
        subtitle={dataHora}
        action={
          <button
            className={styles.btnSecondary}
            onClick={() => window.location.reload()}
            title="Atualizar"
          >
            ↻ Atualizar
          </button>
        }
      />

      {erro && <p className={styles.error}>{erro}</p>}

      {/* ══ KPI Cards ══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <StatCard
          label="Pedidos em Aberto"
          value={loading ? '—' : kpiAberto}
          sub="aguardando conclusão"
          accent
        />
        <StatCard
          label="Em Entrega"
          value={loading ? '—' : kpiEntrega}
          sub="etapa Entrega"
          style={!loading && kpiEntrega > 0 ? { border: '2px solid #2563eb' } : undefined}
        />
        <StatCard
          label="Pedidos Vencidos"
          value={loading ? '—' : kpiVencidos}
          sub="criados há mais de 30 dias"
          style={!loading && kpiVencidos > 0 ? { border: '2px solid #ef4444' } : undefined}
        />
        <StatCard
          label="Concluídos Este Mês"
          value={loading ? '—' : kpiConcluidosMes}
          sub={hora.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          style={!loading && kpiConcluidosMes > 0 ? { border: '2px solid #22c55e' } : undefined}
        />
      </div>

      {/* ══ Filas por Etapa ══ */}
      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>Filas por Etapa Operacional</h3>
        {loading ? (
          <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Carregando filas…
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6 }}>
            {ETAPAS.map(etapa => {
              const lista    = filas[etapa] ?? []
              const contagem = contagemEtapa[etapa] ?? 0
              const bg       = ETAPA_BG[etapa]
              const fg       = ETAPA_TEXT[etapa]

              return (
                <div
                  key={etapa}
                  style={{ minWidth: 200, maxWidth: 200, background: bg, borderRadius: 10, padding: '14px 12px 10px', flexShrink: 0 }}
                >
                  {/* cabeçalho da fila */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: fg, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {etapa}
                    </span>
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 700,
                      background: 'rgba(0,0,0,0.12)', color: fg,
                      borderRadius: 10, padding: '2px 8px',
                    }}>
                      {contagem}
                    </span>
                  </div>

                  {lista.length === 0 ? (
                    <p style={{ fontSize: '0.73rem', color: fg, opacity: 0.55, margin: 0 }}>Sem pedidos</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {lista.map(p => (
                        <div
                          key={p._id}
                          onClick={() => navigate(`/pedidos/${p._id}`)}
                          style={{
                            background: 'rgba(255,255,255,0.72)',
                            borderRadius: 7, padding: '8px 10px',
                            cursor: 'pointer', transition: 'background 0.12s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.95)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.72)')}
                        >
                          <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#1e293b', fontFamily: 'monospace' }}>
                            {p.numero}
                          </div>
                          <div style={{ fontSize: '0.69rem', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                            {nomeCliente(p.clienteId)}
                          </div>
                          <div style={{ fontSize: '0.71rem', fontWeight: 600, color: '#334155', marginTop: 3 }}>
                            {fmtCurrency(p.valorTotal)}
                          </div>
                        </div>
                      ))}
                      {contagem > 5 && (
                        <button
                          onClick={() => navigate('/pedidos')}
                          style={{
                            background: 'none', border: 'none',
                            fontSize: '0.69rem', color: fg, fontWeight: 700,
                            cursor: 'pointer', textAlign: 'left',
                            padding: '3px 0', opacity: 0.75,
                          }}
                        >
                          +{contagem - 5} mais →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ══ Linha inferior: recentes + alertas ══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>

        {/* ── Pedidos com Pendências ── */}
        <div className={styles.panel} style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 className={styles.panelTitle} style={{ margin: 0 }}>Pedidos com Pendências</h3>
            <button className={styles.btnLink} onClick={() => navigate('/pedidos')}>
              Ver todos →
            </button>
          </div>

          {loading ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Carregando…
            </div>
          ) : recentes.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0', margin: 0 }}>
              Nenhum pedido com pendências.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--surface-border)', background: 'var(--surface-2)' }}>
                    {['Número', 'Cliente', 'Etapa', 'Valor', 'Criado'].map(h => (
                      <th
                        key={h}
                        style={{
                          padding: '8px 12px', textAlign: 'left',
                          fontWeight: 700, color: 'var(--text-secondary)',
                          fontSize: '0.72rem', textTransform: 'uppercase',
                          letterSpacing: '0.05em', whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentes.map(p => {
                    const dias    = diasAtras(p.createdAt)
                    const vencido = dias > 30
                    return (
                      <tr
                        key={p._id}
                        onClick={() => navigate(`/pedidos/${p._id}`)}
                        style={{ borderBottom: '1px solid var(--surface-border)', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                      >
                        <td style={{ padding: '9px 12px', fontWeight: 700, fontFamily: 'monospace', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                          {p.numero}
                        </td>
                        <td style={{ padding: '9px 12px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {nomeCliente(p.clienteId)}
                        </td>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                          <Badge label={p.etapaOperacional} variant="info" />
                        </td>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', fontWeight: 600 }}>
                          {fmtCurrency(p.valorTotal)}
                        </td>
                        <td style={{
                          padding: '9px 12px', whiteSpace: 'nowrap',
                          fontSize: '0.76rem', fontWeight: vencido ? 600 : 400,
                          color: vencido ? 'var(--danger, #ef4444)' : 'var(--text-secondary)',
                        }}>
                          {dias === 0 ? 'Hoje' : `${dias}d atrás`}
                          {vencido && ' ⚠'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Alertas ── */}
        <div className={styles.panel} style={{ marginBottom: 0 }}>
          <h3 className={styles.panelTitle} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Alertas
            {!loading && totalAlertas > 0 && (
              <span style={{
                background: '#ef4444', color: '#fff',
                borderRadius: 10, padding: '1px 8px',
                fontSize: '0.68rem', fontWeight: 700,
              }}>
                {totalAlertas}
              </span>
            )}
          </h3>

          {loading ? (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '16px 0', fontSize: '0.85rem' }}>
              Carregando…
            </div>
          ) : totalAlertas === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: '1.6rem', color: '#22c55e' }}>✓</div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '6px 0 0' }}>
                Nenhum alerta no momento
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {alertaCobrancas > 0 && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate('/cobrancas')}
                  onKeyDown={e => e.key === 'Enter' && navigate('/cobrancas')}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    background: '#fef2f2', border: '1px solid #fecaca',
                    borderRadius: 8, padding: '10px 12px',
                    cursor: 'pointer', transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#fee2e2')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#fef2f2')}
                >
                  <span style={{ fontSize: '1rem', lineHeight: '1.4' }}>⚠</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.81rem', color: '#b91c1c' }}>
                      {alertaCobrancas} cobrança{alertaCobrancas !== 1 ? 's' : ''} vencida{alertaCobrancas !== 1 ? 's' : ''}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#7f1d1d', marginTop: 2 }}>
                      Ir para Cobranças →
                    </div>
                  </div>
                </div>
              )}

              {alertaContratos > 0 && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate('/contratos')}
                  onKeyDown={e => e.key === 'Enter' && navigate('/contratos')}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    background: '#fffbeb', border: '1px solid #fde68a',
                    borderRadius: 8, padding: '10px 12px',
                    cursor: 'pointer', transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#fef3c7')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#fffbeb')}
                >
                  <span style={{ fontSize: '1rem', lineHeight: '1.4' }}>⚠</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.81rem', color: '#92400e' }}>
                      {alertaContratos} contrato{alertaContratos !== 1 ? 's' : ''} vencendo em 30 dias
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#78350f', marginTop: 2 }}>
                      Ir para Contratos →
                    </div>
                  </div>
                </div>
              )}

              {alertaEstoque.length > 0 && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate('/estoque')}
                  onKeyDown={e => e.key === 'Enter' && navigate('/estoque')}
                  style={{
                    background: '#f0f9ff', border: '1px solid #bae6fd',
                    borderRadius: 8, padding: '10px 12px',
                    cursor: 'pointer', transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#e0f2fe')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#f0f9ff')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: '1rem', lineHeight: 1 }}>⚠</span>
                    <span style={{ fontWeight: 700, fontSize: '0.81rem', color: '#0369a1' }}>
                      {alertaEstoque.length} item{alertaEstoque.length !== 1 ? 's' : ''} abaixo do mínimo
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {alertaEstoque.slice(0, 4).map(item => (
                      <div
                        key={item._id}
                        style={{ fontSize: '0.71rem', color: '#0c4a6e', display: 'flex', justifyContent: 'space-between', gap: 6 }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.nome || item.codigo}
                        </span>
                        <span style={{ fontWeight: 700, flexShrink: 0, color: '#dc2626' }}>
                          {item.quantidadeAtual}/{item.quantidadeMinima}
                        </span>
                      </div>
                    ))}
                    {alertaEstoque.length > 4 && (
                      <span style={{ fontSize: '0.69rem', color: '#0369a1', fontWeight: 600 }}>
                        +{alertaEstoque.length - 4} outros →
                      </span>
                    )}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>

      </div>
    </div>
  )
}
