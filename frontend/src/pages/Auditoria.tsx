import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Pagination from '../components/Pagination'
import Badge from '../components/Badge'
import { auditoria as api } from '../api'
import type { AuditoriaEntry } from '../types'
import styles from './Page.module.css'

function fmt(data: string) { return new Date(data).toLocaleString('pt-BR') }

export default function Auditoria() {
  const [rows, setRows] = useState<AuditoriaEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [entidade, setEntidade] = useState('')
  const [acao, setAcao] = useState('')
  const [loading, setLoading] = useState(true)
  const load = useCallback(() => {
    setLoading(true)
    api.list({ page, limit: 50, entidade: entidade || undefined, acao: acao || undefined })
      .then(res => { setRows(res.data); setTotal(res.total) }).finally(() => setLoading(false))
  }, [page, entidade, acao])
  useEffect(() => { load() }, [load])

  return <div className={styles.page}>
    <PageHeader title="Auditoria" subtitle={`${total} evento(s) de negócio`} />
    <div className={styles.filters}>
      <select value={entidade} onChange={e => { setEntidade(e.target.value); setPage(1) }}>
        <option value="">Todas as entidades</option>
        {['Cliente', 'Contrato', 'Pedido', 'NotaFiscal', 'Integracao'].map(item => <option key={item}>{item}</option>)}
      </select>
      <input className={styles.search} placeholder="Filtrar por ação..." value={acao} onChange={e => { setAcao(e.target.value); setPage(1) }} />
    </div>
    {loading ? <p>Carregando...</p> : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map(row => <div key={row._id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge label={row.entidade} variant="info" /><strong>{row.acao}</strong><span style={{ color: '#64748b' }}>{fmt(row.createdAt)}</span><span style={{ marginLeft: 'auto', color: '#64748b' }}>{row.origem}</span>
        </div>
        <small>ID: {row.entidadeId}{typeof row.usuarioId === 'object' ? ` · ${row.usuarioId.nome}` : ''}</small>
        {row.detalhes && <pre style={{ background: '#f8fafc', padding: 8, overflow: 'auto', fontSize: 11 }}>{JSON.stringify(row.detalhes, null, 2)}</pre>}
      </div>)}
      {rows.length === 0 && <p>Nenhum evento encontrado.</p>}
    </div>}
    <Pagination page={page} total={total} limit={50} onChange={setPage} />
  </div>
}
