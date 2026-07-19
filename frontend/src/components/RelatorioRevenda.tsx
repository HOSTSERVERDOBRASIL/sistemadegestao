import type { RelatorioRevenda } from '../types'
import styles from '../pages/Page.module.css'

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const CAT_COLOR: Record<string, { bg: string; text: string; bar: string }> = {
  'ICP-Brasil':   { bg: '#eff6ff', text: '#1e40af', bar: '#3b82f6' },
  'Internacional':{ bg: '#f0fdf4', text: '#15803d', bar: '#22c55e' },
  'Equipamento':  { bg: '#fef3c7', text: '#92400e', bar: '#f59e0b' },
  'Outros':       { bg: '#f8fafc', text: '#475569', bar: '#94a3b8' },
}

const SITUACAO_COLOR: Record<string, string> = {
  'Pago com creditos':    '#22c55e',
  'A faturar':            '#f59e0b',
  'Aguardando pagamento': '#3b82f6',
  'Estornado':            '#94a3b8',
  'Sem cobrança revenda': '#e2e8f0',
}

interface Props {
  dados: RelatorioRevenda
  loading?: boolean
}

function BarraHorizontal({ valor, max, cor }: { valor: number; max: number; cor: string }) {
  const pct = max > 0 ? Math.max(2, (valor / max) * 100) : 0
  return (
    <div style={{ height: 8, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: cor, borderRadius: 999, transition: 'width 0.4s' }} />
    </div>
  )
}

