import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Pagination from '../components/Pagination'
import Badge from '../components/Badge'
import { admin as api } from '../api'
import type { LogEntry, LogStats } from '../types'
import styles from './Page.module.css'

const LEVELS = ['warn', 'error', 'fatal']

function levelVariant(level: string): 'warning' | 'danger' | 'default' {
  if (level === 'fatal' || level === 'error') return 'danger'
  if (level === 'warn') return 'warning'
  return 'default'
}

function fmt(d: string) {
  return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })
}

export default function Logs() {
  const [rows, setRows] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<LogStats | null>(null)
  const [level, setLevel] = useState('warn')
  const [busca, setBusca] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [limpando, setLimpando] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.logs({ level, busca: busca || undefined, de: de || undefined, ate: ate || undefined, page, limit: 50 })
      .then(r => { setRows(r.data); setTotal(r.total) })
      .finally(() => setLoading(false))
  }, [level, busca, de, ate, page])

  useEffect(() => { load() }, [load])
  useEffect(() => { api.logStats(24).then(setStats).catch(() => null) }, [])

  async function handleLimpar() {
    if (!confirm('Remover logs com mais de 7 dias?')) return
    setLimpando(true)
    try {
      const r = await api.limparLogs(7)
      alert(r.message)
      load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro')
    } finally { setLimpando(false) }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Logs do sistema"
        subtitle={`${total} ocorrência(s)`}
        action={
          <button className={styles.btnDesativar} onClick={handleLimpar} disabled={limpando} style={{ fontSize: '0.8rem' }}>
            {limpando ? 'Limpando...' : '🗑 Limpar &gt;7 dias'}
          </button>
        }
      />

      {stats && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 16px', fontSize: '0.82rem' }}>
            <strong style={{ color: '#92400e' }}>{stats.stats.warn}</strong>
            <span style={{ color: '#78350f', marginLeft: 4 }}>warn</span>
          </div>
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 16px', fontSize: '0.82rem' }}>
            <strong style={{ color: '#b91c1c' }}>{stats.stats.error}</strong>
            <span style={{ color: '#7f1d1d', marginLeft: 4 }}>error</span>
          </div>
          <div style={{ background: '#1e1b4b', border: '1px solid #312e81', borderRadius: 8, padding: '8px 16px', fontSize: '0.82rem' }}>
            <strong style={{ color: '#fff' }}>{stats.stats.fatal}</strong>
            <span style={{ color: '#c7d2fe', marginLeft: 4 }}>fatal</span>
          </div>
          <div style={{ color: '#64748b', fontSize: '0.75rem', alignSelf: 'center', marginLeft: 4 }}>
            últimas 24h
          </div>
        </div>
      )}

      <div className={styles.filters}>
        <select value={level} onChange={e => { setLevel(e.target.value); setPage(1) }}>
          {LEVELS.map(l => <option key={l} value={l}>{l}+</option>)}
        </select>
        <input
          className={styles.search}
          placeholder="Buscar mensagem..."
          value={busca}
          onChange={e => { setBusca(e.target.value); setPage(1) }}
        />
        <input type="date" value={de} onChange={e => { setDe(e.target.value); setPage(1) }} title="De" />
        <input type="date" value={ate} onChange={e => { setAte(e.target.value); setPage(1) }} title="Até" />
      </div>

      {loading ? (
        <p style={{ color: '#94a3b8', padding: 24 }}>Carregando...</p>
      ) : rows.length === 0 ? (
        <p style={{ color: '#94a3b8', padding: 24 }}>Nenhum log encontrado para os filtros selecionados.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {rows.map(row => (
            <div
              key={row._id}
              onClick={() => setExpanded(expanded === row._id ? null : row._id)}
              style={{
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderLeft: `4px solid ${row.level === 'fatal' ? '#312e81' : row.level === 'error' ? '#dc2626' : '#f59e0b'}`,
                borderRadius: 6,
                padding: '10px 14px',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Badge label={row.level.toUpperCase()} variant={levelVariant(row.level)} />
                <span style={{ fontSize: '0.75rem', color: '#64748b', flexShrink: 0 }}>{fmt(row.createdAt)}</span>
                {row.req && (
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', flexShrink: 0 }}>
                    {row.req.method} {row.req.url}
                    {row.res ? ` → ${row.res.statusCode}` : ''}
                  </span>
                )}
                <span style={{ fontSize: '0.82rem', color: '#1e293b', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.message}
                </span>
                <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{expanded === row._id ? '▲' : '▼'}</span>
              </div>

              {expanded === row._id && (
                <div style={{ marginTop: 10, borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
                  {row.err && (
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {row.err.type ?? 'Error'}
                      </span>
                      <p style={{ margin: '4px 0', fontSize: '0.82rem', color: '#1e293b' }}>{row.err.message}</p>
                      {row.err.stack && (
                        <pre style={{
                          margin: '6px 0 0',
                          fontSize: '0.7rem',
                          color: '#475569',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: 4,
                          padding: '8px 10px',
                          overflowX: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                          maxHeight: 200,
                          overflow: 'auto',
                        }}>
                          {row.err.stack}
                        </pre>
                      )}
                    </div>
                  )}
                  {row.req?.remoteAddress && (
                    <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '2px 0' }}>
                      IP: {row.req.remoteAddress}
                    </p>
                  )}
                  {row.extra && Object.keys(row.extra).length > 0 && (
                    <pre style={{
                      fontSize: '0.72rem',
                      color: '#475569',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: 4,
                      padding: '6px 10px',
                      overflowX: 'auto',
                      margin: '4px 0 0',
                    }}>
                      {JSON.stringify(row.extra, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} total={total} limit={50} onChange={p => { setPage(p); setExpanded(null) }} />
    </div>
  )
}
