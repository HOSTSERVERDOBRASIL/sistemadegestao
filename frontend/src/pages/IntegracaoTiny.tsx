import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Badge from '../components/Badge'
import Table from '../components/Table'
import Pagination from '../components/Pagination'
import Modal from '../components/Modal'
import { tiny as api, pedidos as pedidosApi } from '../api'
import type { TinySync, TinyStatus, Pedido } from '../types'
import { useAuth } from '../context/AuthContext'
import styles from './Page.module.css'
import tStyles from './IntegracaoTiny.module.css'
import { fmtDateTime } from '../utils/fmt'

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'warning'> = {
  sincronizado: 'success',
  erro: 'danger',
  pendente: 'warning',
}

export default function IntegracaoTiny() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [status, setStatus] = useState<TinyStatus | null>(null)
  const [syncs, setSyncs] = useState<TinySync[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [sincronizandoTodos, setSincronizandoTodos] = useState(false)
  const [importando, setImportando] = useState(false)
  const [showSyncPedido, setShowSyncPedido] = useState(false)
  const [buscaPedido, setBuscaPedido] = useState('')
  const [pedidosBusca, setPedidosBusca] = useState<Pedido[]>([])
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [resultado, setResultado] = useState<string | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importPagina, setImportPagina] = useState(1)

  function loadStatus() {
    if (!isAdmin) return
    api.status().then(setStatus).catch(() => setStatus({ configurado: false, stats: { total: 0, sincronizados: 0, erros: 0, pendentes: 0 } }))
  }

  function loadSyncs() {
    setLoading(true)
    api.syncs({ tipo: filtroTipo, status: filtroStatus, page, limit: 20 })
      .then(r => { setSyncs(r.data); setTotal(r.total) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadStatus() }, [])
  useEffect(() => { loadSyncs() }, [page, filtroTipo, filtroStatus])

  async function handleSincronizarTodosProdutos() {
    setSincronizandoTodos(true)
    setResultado(null)
    try {
      const r = await api.sincronizarTodosProdutos()
      setResultado(`✓ ${r.sincronizados} sincronizado(s), ${r.erros} erro(s)`)
      loadStatus(); loadSyncs()
    } catch (err) {
      setResultado(`✗ ${err instanceof Error ? err.message : 'Erro'}`)
    } finally { setSincronizandoTodos(false) }
  }

  async function handleImportar() {
    setImportando(true)
    setResultado(null)
    try {
      const r = await api.importarProdutos(importPagina)
      setResultado(`✓ ${r.importados.length} importado(s), ${r.existentes.length} já existiam`)
      setShowImportModal(false)
      loadStatus(); loadSyncs()
    } catch (err) {
      setResultado(`✗ ${err instanceof Error ? err.message : 'Erro'}`)
    } finally { setImportando(false) }
  }

  async function buscarPedidos() {
    if (!buscaPedido.trim()) return
    const r = await pedidosApi.list({ busca: buscaPedido, limit: 10 })
    setPedidosBusca(r.data)
  }

  async function handleSyncPedido(pedidoId: string) {
    setSyncingId(pedidoId); setResultado(null)
    try {
      const r = await api.sincronizarPedido(pedidoId)
      setResultado(`✓ ${r.message}`)
      loadStatus(); loadSyncs()
    } catch (err) {
      setResultado(`✗ ${err instanceof Error ? err.message : 'Erro'}`)
    } finally { setSyncingId(null) }
  }

  const columns = [
    { key: 'tipo', header: 'Tipo', render: (r: TinySync) => <Badge label={r.tipo} variant="info" /> },
    { key: 'localId', header: 'ID Local', render: (r: TinySync) => <code style={{ fontSize: '0.72rem' }}>{r.localId}</code> },
    { key: 'tinyId', header: 'ID Tiny', render: (r: TinySync) => r.tinyId ? <code style={{ fontSize: '0.72rem' }}>{r.tinyId}</code> : <span style={{ color: '#94a3b8' }}>—</span> },
    { key: 'tinyNumero', header: 'Nº Tiny', render: (r: TinySync) => r.tinyNumero ?? '—' },
    {
      key: 'status', header: 'Status',
      render: (r: TinySync) => <Badge label={r.status} variant={STATUS_VARIANT[r.status] ?? 'default'} />
    },
    { key: 'ultimaSync', header: 'Última Sync', render: (r: TinySync) => fmtDateTime(r.ultimaSync) },
    {
      key: 'erro', header: 'Erro',
      render: (r: TinySync) => r.erro
        ? <span title={r.erro} style={{ color: '#b91c1c', fontSize: '0.75rem', maxWidth: 200, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.erro}</span>
        : null
    },
  ]

  return (
    <div className={styles.page}>
      <PageHeader
        title="Integração Tiny / Olist"
        subtitle="Sincronização com ERP Tiny"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={styles.btnSecondary} onClick={() => setShowImportModal(true)}>⬇ Importar do Tiny</button>
            <button className={styles.btnSecondary} onClick={handleSincronizarTodosProdutos} disabled={sincronizandoTodos}>
              {sincronizandoTodos ? 'Sincronizando...' : '↑ Sync Produtos'}
            </button>
            <button className={styles.btnPrimary} onClick={() => setShowSyncPedido(true)}>↑ Sync Pedido</button>
          </div>
        }
      />

      {/* Status cards */}
      {status && (
        <div className={tStyles.statusGrid}>
          <div className={`${tStyles.statusCard} ${status.configurado ? tStyles.ok : tStyles.warn}`}>
            <span className={tStyles.statusIcon}>{status.configurado ? '✓' : '!'}</span>
            <div>
              <div className={tStyles.statusLabel}>Integração</div>
              <div className={tStyles.statusVal}>{status.configurado ? 'Configurada' : 'Sem token'}</div>
            </div>
          </div>
          <div className={tStyles.statusCard}>
            <span className={tStyles.statusIcon} style={{ background: '#dbeafe', color: '#1e40af' }}>∑</span>
            <div><div className={tStyles.statusLabel}>Total</div><div className={tStyles.statusVal}>{status.stats.total}</div></div>
          </div>
          <div className={tStyles.statusCard}>
            <span className={tStyles.statusIcon} style={{ background: '#dcfce7', color: '#15803d' }}>✓</span>
            <div><div className={tStyles.statusLabel}>Sincronizados</div><div className={tStyles.statusVal}>{status.stats.sincronizados}</div></div>
          </div>
          <div className={tStyles.statusCard}>
            <span className={tStyles.statusIcon} style={{ background: '#fee2e2', color: '#b91c1c' }}>✗</span>
            <div><div className={tStyles.statusLabel}>Erros</div><div className={tStyles.statusVal}>{status.stats.erros}</div></div>
          </div>
          <div className={tStyles.statusCard}>
            <span className={tStyles.statusIcon} style={{ background: '#fef9c3', color: '#854d0e' }}>⏳</span>
            <div><div className={tStyles.statusLabel}>Pendentes</div><div className={tStyles.statusVal}>{status.stats.pendentes}</div></div>
          </div>
        </div>
      )}

      {resultado && (
        <div className={`${tStyles.resultado} ${resultado.startsWith('✓') ? tStyles.ok : tStyles.error}`}>
          {resultado}
          <button onClick={() => setResultado(null)} className={tStyles.fechar}>✕</button>
        </div>
      )}

      {/* Filtros + tabela */}
      <div className={styles.panel}>
        <div className={styles.filters} style={{ marginBottom: 14 }}>
          <select value={filtroTipo} onChange={e => { setFiltroTipo(e.target.value); setPage(1) }}>
            <option value="">Todos os tipos</option>
            <option value="produto">Produto</option>
            <option value="pedido">Pedido</option>
            <option value="cliente">Cliente</option>
          </select>
          <select value={filtroStatus} onChange={e => { setFiltroStatus(e.target.value); setPage(1) }}>
            <option value="">Todos os status</option>
            <option value="sincronizado">Sincronizado</option>
            <option value="erro">Erro</option>
            <option value="pendente">Pendente</option>
          </select>
          <button className={styles.btnSecondary} onClick={loadSyncs}>↻ Atualizar</button>
        </div>
        <Table
          columns={columns}
          rows={syncs}
          loading={loading}
          empty="Nenhum registro de sincronização"
        />
        <Pagination page={page} total={total} limit={20} onChange={setPage} />
      </div>

      {/* Modal sync pedido */}
      {showSyncPedido && (
        <Modal title="Sincronizar Pedido com Tiny" onClose={() => setShowSyncPedido(false)} size="md">
          <div className={styles.form}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className={styles.search}
                placeholder="Buscar por número do pedido..."
                value={buscaPedido}
                onChange={e => setBuscaPedido(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && buscarPedidos()}
              />
              <button type="button" className={styles.btnSecondary} onClick={buscarPedidos}>Buscar</button>
            </div>
            {pedidosBusca.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {pedidosBusca.map(p => (
                  <div key={p._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div>
                      <strong>{p.numero}</strong>
                      <span style={{ color: '#64748b', fontSize: '0.8rem', marginLeft: 8 }}>{p.etapaOperacional}</span>
                    </div>
                    <button
                      className={styles.btnPrimary}
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      disabled={syncingId === p._id}
                      onClick={() => handleSyncPedido(p._id)}
                    >
                      {syncingId === p._id ? 'Enviando...' : '↑ Enviar'}
                    </button>
                  </div>
                ))}
              </div>
            )}
            {resultado && (
              <p style={{ color: resultado.startsWith('✓') ? '#15803d' : '#b91c1c', fontSize: '0.875rem', margin: 0 }}>{resultado}</p>
            )}
          </div>
        </Modal>
      )}

      {/* Modal importar produtos */}
      {showImportModal && (
        <Modal title="Importar Produtos do Tiny" onClose={() => setShowImportModal(false)} size="sm">
          <div className={styles.form}>
            <p style={{ color: '#374151', fontSize: '0.875rem', margin: 0 }}>
              Importa produtos do Tiny que ainda não existem no sistema. Produtos com o mesmo código serão ignorados.
            </p>
            <label>Página do Tiny
              <input type="number" min={1} value={importPagina} onChange={e => setImportPagina(Number(e.target.value))} />
            </label>
            {resultado && (
              <p style={{ color: resultado.startsWith('✓') ? '#15803d' : '#b91c1c', fontSize: '0.875rem', margin: 0 }}>{resultado}</p>
            )}
            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowImportModal(false)}>Cancelar</button>
              <button type="button" className={styles.btnPrimary} onClick={handleImportar} disabled={importando}>
                {importando ? 'Importando...' : 'Importar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
