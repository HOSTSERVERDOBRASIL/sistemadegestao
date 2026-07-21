import { useEffect, useState, useCallback } from 'react'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import { fmtCurrency } from '../utils/fmt'
import styles from './Page.module.css'
import dreStyles from './DRE.module.css'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CentroItem {
  centro: string
  valor: number
}

interface DreMensal {
  periodo: string
  receitas: { pedidosFaturados: number; totalReceitas: number }
  despesas: { porCentro: CentroItem[]; totalDespesas: number }
  resultado: { lucrobruto: number; margemBruta: number }
}

interface MesAnual {
  mes: number
  mesNome: string
  receitas: number
  despesas: number
  resultado: number
}

interface DreAnual {
  ano: number
  meses: MesAnual[]
}

interface FluxoHistorico {
  mes: string
  entradas: number
  saidas: number
  saldo: number
}

interface FluxoProjecao {
  mes: string
  entradasPrevistas: number
  saidasPrevistas: number
  saldoPrevisto: number
}

interface FluxoCaixa {
  saldoAtual: number
  historico: FluxoHistorico[]
  projecao: FluxoProjecao[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function authHeader() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` }
}

function fmtMesAno(mesKey: string): string {
  const [y, m] = mesKey.split('-')
  const d = new Date(Number(y), Number(m) - 1, 1)
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
}

const ANOS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)
const MESES = [
  { v: 1, l: 'Janeiro' }, { v: 2, l: 'Fevereiro' }, { v: 3, l: 'Março' },
  { v: 4, l: 'Abril' }, { v: 5, l: 'Maio' }, { v: 6, l: 'Junho' },
  { v: 7, l: 'Julho' }, { v: 8, l: 'Agosto' }, { v: 9, l: 'Setembro' },
  { v: 10, l: 'Outubro' }, { v: 11, l: 'Novembro' }, { v: 12, l: 'Dezembro' },
]

// ─── Bar chart (CSS) ──────────────────────────────────────────────────────────

function BarChart({ data }: { data: MesAnual[] }) {
  const max = Math.max(...data.map(d => Math.max(d.receitas, d.despesas)), 1)
  return (
    <div className={dreStyles.barChart}>
      {data.map(d => (
        <div key={d.mes} className={dreStyles.barGroup}>
          <div className={dreStyles.barPair}>
            <div
              className={dreStyles.barRec}
              style={{ height: `${Math.round((d.receitas / max) * 100)}%` }}
              title={`Receitas: ${fmtCurrency(d.receitas)}`}
            />
            <div
              className={dreStyles.barDesp}
              style={{ height: `${Math.round((d.despesas / max) * 100)}%` }}
              title={`Despesas: ${fmtCurrency(d.despesas)}`}
            />
          </div>
          <span className={dreStyles.barLabel}>{d.mesNome}</span>
        </div>
      ))}
      <div className={dreStyles.barLegend}>
        <span className={dreStyles.legendRec}>Receitas</span>
        <span className={dreStyles.legendDesp}>Despesas</span>
      </div>
    </div>
  )
}

// ─── Stacked bar chart (CSS) for fluxo ───────────────────────────────────────

function FluxoBarChart({ data }: { data: FluxoHistorico[] }) {
  const maxVal = Math.max(...data.map(d => Math.max(d.entradas, d.saidas)), 1)
  return (
    <div className={dreStyles.barChart}>
      {data.map(d => (
        <div key={d.mes} className={dreStyles.barGroup}>
          <div className={dreStyles.barPair}>
            <div
              className={dreStyles.barRec}
              style={{ height: `${Math.round((d.entradas / maxVal) * 100)}%` }}
              title={`Entradas: ${fmtCurrency(d.entradas)}`}
            />
            <div
              className={dreStyles.barDesp}
              style={{ height: `${Math.round((d.saidas / maxVal) * 100)}%` }}
              title={`Saídas: ${fmtCurrency(d.saidas)}`}
            />
          </div>
          <span className={dreStyles.barLabel}>{fmtMesAno(d.mes)}</span>
        </div>
      ))}
      <div className={dreStyles.barLegend}>
        <span className={dreStyles.legendRec}>Entradas</span>
        <span className={dreStyles.legendDesp}>Saídas</span>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DRE() {
  const now = new Date()
  const [tab, setTab] = useState<'dre' | 'fluxo'>('dre')
  const [anoMensal, setAnoMensal] = useState(now.getFullYear())
  const [mesMensal, setMesMensal] = useState(now.getMonth() + 1)
  const [anoAnual, setAnoAnual] = useState(now.getFullYear())

  const [dreMensal, setDreMensal] = useState<DreMensal | null>(null)
  const [dreAnual, setDreAnual] = useState<DreAnual | null>(null)
  const [fluxo, setFluxo] = useState<FluxoCaixa | null>(null)

  const [loadingMensal, setLoadingMensal] = useState(false)
  const [loadingAnual, setLoadingAnual] = useState(false)
  const [loadingFluxo, setLoadingFluxo] = useState(false)

  const [errMensal, setErrMensal] = useState('')
  const [errAnual, setErrAnual] = useState('')
  const [errFluxo, setErrFluxo] = useState('')

  const fetchMensal = useCallback(async () => {
    setLoadingMensal(true)
    setErrMensal('')
    try {
      const r = await fetch(`/api/dre/mensal?ano=${anoMensal}&mes=${mesMensal}`, { headers: authHeader() })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setDreMensal(await r.json())
    } catch {
      setErrMensal('Falha ao carregar DRE mensal.')
    } finally {
      setLoadingMensal(false)
    }
  }, [anoMensal, mesMensal])

  const fetchAnual = useCallback(async () => {
    setLoadingAnual(true)
    setErrAnual('')
    try {
      const r = await fetch(`/api/dre/anual?ano=${anoAnual}`, { headers: authHeader() })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setDreAnual(await r.json())
    } catch {
      setErrAnual('Falha ao carregar DRE anual.')
    } finally {
      setLoadingAnual(false)
    }
  }, [anoAnual])

  const fetchFluxo = useCallback(async () => {
    setLoadingFluxo(true)
    setErrFluxo('')
    try {
      const r = await fetch('/api/dre/fluxo-caixa?meses=6', { headers: authHeader() })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setFluxo(await r.json())
    } catch {
      setErrFluxo('Falha ao carregar Fluxo de Caixa.')
    } finally {
      setLoadingFluxo(false)
    }
  }, [])

  useEffect(() => { fetchMensal() }, [fetchMensal])
  useEffect(() => { fetchAnual() }, [fetchAnual])
  useEffect(() => { fetchFluxo() }, [fetchFluxo])

  // ── DRE Mensal tab ──────────────────────────────────────────────────────────
  function renderDRE() {
    return (
      <div>
        {/* Seletores */}
        <div className={dreStyles.controls}>
          <select
            value={mesMensal}
            onChange={e => setMesMensal(Number(e.target.value))}
            className={dreStyles.select}
          >
            {MESES.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
          <select
            value={anoMensal}
            onChange={e => setAnoMensal(Number(e.target.value))}
            className={dreStyles.select}
          >
            {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button className={styles.btnSecondary} onClick={fetchMensal} disabled={loadingMensal}>
            {loadingMensal ? 'Carregando...' : 'Atualizar'}
          </button>
        </div>

        {errMensal && <p className={styles.error}>{errMensal}</p>}

        {dreMensal && (
          <>
            {/* KPI cards */}
            <div className={dreStyles.kpiRow}>
              <StatCard
                label="Receitas"
                value={fmtCurrency(dreMensal.receitas.totalReceitas)}
                sub="Pedidos concluídos"
                style={{ '--card-accent': 'var(--success)' } as React.CSSProperties}
              />
              <StatCard
                label="Despesas"
                value={fmtCurrency(dreMensal.despesas.totalDespesas)}
                sub="Contas pagas"
                style={{ '--card-accent': 'var(--danger)' } as React.CSSProperties}
              />
              <StatCard
                label="Resultado"
                value={fmtCurrency(dreMensal.resultado.lucrobruto)}
                sub={dreMensal.resultado.lucrobruto >= 0 ? 'Lucro' : 'Prejuízo'}
                accent={dreMensal.resultado.lucrobruto >= 0}
              />
              <StatCard
                label="Margem Bruta"
                value={`${dreMensal.resultado.margemBruta.toFixed(1)}%`}
                sub={dreMensal.periodo}
              />
            </div>

            {/* Tabela despesas por centro */}
            <div className={styles.panel}>
              <p className={styles.panelTitle}>Despesas por Centro de Custo</p>
              {dreMensal.despesas.porCentro.length === 0 ? (
                <p className={dreStyles.empty}>Nenhuma despesa no período.</p>
              ) : (
                <table className={dreStyles.table}>
                  <thead>
                    <tr>
                      <th>Centro de Custo</th>
                      <th className={dreStyles.right}>Valor</th>
                      <th className={dreStyles.right}>% Total</th>
                      <th style={{ width: 180 }}>Participação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dreMensal.despesas.porCentro
                      .slice()
                      .sort((a, b) => b.valor - a.valor)
                      .map(c => {
                        const pct = dreMensal.despesas.totalDespesas > 0
                          ? (c.valor / dreMensal.despesas.totalDespesas) * 100
                          : 0
                        return (
                          <tr key={c.centro}>
                            <td className={dreStyles.centroCell}>{c.centro}</td>
                            <td className={dreStyles.right}>{fmtCurrency(c.valor)}</td>
                            <td className={dreStyles.right}>{pct.toFixed(1)}%</td>
                            <td>
                              <div className={dreStyles.progressBg}>
                                <div
                                  className={dreStyles.progressBar}
                                  style={{ width: `${Math.min(pct, 100)}%` }}
                                />
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                  <tfoot>
                    <tr className={dreStyles.tableFooter}>
                      <td><strong>Total</strong></td>
                      <td className={dreStyles.right}>
                        <strong>{fmtCurrency(dreMensal.despesas.totalDespesas)}</strong>
                      </td>
                      <td className={dreStyles.right}><strong>100%</strong></td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* Gráfico anual */}
            <div className={styles.panel}>
              <p className={styles.panelTitle}>Evolução Anual — {anoAnual}</p>
              <div className={dreStyles.anoControls}>
                <select
                  value={anoAnual}
                  onChange={e => setAnoAnual(Number(e.target.value))}
                  className={dreStyles.select}
                >
                  {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              {errAnual && <p className={styles.error}>{errAnual}</p>}
              {loadingAnual && <p className={dreStyles.loading}>Carregando...</p>}
              {dreAnual && <BarChart data={dreAnual.meses} />}
            </div>
          </>
        )}
      </div>
    )
  }

  // ── Fluxo de Caixa tab ──────────────────────────────────────────────────────
  function renderFluxo() {
    return (
      <div>
        {errFluxo && <p className={styles.error}>{errFluxo}</p>}
        {loadingFluxo && <p className={dreStyles.loading}>Carregando...</p>}

        {fluxo && (
          <>
            {/* Saldo atual destacado */}
            <div className={dreStyles.saldoCard}>
              <span className={dreStyles.saldoLabel}>Saldo Atual Estimado</span>
              <span
                className={`${dreStyles.saldoValue} ${fluxo.saldoAtual >= 0 ? dreStyles.positive : dreStyles.negative}`}
              >
                {fmtCurrency(fluxo.saldoAtual)}
              </span>
              <span className={dreStyles.saldoSub}>Cobranças recebidas − Contas pagas (histórico total)</span>
            </div>

            {/* Mini gráfico histórico */}
            <div className={styles.panel}>
              <p className={styles.panelTitle}>Histórico — últimos 6 meses</p>
              <FluxoBarChart data={fluxo.historico} />
            </div>

            {/* Tabela histórico */}
            <div className={styles.panel}>
              <p className={styles.panelTitle}>Entradas e Saídas — Histórico</p>
              <table className={dreStyles.table}>
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th className={dreStyles.right}>Entradas</th>
                    <th className={dreStyles.right}>Saídas</th>
                    <th className={dreStyles.right}>Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {fluxo.historico.map(h => (
                    <tr key={h.mes}>
                      <td>{fmtMesAno(h.mes)}</td>
                      <td className={`${dreStyles.right} ${dreStyles.textSuccess}`}>{fmtCurrency(h.entradas)}</td>
                      <td className={`${dreStyles.right} ${dreStyles.textDanger}`}>{fmtCurrency(h.saidas)}</td>
                      <td
                        className={`${dreStyles.right} ${h.saldo >= 0 ? dreStyles.textSuccess : dreStyles.textDanger}`}
                      >
                        {fmtCurrency(h.saldo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tabela projeção */}
            <div className={styles.panel}>
              <p className={styles.panelTitle}>Projeção — próximos {fluxo.projecao.length} meses</p>
              <table className={dreStyles.table}>
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th className={dreStyles.right}>Entradas Previstas</th>
                    <th className={dreStyles.right}>Saídas Previstas</th>
                    <th className={dreStyles.right}>Saldo Previsto</th>
                  </tr>
                </thead>
                <tbody>
                  {fluxo.projecao.map((p, idx) => (
                    <tr key={p.mes} className={idx === 0 ? dreStyles.projecaoFirst : ''}>
                      <td>{fmtMesAno(p.mes)}</td>
                      <td className={`${dreStyles.right} ${dreStyles.textSuccess}`}>{fmtCurrency(p.entradasPrevistas)}</td>
                      <td className={`${dreStyles.right} ${dreStyles.textDanger}`}>{fmtCurrency(p.saidasPrevistas)}</td>
                      <td
                        className={`${dreStyles.right} ${p.saldoPrevisto >= 0 ? dreStyles.textSuccess : dreStyles.textDanger}`}
                      >
                        {fmtCurrency(p.saldoPrevisto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="DRE Gerencial & Fluxo de Caixa"
        subtitle="Demonstrativo de resultado e projeção de entradas/saídas"
      />

      {/* Tabs */}
      <div className={dreStyles.tabs}>
        <button
          className={`${dreStyles.tab} ${tab === 'dre' ? dreStyles.tabActive : ''}`}
          onClick={() => setTab('dre')}
        >
          DRE Mensal
        </button>
        <button
          className={`${dreStyles.tab} ${tab === 'fluxo' ? dreStyles.tabActive : ''}`}
          onClick={() => setTab('fluxo')}
        >
          Fluxo de Caixa
        </button>
      </div>

      <div className={dreStyles.tabContent}>
        {tab === 'dre' ? renderDRE() : renderFluxo()}
      </div>
    </div>
  )
}
