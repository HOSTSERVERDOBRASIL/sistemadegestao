import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import Badge from '../components/Badge'
import { relatorios as api, exportar } from '../api'
import type {
  FaturamentoPorCliente, FaturamentoPorModalidade,
  PedidosPorStatus, FaturamentoPorMes, ClientesAtivos, Contrato
} from '../types'
import styles from './Page.module.css'
import rStyles from './Relatorios.module.css'
import fStyles from './Financeiro.module.css'

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function mesLabel(ano: number, mes: number) {
  return new Date(ano, mes - 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
}

export default function Relatorios() {
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [porCliente, setPorCliente] = useState<FaturamentoPorCliente[]>([])
  const [porModalidade, setPorModalidade] = useState<FaturamentoPorModalidade[]>([])
  const [porStatus, setPorStatus] = useState<PedidosPorStatus[]>([])
  const [porMes, setPorMes] = useState<FaturamentoPorMes[]>([])
  const [clientesAtivos, setClientesAtivos] = useState<ClientesAtivos | null>(null)
  const [contratosComSaldo, setContratosComSaldo] = useState<(Contrato & { saldoDisponivel: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [exportandoPedidos, setExportandoPedidos] = useState(false)
  const [exportandoContratos, setExportandoContratos] = useState(false)

  async function handleExportarPedidos() {
    setExportandoPedidos(true)
    try { await exportar.pedidos() } catch { /* silent */ } finally { setExportandoPedidos(false) }
  }

  async function handleExportarContratos() {
    setExportandoContratos(true)
    try { await exportar.contratos() } catch { /* silent */ } finally { setExportandoContratos(false) }
  }

  function carregar() {
    const dateParams = {
      ...(dataInicio ? { dataInicio } : {}),
      ...(dataFim   ? { dataFim   } : {}),
    }
    const meses = dataInicio && dataFim
      ? Math.max(1, Math.round((new Date(dataFim).getTime() - new Date(dataInicio).getTime()) / (30 * 24 * 60 * 60 * 1000)))
      : 12
    setLoading(true)
    Promise.all([
      api.porCliente(),
      api.porModalidade(),
      api.porStatus(),
      api.porMes(meses),
      api.clientesAtivos(),
      api.contratosComSaldo(),
    ]).then(([pc, pm, ps, pmm, ca, cs]) => {
      setPorCliente(pc)
      setPorModalidade(pm)
      setPorStatus(ps)
      setPorMes(pmm)
      setClientesAtivos(ca)
      setContratosComSaldo(cs as (Contrato & { saldoDisponivel: number })[])
    }).finally(() => setLoading(false))
    void dateParams
  }

  useEffect(() => { carregar() }, [])

  const maxMes = Math.max(...porMes.map(m => m.total), 1)

  if (loading) return <div className={styles.page}><p style={{ color: '#94a3b8', padding: 40 }}>Carregando relatórios...</p></div>

  return (
    <div className={styles.page}>
      <PageHeader
        title="Relatórios"
        subtitle="Análises e indicadores do sistema"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={styles.btnSecondary} onClick={handleExportarPedidos} disabled={exportandoPedidos}>
              {exportandoPedidos ? 'Exportando...' : '⬇ Pedidos CSV'}
            </button>
            <button className={styles.btnSecondary} onClick={handleExportarContratos} disabled={exportandoContratos}>
              {exportandoContratos ? 'Exportando...' : '⬇ Contratos CSV'}
            </button>
          </div>
        }
      />

      <div className={fStyles.dateFilters}>
        <label>
          De
          <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
        </label>
        <label>
          Até
          <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
        </label>
        <button className={styles.btnPrimary} onClick={carregar}>
          Filtrar
        </button>
        {(dataInicio || dataFim) && (
          <button className={styles.btnSecondary} onClick={() => { setDataInicio(''); setDataFim(''); setTimeout(carregar, 0) }}>
            Limpar
          </button>
        )}
      </div>

      {/* Clientes */}
      {clientesAtivos && (
        <div className={rStyles.statsGrid}>
          <StatCard label="Total Clientes" value={clientesAtivos.total} />
          <StatCard label="Clientes Ativos" value={clientesAtivos.ativos} accent />
          <StatCard label="Pessoas Jurídicas" value={clientesAtivos.pessoaJuridica} />
          <StatCard label="Pessoas Físicas" value={clientesAtivos.pessoaFisica} />
        </div>
      )}

      <div className={rStyles.grid2}>
        {/* Faturamento por mês */}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Faturamento Mensal — 12 meses</h3>
          {porMes.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Sem dados</p> : (
            <div className={rStyles.barChart}>
              {porMes.map(m => (
                <div key={`${m._id.ano}-${m._id.mes}`} className={rStyles.barGroup}>
                  <div className={rStyles.barWrap}>
                    <div className={rStyles.bar} style={{ height: `${Math.round((m.total / maxMes) * 100)}%` }} title={moeda(m.total)} />
                  </div>
                  <span className={rStyles.barLabel}>{mesLabel(m._id.ano, m._id.mes)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pedidos por status */}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Pedidos por Status</h3>
          <div className={rStyles.pieList}>
            {porStatus.map(s => (
              <div key={s._id} className={rStyles.pieRow}>
                <Badge label={s._id} />
                <div className={rStyles.pieMeta}>
                  <span className={rStyles.pieCount}>{s.total} pedido(s)</span>
                  <span className={rStyles.pieValor}>{moeda(s.valor)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={rStyles.grid2}>
        {/* Faturamento por modalidade */}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Faturamento por Modalidade de Vínculo</h3>
          <table className={rStyles.dataTable}>
            <thead><tr><th>Modalidade</th><th>Pedidos</th><th>Total Faturado</th></tr></thead>
            <tbody>
              {porModalidade.length === 0 ? (
                <tr><td colSpan={3} style={{ textAlign: 'center', color: '#94a3b8', padding: '20px' }}>Sem dados</td></tr>
              ) : porModalidade.map(m => (
                <tr key={m._id}>
                  <td><Badge label={m._id} variant="info" /></td>
                  <td>{m.pedidos}</td>
                  <td><strong>{moeda(m.totalFaturado)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Top clientes */}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Top Clientes — Faturamento</h3>
          <table className={rStyles.dataTable}>
            <thead><tr><th>#</th><th>Cliente</th><th>Pedidos</th><th>Total</th></tr></thead>
            <tbody>
              {porCliente.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8', padding: '20px' }}>Sem dados</td></tr>
              ) : porCliente.slice(0, 10).map((c, i) => (
                <tr key={c.clienteId}>
                  <td style={{ color: '#94a3b8', fontWeight: 700 }}>#{i + 1}</td>
                  <td><strong>{c.nomeCliente || '—'}</strong><br /><span style={{ fontSize: '0.75rem', color: '#64748b' }}>{c.documentoCliente}</span></td>
                  <td>{c.pedidos}</td>
                  <td><strong>{moeda(c.totalFaturado)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Contratos com saldo */}
      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>Contratos com Saldo Disponível</h3>
        <table className={rStyles.dataTable}>
          <thead>
            <tr><th>Número</th><th>Modalidade</th><th>Valor Total</th><th>Faturado</th><th>Saldo Disponível</th></tr>
          </thead>
          <tbody>
            {contratosComSaldo.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: '20px' }}>Nenhum contrato com saldo</td></tr>
            ) : contratosComSaldo.map(c => (
              <tr key={c._id}>
                <td><strong>{c.numero}</strong></td>
                <td><Badge label={c.modalidade} variant="info" /></td>
                <td>{moeda(c.valorTotal)}</td>
                <td>{moeda(c.valorFaturado)}</td>
                <td><strong style={{ color: '#15803d' }}>{moeda(c.saldoDisponivel)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
