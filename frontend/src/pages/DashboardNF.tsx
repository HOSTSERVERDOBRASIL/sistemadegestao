import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { fmtDate } from '../utils/fmt'

import Badge from '../components/Badge'
import { financeiro as api } from '../api'
import styles from './DashboardNF.module.css'
import pageStyles from './Page.module.css'

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function mesLabel(ano: number, mes: number) {
  return new Date(ano, mes - 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
}
function delta(atual: number, anterior: number) {
  if (anterior === 0) return null
  const pct = ((atual - anterior) / anterior) * 100
  return { pct: Math.abs(pct).toFixed(1), up: pct >= 0 }
}

type DashboardData = {
  kpi: {
    mesAtual: { emitidas: number; totalEmitido: number; pendentes: number; canceladas: number }
    mesAnterior: { emitidas: number; totalEmitido: number; pendentes: number }
  }
  porSituacaoSefaz: { _id: string; total: number; quantidade: number }[]
  porTipoFaturamento: { _id: string; total: number; quantidade: number }[]
  porEmissor: { _id: string; total: number; quantidade: number }[]
  porMes12: { _id: { ano: number; mes: number }; total: number; quantidade: number }[]
  filaAtencao: {
    _id: string; numero: string; valor: number; status: string; situacaoTiny?: string
    erroEmissao?: string; createdAt: string
    clienteId?: { nome: string; documento: string } | string
    pedidoId?: { numero: string } | string
  }[]
  topClientes: { _id: string; totalFaturado: number; quantidade: number; nomeCliente?: string; documentoCliente?: string }[]
}

const SEFAZ_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'default' | 'info'> = {
  Autorizada: 'success',
  Erro: 'danger',
  Rascunho: 'warning',
  Cancelada: 'default',
  SemIntegracao: 'info',
}
const TIPO_COLORS: Record<string, string> = {
  Total: '#3b82f6',
  Demanda: '#10b981',
  Fechamento: '#f59e0b',
  Avulsa: '#8b5cf6',
}

export default function DashboardNF() {
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = useCallback(() => {
    setLoading(true)
    setErro('')
    api.dashboardNF()
      .then(setData)
      .catch(e => setErro(e instanceof Error ? e.message : 'Erro ao carregar dashboard'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const maxMes = Math.max(...(data?.porMes12 ?? []).map(m => m.total), 1)
  const totalSefaz = (data?.porSituacaoSefaz ?? []).reduce((s, r) => s + r.quantidade, 0)
  const totalTipo = (data?.porTipoFaturamento ?? []).reduce((s, r) => s + r.total, 0)

  const deltaEmitidas = data ? delta(data.kpi.mesAtual.emitidas, data.kpi.mesAnterior.emitidas) : null
  const deltaMontante = data ? delta(data.kpi.mesAtual.totalEmitido, data.kpi.mesAnterior.totalEmitido) : null

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Dashboard NF"
        subtitle="Visão analítica de Notas Fiscais"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={pageStyles.btnSecondary} onClick={() => navigate('/financeiro/emitir')}>
              + Emitir NF
            </button>
            <button className={pageStyles.btnSecondary} onClick={() => navigate('/financeiro')}>
              Ver todas as NFs
            </button>
            <button className={pageStyles.btnSecondary} onClick={carregar} disabled={loading}>
              {loading ? '...' : '↺ Atualizar'}
            </button>
          </div>
        }
      />

      {erro && <p className={pageStyles.error} style={{ marginBottom: 16 }}>{erro}</p>}

      {/* ── KPIs mês atual ── */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>NFs Emitidas — mês atual</span>
          <span className={styles.kpiValue}>{loading ? '—' : data?.kpi.mesAtual.emitidas ?? 0}</span>
          {deltaEmitidas && (
            <span className={`${styles.kpiDelta} ${deltaEmitidas.up ? styles.up : styles.down}`}>
              {deltaEmitidas.up ? '▲' : '▼'} {deltaEmitidas.pct}% vs mês anterior
            </span>
          )}
        </div>
        <div className={`${styles.kpiCard} ${styles.kpiAccent}`}>
          <span className={styles.kpiLabel}>Montante Emitido — mês atual</span>
          <span className={styles.kpiValue}>{loading ? '—' : moeda(data?.kpi.mesAtual.totalEmitido ?? 0)}</span>
          {deltaMontante && (
            <span className={`${styles.kpiDelta} ${deltaMontante.up ? styles.up : styles.down}`}>
              {deltaMontante.up ? '▲' : '▼'} {deltaMontante.pct}% vs mês anterior
            </span>
          )}
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>NFs Pendentes — mês atual</span>
          <span className={`${styles.kpiValue} ${(data?.kpi.mesAtual.pendentes ?? 0) > 0 ? styles.warn : ''}`}>
            {loading ? '—' : data?.kpi.mesAtual.pendentes ?? 0}
          </span>
          <span className={styles.kpiSub}>aguardando emissão / com erro</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>NFs Canceladas — mês atual</span>
          <span className={`${styles.kpiValue} ${(data?.kpi.mesAtual.canceladas ?? 0) > 0 ? styles.danger : ''}`}>
            {loading ? '—' : data?.kpi.mesAtual.canceladas ?? 0}
          </span>
          <span className={styles.kpiSub}>
            Mês anterior: {loading ? '—' : data?.kpi.mesAnterior.emitidas ?? 0} emitidas · {moeda(data?.kpi.mesAnterior.totalEmitido ?? 0)}
          </span>
        </div>
      </div>

      {/* ── Gráfico + Situação SEFAZ ── */}
      <div className={styles.grid2}>
        {/* Evolução mensal */}
        <div className={pageStyles.panel}>
          <h3 className={pageStyles.panelTitle}>Evolução Mensal — 12 meses (Emitidas)</h3>
          {loading ? (
            <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Carregando...</p>
          ) : (data?.porMes12 ?? []).length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Sem dados</p>
          ) : (
            <div className={styles.barChart}>
              {(data?.porMes12 ?? []).map(m => (
                <div key={`${m._id.ano}-${m._id.mes}`} className={styles.barGroup}>
                  <span className={styles.barQtd}>{m.quantidade}</span>
                  <div className={styles.barWrap}>
                    <div
                      className={styles.bar}
                      style={{ height: `${Math.max(4, Math.round((m.total / maxMes) * 100))}%` }}
                      title={`${moeda(m.total)} — ${m.quantidade} NF(s)`}
                    />
                  </div>
                  <span className={styles.barLabel}>{mesLabel(m._id.ano, m._id.mes)}</span>
                  <span className={styles.barValue}>{moeda(m.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Situação SEFAZ */}
        <div className={pageStyles.panel}>
          <h3 className={pageStyles.panelTitle}>Situação SEFAZ</h3>
          {loading ? (
            <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Carregando...</p>
          ) : (data?.porSituacaoSefaz ?? []).length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Sem dados</p>
          ) : (
            <div className={styles.sefazList}>
              {(data?.porSituacaoSefaz ?? []).map(r => {
                const pct = totalSefaz > 0 ? Math.round((r.quantidade / totalSefaz) * 100) : 0
                return (
                  <div key={r._id} className={styles.sefazRow}>
                    <Badge label={r._id} variant={SEFAZ_VARIANT[r._id] ?? 'default'} />
                    <div className={styles.sefazBarWrap}>
                      <div className={styles.sefazBar} style={{ width: `${pct}%`, background: r._id === 'Autorizada' ? '#10b981' : r._id === 'Erro' ? '#ef4444' : r._id === 'Rascunho' ? '#f59e0b' : '#94a3b8' }} />
                    </div>
                    <span className={styles.sefazQtd}>{r.quantidade}</span>
                    <span className={styles.sefazTotal}>{moeda(r.total)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Tipo Faturamento + Emissor ── */}
      <div className={styles.grid2}>
        {/* Por tipo de faturamento */}
        <div className={pageStyles.panel}>
          <h3 className={pageStyles.panelTitle}>Por Tipo de Faturamento (Emitidas)</h3>
          {loading ? (
            <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Carregando...</p>
          ) : (data?.porTipoFaturamento ?? []).length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Sem dados</p>
          ) : (
            <div className={styles.tipoList}>
              {(data?.porTipoFaturamento ?? []).map(r => {
                const pct = totalTipo > 0 ? Math.round((r.total / totalTipo) * 100) : 0
                const cor = TIPO_COLORS[r._id] ?? '#64748b'
                return (
                  <div key={r._id} className={styles.tipoRow}>
                    <div className={styles.tipoLabel}>
                      <span className={styles.tipoDot} style={{ background: cor }} />
                      <span>{r._id}</span>
                    </div>
                    <div className={styles.tipoBarWrap}>
                      <div className={styles.tipoBar} style={{ width: `${pct}%`, background: cor }} />
                    </div>
                    <div className={styles.tipoMeta}>
                      <span className={styles.tipoQtd}>{r.quantidade} NF(s)</span>
                      <span className={styles.tipoTotal}>{moeda(r.total)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Por emissor */}
        <div className={pageStyles.panel}>
          <h3 className={pageStyles.panelTitle}>Por Emissor — últimos 12 meses</h3>
          {loading ? (
            <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Carregando...</p>
          ) : (data?.porEmissor ?? []).length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Sem dados</p>
          ) : (
            <div className={styles.emissorList}>
              {(data?.porEmissor ?? []).map(r => (
                <div key={r._id} className={styles.emissorCard}>
                  <Badge label={r._id} variant="info" />
                  <div className={styles.emissorNumbers}>
                    <span className={styles.emissorQtd}>{r.quantidade} notas</span>
                    <span className={styles.emissorTotal}>{moeda(r.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Top clientes ── */}
      <div className={pageStyles.panel}>
        <h3 className={pageStyles.panelTitle}>Top Clientes — últimos 12 meses (Emitidas)</h3>
        {loading ? (
          <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Carregando...</p>
        ) : (data?.topClientes ?? []).length === 0 ? (
          <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Sem dados</p>
        ) : (
          <table className={styles.rankTable}>
            <thead>
              <tr>
                <th>#</th>
                <th>Cliente</th>
                <th>Documento</th>
                <th>Notas</th>
                <th>Total Faturado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(data?.topClientes ?? []).map((c, i) => (
                <tr key={c._id} className={styles.rankRow} onClick={() => navigate(`/clientes/${c._id}`)}>
                  <td className={styles.rankPos}>
                    <span className={i < 3 ? styles.rankBadgeTop : styles.rankBadge}>#{i + 1}</span>
                  </td>
                  <td><strong>{c.nomeCliente || '—'}</strong></td>
                  <td style={{ color: '#64748b', fontSize: '0.8rem' }}>{c.documentoCliente || '—'}</td>
                  <td>{c.quantidade}</td>
                  <td><strong style={{ color: '#15803d' }}>{moeda(c.totalFaturado)}</strong></td>
                  <td>
                    <button
                      className={pageStyles.btnSecondary}
                      style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                      onClick={e => { e.stopPropagation(); navigate(`/financeiro?clienteId=${c._id}`) }}
                    >
                      Ver NFs
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Fila de atenção ── */}
      {!loading && (data?.filaAtencao ?? []).length > 0 && (
        <div className={pageStyles.panel} style={{ borderColor: '#fbbf24' }}>
          <h3 className={pageStyles.panelTitle} style={{ color: '#b45309' }}>
            ⚠ Fila de Atenção — Pendentes e Erros SEFAZ ({data!.filaAtencao.length})
          </h3>
          <table className={styles.rankTable}>
            <thead>
              <tr>
                <th>Número NF</th>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Valor</th>
                <th>Status</th>
                <th>SEFAZ</th>
                <th>Data</th>
                <th>Erro</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data!.filaAtencao.map(nf => {
                const cliente = typeof nf.clienteId === 'object' && nf.clienteId ? nf.clienteId.nome : '—'
                const pedido = typeof nf.pedidoId === 'object' && nf.pedidoId ? nf.pedidoId.numero : '—'
                return (
                  <tr key={nf._id} className={styles.rankRow}>
                    <td><strong>{nf.numero}</strong></td>
                    <td style={{ color: '#64748b', fontSize: '0.8rem' }}>{pedido}</td>
                    <td>{cliente}</td>
                    <td>{moeda(nf.valor)}</td>
                    <td><Badge label={nf.status} /></td>
                    <td>
                      {nf.situacaoTiny
                        ? <Badge label={nf.situacaoTiny} variant={SEFAZ_VARIANT[nf.situacaoTiny] ?? 'default'} />
                        : <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>—</span>
                      }
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{fmtDate(nf.createdAt)}</td>
                    <td style={{ fontSize: '0.72rem', color: '#b91c1c', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nf.erroEmissao}>
                      {nf.erroEmissao || '—'}
                    </td>
                    <td>
                      <button
                        className={pageStyles.btnSecondary}
                        style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                        onClick={() => navigate('/financeiro/pendentes')}
                      >
                        Resolver
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