export default function RelatorioRevenda({ dados, loading }: Props) {
  if (loading) {
    return <p style={{ color: '#94a3b8', fontSize: '0.875rem', padding: '24px 0' }}>Carregando relatório...</p>
  }

  const maxVolume = Math.max(...dados.volumeMensal.map(m => m.valor), 1)
  const maxQtdCert = Math.max(...dados.certificados.map(c => c.quantidade), 1)
  const maxCliente = Math.max(...dados.topClientes.map(c => c.valor), 1)
  const totalCerts = dados.certificados.reduce((s, c) => s + c.quantidade, 0)
  const totalCobranca = Object.values(dados.cobrancaSituacao).reduce((s, v) => s + v, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* KPIs principais */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 12 }}>
        {[
          { label: 'Saldo de Créditos', value: moeda(dados.saldoCreditos), color: dados.saldoCreditos > 0 ? '#15803d' : '#94a3b8' },
          { label: 'Total Faturado', value: moeda(dados.valorTotalPedidos), color: '#1e293b' },
          { label: 'A Faturar', value: moeda(dados.valorAFaturar), color: dados.valorAFaturar > 0 ? '#b45309' : '#94a3b8' },
          { label: 'Certificados Emitidos', value: totalCerts, color: '#1e293b' },
          { label: 'NFs Emitidas', value: dados.nfsEmitidas, color: '#1e293b' },
          { label: 'Pedidos Ativos', value: dados.pedidosAtivos, color: dados.pedidosAtivos > 0 ? '#1d4ed8' : '#94a3b8' },
        ].map(({ label, value, color }) => (
          <div key={label} className={styles.panel} style={{ margin: 0, padding: '14px 16px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Certificados por categoria */}
        <div className={styles.panel} style={{ margin: 0 }}>
          <h3 className={styles.panelTitle} style={{ marginBottom: 16 }}>Certificados por Categoria</h3>
          {dados.certificados.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Nenhum dado disponível</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {dados.certificados.sort((a, b) => b.quantidade - a.quantidade).map(c => {
                const col = CAT_COLOR[c.categoria] ?? CAT_COLOR['Outros']
                return (
                  <div key={c.categoria}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{
                        fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                        background: col.bg, color: col.text,
                      }}>
                        {c.categoria}
                      </span>
                      <div style={{ textAlign: 'right' }}>
                        <strong style={{ fontSize: '0.9rem' }}>{c.quantidade} cert.</strong>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: 8 }}>{moeda(c.valor)}</span>
                      </div>
                    </div>
                    <BarraHorizontal valor={c.quantidade} max={maxQtdCert} cor={col.bar} />
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 3 }}>
                      {totalCerts > 0 ? ((c.quantidade / totalCerts) * 100).toFixed(1) : 0}% do total
                    </div>
                  </div>
                )
              })}
              <div style={{ borderTop: '1px solid var(--surface-border)', paddingTop: 10, marginTop: 4, display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 700 }}>
                <span>Total</span>
                <span>{totalCerts} certificados · {moeda(dados.certificados.reduce((s, c) => s + c.valor, 0))}</span>
              </div>
            </div>
          )}
        </div>

        {/* Situação de cobrança */}
        <div className={styles.panel} style={{ margin: 0 }}>
          <h3 className={styles.panelTitle} style={{ marginBottom: 16 }}>Situação de Cobrança</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(dados.cobrancaSituacao).map(([sit, qtd]) => {
              const cor = SITUACAO_COLOR[sit] ?? '#94a3b8'
              return (
                <div key={sit}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: cor, flexShrink: 0 }} />
                      <span style={{ fontSize: '0.82rem', color: '#374151' }}>{sit}</span>
                    </div>
                    <strong style={{ fontSize: '0.9rem' }}>
                      {qtd} <span style={{ fontSize: '0.72rem', fontWeight: 400, color: '#64748b' }}>
                        ({totalCobranca > 0 ? ((qtd / totalCobranca) * 100).toFixed(0) : 0}%)
                      </span>
                    </strong>
                  </div>
                  <div style={{ height: 6, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${totalCobranca > 0 ? (qtd / totalCobranca) * 100 : 0}%`, background: cor, borderRadius: 999, transition: 'width 0.4s' }} />
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Status dos Pedidos</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[
                { label: 'Ativos', value: dados.pedidosAtivos, color: '#3b82f6' },
                { label: 'Concluídos', value: dados.pedidosConcluidos, color: '#22c55e' },
                { label: 'Cancelados', value: dados.pedidosCancelados, color: '#f43f5e' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: 'var(--surface-2, #f8fafc)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color }}>{value}</div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Volume mensal — últimos 12 meses */}
      <div className={styles.panel} style={{ margin: 0 }}>
        <h3 className={styles.panelTitle} style={{ marginBottom: 16 }}>Volume Mensal — Últimos 12 Meses</h3>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 120, overflowX: 'auto' }}>
          {dados.volumeMensal.map((m) => {
            const h = maxVolume > 0 ? Math.max(4, (m.valor / maxVolume) * 100) : 4
            return (
              <div key={m.mes} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: '1 0 52px', minWidth: 52 }}>
                <span style={{ fontSize: '0.68rem', color: '#64748b', whiteSpace: 'nowrap' }}>{moeda(m.valor).replace('R$ ', '')}</span>
                <div
                  title={`${m.mes}: ${m.pedidos} pedidos · ${moeda(m.valor)}`}
                  style={{
                    width: '100%', height: `${h}px`, maxHeight: 80,
                    background: m.valor > 0 ? '#3b82f6' : '#e2e8f0',
                    borderRadius: '4px 4px 0 0', transition: 'height 0.4s',
                    cursor: 'default',
                  }}
                />
                <span style={{ fontSize: '0.68rem', color: '#94a3b8', textAlign: 'center' }}>{m.mes}</span>
                {m.pedidos > 0 && <span style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 600 }}>{m.pedidos}p</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Top clientes */}
      {dados.topClientes.length > 0 && (
        <div className={styles.panel} style={{ margin: 0 }}>
          <h3 className={styles.panelTitle} style={{ marginBottom: 12 }}>Top Clientes por Volume</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {dados.topClientes.map((c, i) => (
              <div key={c.nome}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%', background: i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#b45309' : '#e2e8f0',
                      color: i < 3 ? '#fff' : '#64748b',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.7rem', fontWeight: 800, flexShrink: 0,
                    }}>
                      {i + 1}
                    </span>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{c.nome}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong style={{ fontSize: '0.875rem' }}>{moeda(c.valor)}</strong>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: 8 }}>{c.pedidos} ped.</span>
                  </div>
                </div>
                <BarraHorizontal valor={c.valor} max={maxCliente} cor="#3b82f6" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
