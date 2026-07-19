import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Badge from '../components/Badge'
import { clm as api } from '../api'
import type { ClmEvent } from '../types'
import styles from './Page.module.css'

function fmt(d: string) { return new Date(d).toLocaleString('pt-BR') }

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'default' | 'info'> = {
  processed: 'success',
  sent: 'info',
  pending: 'warning',
  retrying: 'warning',
  failed: 'danger',
}

export default function IntegracaoCLM() {
  const [porStatus, setPorStatus] = useState<Record<string, number>>({})
  const [ultimos, setUltimos] = useState<ClmEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [retentando, setRetentando] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api.resumo()
      .then(r => { setPorStatus(r.porStatus); setUltimos(r.ultimos) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function handleRetentar(eventId: string) {
    setRetentando(eventId); setMsg('')
    try {
      const r = await api.retentar(eventId)
      setMsg(r.message ?? 'Evento reenviado com sucesso.')
      load()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Erro ao retentar')
    } finally { setRetentando(null) }
  }

  const total = Object.values(porStatus).reduce((a, b) => a + b, 0)
  const falhas = porStatus['failed'] ?? 0

  return (
    <div className={styles.page}>
      <PageHeader
        title="Integração CLM"
        subtitle="Monitoramento de eventos de integração com o CLM"
        action={<button className={styles.btnSecondary} onClick={load} disabled={loading}>↻ Atualizar</button>}
      />

      {/* Cards de status */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        {[
          { key: 'processed', label: 'Processados', color: '#15803d' },
          { key: 'sent',      label: 'Enviados',    color: '#3b82f6' },
          { key: 'pending',   label: 'Pendentes',   color: '#b45309' },
          { key: 'retrying',  label: 'Retentando',  color: '#7c3aed' },
          { key: 'failed',    label: 'Falhas',      color: '#b91c1c' },
        ].map(s => (
          <div key={s.key} style={{
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
            padding: '14px 20px', minWidth: 120, flex: '0 0 auto',
          }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: s.color }}>
              {porStatus[s.key] ?? 0}
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
        <div style={{
          background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
          padding: '14px 20px', minWidth: 100, flex: '0 0 auto',
        }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#374151' }}>{total}</div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>Total</div>
        </div>
      </div>

      {falhas > 0 && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8,
          padding: '10px 16px', marginBottom: 16, color: '#b91c1c', fontSize: '0.85rem',
        }}>
          ⚠ {falhas} evento(s) com falha — use "Retentar" para reenviar individualmente.
        </div>
      )}

      {msg && (
        <div style={{
          background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8,
          padding: '10px 16px', marginBottom: 16, color: '#15803d', fontSize: '0.85rem',
        }}>
          {msg}
        </div>
      )}

      <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' }}>
        Últimos 20 eventos
      </h3>

      {loading ? (
        <p style={{ color: '#94a3b8', textAlign: 'center', padding: '32px 0' }}>Carregando...</p>
      ) : ultimos.length === 0 ? (
        <p style={{ color: '#94a3b8', textAlign: 'center', padding: '32px 0' }}>Nenhum evento registrado.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ultimos.map(ev => (
            <div key={ev._id} style={{
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
              padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12,
            }}>
              <Badge label={ev.status} variant={STATUS_VARIANT[ev.status] as 'success' | 'warning' | 'danger' | 'default' | 'info' | undefined ?? 'default'} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{ev.type}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                  {fmt(ev.createdAt)}
                  {ev.retries > 0 && ` · ${ev.retries} retentativa(s)`}
                </div>
                {ev.error && (
                  <div style={{ fontSize: '0.75rem', color: '#b91c1c', marginTop: 4, fontFamily: 'monospace', background: '#fef2f2', padding: '4px 8px', borderRadius: 4 }}>
                    {ev.error}
                  </div>
                )}
              </div>
              {ev.status === 'failed' && (
                <button
                  className={styles.btnSecondary}
                  style={{ fontSize: '0.75rem', flexShrink: 0 }}
                  disabled={retentando === ev._id}
                  onClick={() => handleRetentar(ev._id)}
                >
                  {retentando === ev._id ? 'Enviando...' : 'Retentar'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
