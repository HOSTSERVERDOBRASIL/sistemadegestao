import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Table from '../components/Table'
import Pagination from '../components/Pagination'
import Badge from '../components/Badge'
import { auditoria as api, usuarios as usuariosApi } from '../api'
import type { AuditoriaEntry, User } from '../types'
import styles from './Page.module.css'

function fmt(data: string) { return new Date(data).toLocaleString('pt-BR') }

const ENTIDADES = ['Cliente', 'Contrato', 'Pedido', 'NotaFiscal', 'Integracao', 'Cupom', 'Produto', 'Parceiro', 'NotaEmpenho', 'Usuario']

export default function Auditoria() {
  const [rows, setRows] = useState<AuditoriaEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [entidade, setEntidade] = useState('')
  const [acao, setAcao] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [usuarioId, setUsuarioId] = useState('')
  const [usuariosList, setUsuariosList] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    api.list({
      page, limit: 50,
      entidade: entidade || undefined,
      acao: acao || undefined,
      de: de || undefined,
      ate: ate || undefined,
      usuarioId: usuarioId || undefined,
    })
      .then(res => { setRows(res.data); setTotal(res.total) })
      .finally(() => setLoading(false))
  }, [page, entidade, acao, de, ate, usuarioId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    usuariosApi.list({ limit: 200 }).then(r => setUsuariosList(r.data)).catch(() => null)
  }, [])

  function resetFiltros() {
    setEntidade(''); setAcao(''); setDe(''); setAte(''); setUsuarioId(''); setPage(1)
  }

  const temFiltro = entidade || acao || de || ate || usuarioId

  const columns = [
    {
      key: 'entidade', header: 'Entidade', width: '120px',
      render: (r: AuditoriaEntry) => <Badge label={r.entidade} variant="info" />,
    },
    {
      key: 'acao', header: 'Ação', width: '180px',
      render: (r: AuditoriaEntry) => <strong style={{ fontSize: '0.82rem' }}>{r.acao}</strong>,
    },
    {
      key: 'usuario', header: 'Usuário',
      render: (r: AuditoriaEntry) =>
        typeof r.usuarioId === 'object' ? r.usuarioId.nome : (r.usuarioId ?? '—'),
    },
    {
      key: 'data', header: 'Data / Hora', width: '160px',
      render: (r: AuditoriaEntry) => <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{fmt(r.createdAt)}</span>,
    },
    {
      key: 'origem', header: 'Origem', width: '90px',
      render: (r: AuditoriaEntry) => <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{r.origem}</span>,
    },
    {
      key: '_expand', header: '', width: '36px',
      render: (r: AuditoriaEntry) => r.detalhes ? (
        <button
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#3b82f6' }}
          onClick={e => { e.stopPropagation(); setExpanded(prev => prev === r._id ? null : r._id) }}
        >
          {expanded === r._id ? '▲' : '▼'}
        </button>
      ) : null,
    },
  ]

  return (
    <div className={styles.page}>
      <PageHeader title="Auditoria" subtitle={`${total} evento(s) de negócio`} />

      <div className={styles.filters} style={{ flexWrap: 'wrap', gap: 8 }}>
        <select value={entidade} onChange={e => { setEntidade(e.target.value); setPage(1) }}>
          <option value="">Todas as entidades</option>
          {ENTIDADES.map(item => <option key={item}>{item}</option>)}
        </select>

        <input
          className={styles.search}
          placeholder="Filtrar por ação..."
          value={acao}
          onChange={e => { setAcao(e.target.value); setPage(1) }}
          style={{ maxWidth: 200 }}
        />

        <select value={usuarioId} onChange={e => { setUsuarioId(e.target.value); setPage(1) }}>
          <option value="">Todos os usuários</option>
          {usuariosList.map(u => <option key={u._id} value={u._id}>{u.nome}</option>)}
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', color: '#64748b' }}>
          De
          <input
            type="date"
            value={de}
            onChange={e => { setDe(e.target.value); setPage(1) }}
            style={{ fontSize: '0.82rem', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6 }}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', color: '#64748b' }}>
          Até
          <input
            type="date"
            value={ate}
            onChange={e => { setAte(e.target.value); setPage(1) }}
            style={{ fontSize: '0.82rem', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6 }}
          />
        </label>

        {temFiltro && (
          <button className={styles.btnSecondary} onClick={resetFiltros} style={{ fontSize: '0.78rem' }}>
            Limpar filtros
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ color: '#94a3b8', padding: '32px 0', textAlign: 'center' }}>Carregando...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <Table
            columns={columns}
            rows={rows}
            loading={false}
            empty="Nenhum evento encontrado."
          />
          {expanded && rows.find(r => r._id === expanded)?.detalhes && (
            <div style={{
              background: '#f8fafc', border: '1px solid #e2e8f0', borderTop: 'none',
              borderRadius: '0 0 8px 8px', padding: '12px 16px',
            }}>
              <pre style={{ margin: 0, fontSize: '0.75rem', overflow: 'auto', color: '#334155' }}>
                {JSON.stringify(rows.find(r => r._id === expanded)!.detalhes, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      <Pagination page={page} total={total} limit={50} onChange={setPage} />
    </div>
  )
}
