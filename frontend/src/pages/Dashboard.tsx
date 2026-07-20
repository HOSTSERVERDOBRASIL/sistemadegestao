import { useEffect, useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import Badge from '../components/Badge'
import { relatorios, pedidos as pedidosApi, cobrancas as cobrancasApi, certificadosICP as certICPApi } from '../api'
import type { ResumoGeral, FaturamentoPorMes, PedidosPorStatus, Pedido } from '../types'
import styles from './Dashboard.module.css'

const ETAPAS = ['Pedido', 'Pagamento', 'Validacao', 'Preparacao', 'Processamento', 'Entrega', 'Conclusao']

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function mesLabel(ano: number, mes: number) {
  return new Date(ano, mes - 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [resumo, setResumo] = useState<ResumoGeral | null>(null)
  const [porMes, setPorMes] = useState<FaturamentoPorMes[]>([])
  const [porStatus, setPorStatus] = useState<PedidosPorStatus[]>([])
  const [porEtapa, setPorEtapa] = useState<Record<string, number>>({})
  const [recentes, setRecentes] = useState<Pedido[]>([])
  const [cobrancasAbertas, setCobrancasAbertas] = useState<number>(0)
  const [certsVencendo, setCertsVencendo] = useState<number>(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      relatorios.resumo(),
      relatorios.porMes(6),
      relatorios.porStatus(),
      pedidosApi.list({ limit: 8 }),
      cobrancasApi.listAll({ status: 'ATIVA', page: 1 }),
      // conta pedidos por etapa buscando cada uma (max 7 chamadas leves)
      Promise.all(ETAPAS.map(e => pedidosApi.list({ etapa: e, limit: 1 }).then(r => ({ etapa: e, total: r.total })))),
      certICPApi.vencendo(30).catch(() => []).then(r => Array.isArray(r) ? r.length : 0),
    ]).then(([r, m, s, p, cob, etapas, certs]) => {
      setResumo(r)
      setPorMes(m)
      setPorStatus(s)
      setRecentes(p.data)
      setCobrancasAbertas((cob as { total: number }).total ?? 0)
      setPorEtapa(Object.fromEntries((etapas as { etapa: string; total: number }[]).map(e => [e.etapa, e.total])))
      setCertsVencendo(certs as number)
    }).finally(() => setLoading(false))
  }, [])

  if (user?.role === 'revenda') {
    return <Navigate to="/portal-revenda" replace />
  }

  const maxMes = Math.max(...porMes.map(m => m.total), 1)

  return (
    <div className={styles.page}>
      <PageHeader title="Dashboard" subtitle="Visão geral do sistema" />

      <div className={styles.cards}>
        <StatCard label="Total de Pedidos" value={loading ? '—' : resumo?.pedidos ?? 0} accent />
        <StatCard label="Notas Emitidas" value={loading ? '—' : resumo?.notasEmitidas ?? 0} />
        <StatCard label="Pedidos Faturados" value={loading ? '—' : resumo?.pedidosFaturados ?? 0} />
        <StatCard
          label="Total Faturado"
          value={loading ? '—' : moeda(resumo?.totalFaturado ?? 0)}
          sub="NFs emitidas"
        />
        <StatCard
          label="Cobranças Abertas"
          value={loading ? '—' : cobrancasAbertas}
          sub="status ATIVA"
        />
        <StatCard
          label="Certs ICP Vencendo"
          value={loading ? '—' : certsVencendo}
          sub="próximos 30 dias"
          style={certsVencendo > 0 ? { border: '2px solid #f59e0b' } : undefined}
        />
      </div>

      <div className={styles.grid2}>
        {/* Gráfico de faturamento por mês */}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Faturamento — últimos 6 meses</h3>
          {porMes.length === 0 ? (
            <p className={styles.empty}>Sem dados</p>
          ) : (
            <div className={styles.barChart}>
              {porMes.map(m => (
                <div key={`${m._id.ano}-${m._id.mes}`} className={styles.barGroup}>
                  <div className={styles.barWrap}>
                    <div
                      className={styles.bar}
                      style={{ height: `${Math.round((m.total / maxMes) * 100)}%` }}
                      title={moeda(m.total)}
                    />
                  </div>
                  <span className={styles.barLabel}>{mesLabel(m._id.ano, m._id.mes)}</span>
                  <span className={styles.barValue}>{moeda(m.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Status dos pedidos */}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Pedidos por status</h3>
          {porStatus.length === 0 ? (
            <p className={styles.empty}>Sem dados</p>
          ) : (
            <div className={styles.statusList}>
              {porStatus.map(s => (
                <div key={s._id} className={styles.statusRow}>
                  <Badge label={s._id} />
                  <span className={styles.statusCount}>{s.total}</span>
                  <span className={styles.statusValor}>{moeda(s.valor)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Funil de etapas */}
      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>Fluxo operacional — 7 etapas</h3>
        <div className={styles.etapas}>
          {ETAPAS.map((e, i) => (
            <div key={e} className={styles.etapa}>
              <div className={styles.etapaNum}>{i + 1}</div>
              <div className={styles.etapaInfo}>
                <span className={styles.etapaLabel}>{e}</span>
                <span className={styles.etapaCount}>
                  {loading ? '…' : (porEtapa[e] ?? 0)}
                </span>
              </div>
              {i < ETAPAS.length - 1 && <div className={styles.etapaArrow}>›</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Pedidos recentes */}
      <div className={styles.panel}>
        <div className={styles.panelHeaderRow}>
          <h3 className={styles.panelTitle}>Pedidos recentes</h3>
          <button className={styles.linkBtn} onClick={() => navigate('/pedidos')}>Ver todos →</button>
        </div>
        {recentes.length === 0 ? (
          <p className={styles.empty}>Nenhum pedido ainda</p>
        ) : (
          <table className={styles.miniTable}>
            <thead>
              <tr>
                <th>Número</th><th>Cliente</th><th>Produto</th><th>Valor</th><th>Etapa</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentes.map(p => {
                const cliente = typeof p.clienteId === 'object' ? p.clienteId.nome : p.clienteId
                const produto = typeof p.produtoId === 'object' ? p.produtoId.nome : p.produtoId
                return (
                  <tr key={p._id} className={styles.clickable} onClick={() => navigate(`/pedidos/${p._id}`)}>
                    <td><strong>{p.numero}</strong></td>
                    <td>{cliente}</td>
                    <td>{produto}</td>
                    <td>{moeda(p.valorTotal)}</td>
                    <td><Badge label={p.etapaOperacional} variant="info" /></td>
                    <td><Badge label={p.status} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
