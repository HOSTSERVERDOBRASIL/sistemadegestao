import { useEffect, useState, useCallback } from 'react'
import PageHeader from '../components/PageHeader'
import Table from '../components/Table'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import { cobrancas as api, pedidos as pedidosApi } from '../api'
import type { Cobranca, TipoCobranca, Pedido } from '../types'
import styles from './Page.module.css'
import cStyles from './Cobrancas.module.css'

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmt(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR')
}

const STATUS_LABEL: Record<string, { label: string; variant: string }> = {
  ATIVA: { label: 'Aguardando', variant: 'warning' },
  CONCLUIDA: { label: 'Pago', variant: 'success' },
  REMOVIDA_PELO_USUARIO_RECEBEDOR: { label: 'Cancelada', variant: 'danger' },
  REMOVIDA_PELO_PSP: { label: 'Cancelada PSP', variant: 'danger' },
  EXPIRADA: { label: 'Expirada', variant: 'default' },
}

const STATUS_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'ATIVA', label: 'Aguardando' },
  { value: 'CONCLUIDA', label: 'Pago' },
  { value: 'EXPIRADA', label: 'Expirado' },
  { value: 'REMOVIDA_PELO_USUARIO_RECEBEDOR', label: 'Cancelado' },
]

const TIPO_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'pix', label: 'PIX' },
  { value: 'pix_vencimento', label: 'PIX c/ Venc.' },
  { value: 'boleto', label: 'Boleto' },
]

type Tab = 'geral' | 'pedido'

export default function Cobrancas() {
  const [activeTab, setActiveTab] = useState<Tab>('geral')

  // ── Visão Geral (todas as cobranças) ──────────────────────────────────────
  const [allList, setAllList] = useState<Cobranca[]>([])
  const [allTotal, setAllTotal] = useState(0)
  const [allPage, setAllPage] = useState(1)
  const [allLoading, setAllLoading] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterTipo, setFilterTipo] = useState('')

  const carregarTodas = useCallback(() => {
    setAllLoading(true)
    api.listAll({ status: filterStatus || undefined, tipo: filterTipo || undefined, page: allPage })
      .then(r => { setAllList(r.data); setAllTotal(r.total) })
      .catch(() => { /* silencioso */ })
      .finally(() => setAllLoading(false))
  }, [filterStatus, filterTipo, allPage])

  useEffect(() => {
    if (activeTab === 'geral') carregarTodas()
  }, [activeTab, carregarTodas])

  // Reset page when filters change
  useEffect(() => { setAllPage(1) }, [filterStatus, filterTipo])

  // ── Por Pedido ────────────────────────────────────────────────────────────
  const [pedidoId, setPedidoId] = useState('')
  const [cobrancasList, setCobrancasList] = useState<Cobranca[]>([])
  const [loading, setLoading] = useState(false)
  const [pedidoSelecionado, setPedidoSelecionado] = useState<Pedido | null>(null)
  const [pedidosBusca, setPedidosBusca] = useState<Pedido[]>([])
  const [buscaPedido, setBuscaPedido] = useState('')
  const [searching, setSearching] = useState(false)

  const buscarPedidos = useCallback(() => {
    if (!buscaPedido.trim()) return
    setSearching(true)
    pedidosApi.list({ busca: buscaPedido, limit: 10 })
      .then(r => setPedidosBusca(r.data))
      .finally(() => setSearching(false))
  }, [buscaPedido])

  const carregarCobrancas = useCallback(() => {
    if (!pedidoId) return
    setLoading(true)
    api.porPedido(pedidoId)
      .then(setCobrancasList)
      .finally(() => setLoading(false))
  }, [pedidoId])

  useEffect(() => { carregarCobrancas() }, [carregarCobrancas])

  // ── Modal criar cobrança ──────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false)
  const [tipo, setTipo] = useState<TipoCobranca>('pix')
  const [valor, setValor] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // ── Modal detalhe ─────────────────────────────────────────────────────────
  const [cobrancaDetalhe, setCobrancaDetalhe] = useState<Cobranca | null>(null)

  async function handleCriar(e: React.FormEvent) {
    e.preventDefault()
    if (!pedidoId) return
    setSaving(true); setError('')
    try {
      const body = {
        pedidoId,
        valor: valor ? Number(valor) : undefined,
        ...(tipo !== 'pix' ? { vencimento } : {}),
      }
      if (tipo === 'pix') await api.criarPix(body)
      else if (tipo === 'pix_vencimento') await api.criarPixVencimento(body as { pedidoId: string; vencimento: string })
      else await api.criarBoleto(body as { pedidoId: string; vencimento: string })
      setShowModal(false); setValor(''); setVencimento('')
      carregarCobrancas()
      if (activeTab === 'geral') carregarTodas()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar cobrança')
    } finally { setSaving(false) }
  }

  async function handleCancelar(cobranca: Cobranca) {
    if (!confirm(`Cancelar cobrança ${cobranca.tipo.toUpperCase()} de ${moeda(cobranca.valor)}?`)) return
    try {
      await api.cancelar(cobranca._id)
      carregarCobrancas()
      if (activeTab === 'geral') carregarTodas()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro')
    }
  }

  async function handleAtualizar(cobranca: Cobranca) {
    try {
      const atualizada = await api.get(cobranca._id)
      setCobrancasList(prev => prev.map(c => c._id === atualizada._id ? atualizada : c))
      setAllList(prev => prev.map(c => c._id === atualizada._id ? atualizada : c))
      if (cobrancaDetalhe?._id === atualizada._id) setCobrancaDetalhe(atualizada)
    } catch { /* silent */ }
  }

  function getPedidoNumero(cobranca: Cobranca): string {
    const pid = cobranca.pedidoId as unknown as { numero?: string } | string
    if (pid && typeof pid === 'object' && 'numero' in pid) return pid.numero ?? '—'
    return '—'
  }

  const columnsGeral = [
    {
      key: 'pedido', header: 'Pedido',
      render: (r: Cobranca) => {
        const num = getPedidoNumero(r)
        return num !== '—'
          ? <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{num}</span>
          : <span style={{ color: '#94a3b8' }}>—</span>
      }
    },
    { key: 'tipo', header: 'Tipo', render: (r: Cobranca) => <Badge label={r.tipo.toUpperCase()} variant="info" /> },
    { key: 'valor', header: 'Valor', render: (r: Cobranca) => <strong>{moeda(r.valor)}</strong> },
    {
      key: 'status', header: 'Status',
      render: (r: Cobranca) => {
        const s = STATUS_LABEL[r.status] ?? { label: r.status, variant: 'default' }
        return <Badge label={s.label} variant={s.variant as 'success' | 'warning' | 'danger' | 'default'} />
      }
    },
    { key: 'vencimento', header: 'Vencimento', render: (r: Cobranca) => r.vencimento ? fmt(r.vencimento).slice(0, 10) : '—' },
    { key: 'pagoEm', header: 'Pago em', render: (r: Cobranca) => fmt(r.pagoEm) },
    { key: 'createdAt', header: 'Criada em', render: (r: Cobranca) => fmt(r.createdAt) },
    {
      key: '_actions', header: '',
      render: (r: Cobranca) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={styles.btnSecondary} style={{ padding: '4px 10px', fontSize: '0.75rem' }}
            onClick={e => { e.stopPropagation(); handleAtualizar(r) }}>
            ↻ Atualizar
          </button>
          {r.status === 'ATIVA' && (
            <button className={styles.btnDanger} style={{ padding: '4px 10px', fontSize: '0.75rem' }}
              onClick={e => { e.stopPropagation(); handleCancelar(r) }}>
              Cancelar
            </button>
          )}
        </div>
      )
    },
  ]

  const columnsPedido = [
    { key: 'tipo', header: 'Tipo', render: (r: Cobranca) => <Badge label={r.tipo.toUpperCase()} variant="info" /> },
    { key: 'valor', header: 'Valor', render: (r: Cobranca) => <strong>{moeda(r.valor)}</strong> },
    {
      key: 'status', header: 'Status',
      render: (r: Cobranca) => {
        const s = STATUS_LABEL[r.status] ?? { label: r.status, variant: 'default' }
        return <Badge label={s.label} variant={s.variant as 'success' | 'warning' | 'danger' | 'default'} />
      }
    },
    { key: 'vencimento', header: 'Vencimento', render: (r: Cobranca) => r.vencimento ? fmt(r.vencimento).slice(0, 10) : '—' },
    { key: 'pagoEm', header: 'Pago em', render: (r: Cobranca) => fmt(r.pagoEm) },
    { key: 'createdAt', header: 'Criada em', render: (r: Cobranca) => fmt(r.createdAt) },
    {
      key: '_actions', header: '',
      render: (r: Cobranca) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={styles.btnSecondary} style={{ padding: '4px 10px', fontSize: '0.75rem' }}
            onClick={e => { e.stopPropagation(); handleAtualizar(r) }}>
            ↻ Atualizar
          </button>
          {r.status === 'ATIVA' && (
            <button className={styles.btnDanger} style={{ padding: '4px 10px', fontSize: '0.75rem' }}
              onClick={e => { e.stopPropagation(); handleCancelar(r) }}>
              Cancelar
            </button>
          )}
        </div>
      )
    },
  ]

  const allPages = Math.max(1, Math.ceil(allTotal / 20))

  return (
    <div className={styles.page}>
      <PageHeader
        title="Cobranças"
        subtitle="PIX e boleto via Efi Bank"
        action={
          <button className={styles.btnPrimary} onClick={() => setShowModal(true)}>
            + Nova Cobrança
          </button>
        }
      />

      {/* Tab bar */}
      <div className={cStyles.tabBar}>
        <button
          className={`${cStyles.tab} ${activeTab === 'geral' ? cStyles.tabActive : ''}`}
          onClick={() => setActiveTab('geral')}
        >
          Todas as Cobranças
        </button>
        <button
          className={`${cStyles.tab} ${activeTab === 'pedido' ? cStyles.tabActive : ''}`}
          onClick={() => setActiveTab('pedido')}
        >
          Por Pedido
        </button>
      </div>

      {/* ── Visão Geral ───────────────────────────────────────────────────── */}
      {activeTab === 'geral' && (
        <div className={styles.panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
            <h3 className={styles.panelTitle} style={{ margin: 0 }}>
              Todas as Cobranças {allTotal > 0 && <span style={{ color: '#64748b', fontWeight: 400, fontSize: '0.85rem' }}>({allTotal} no total)</span>}
            </h3>
            <button className={styles.btnSecondary} style={{ fontSize: '0.8rem', padding: '5px 14px' }} onClick={carregarTodas}>
              ↻ Atualizar
            </button>
          </div>

          {/* Filter chips — Status */}
          <div className={cStyles.filterBar}>
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</span>
            {STATUS_FILTERS.map(f => (
              <button
                key={f.value}
                className={`${cStyles.chip} ${filterStatus === f.value ? cStyles.chipActive : ''}`}
                onClick={() => setFilterStatus(f.value)}
              >
                {f.label}
              </button>
            ))}
            <span className={cStyles.chipSep} />
            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tipo</span>
            {TIPO_FILTERS.map(f => (
              <button
                key={f.value}
                className={`${cStyles.chip} ${filterTipo === f.value ? cStyles.chipActive : ''}`}
                onClick={() => setFilterTipo(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <Table
            columns={columnsGeral}
            rows={allList}
            loading={allLoading}
            onRowClick={r => setCobrancaDetalhe(r as unknown as Cobranca)}
            empty="Nenhuma cobrança encontrada"
          />

          {allPages > 1 && (
            <div className={cStyles.pagination}>
              <button disabled={allPage <= 1} onClick={() => setAllPage(p => p - 1)}>← Anterior</button>
              <span>Página {allPage} de {allPages}</span>
              <button disabled={allPage >= allPages} onClick={() => setAllPage(p => p + 1)}>Próxima →</button>
            </div>
          )}
        </div>
      )}

      {/* ── Por Pedido ────────────────────────────────────────────────────── */}
      {activeTab === 'pedido' && (
        <>
          {/* Busca de pedido */}
          <div className={cStyles.searchBox}>
            <div className={cStyles.pedidoBusca}>
              <input
                className={styles.search}
                placeholder="Buscar pedido por número..."
                value={buscaPedido}
                onChange={e => setBuscaPedido(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && buscarPedidos()}
              />
              <button className={styles.btnSecondary} onClick={buscarPedidos} disabled={searching}>
                {searching ? '...' : 'Buscar'}
              </button>
            </div>
            {pedidosBusca.length > 0 && (
              <div className={cStyles.pedidosSugestoes}>
                {pedidosBusca.map(p => (
                  <div
                    key={p._id}
                    className={`${cStyles.pedidoItem} ${pedidoId === p._id ? cStyles.selected : ''}`}
                    onClick={() => { setPedidoId(p._id); setPedidoSelecionado(p); setPedidosBusca([]) }}
                  >
                    <strong>{p.numero}</strong>
                    <span style={{ color: '#64748b', fontSize: '0.8rem', marginLeft: 8 }}>
                      {moeda(p.valorTotal)} — {p.etapaOperacional}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {pedidoSelecionado && (
              <div className={cStyles.pedidoSelecionado}>
                Pedido selecionado: <strong>{pedidoSelecionado.numero}</strong> — {moeda(pedidoSelecionado.valorTotal)}
                <button className={cStyles.limpar} onClick={() => { setPedidoId(''); setPedidoSelecionado(null); setCobrancasList([]) }}>✕</button>
              </div>
            )}
          </div>

          {pedidoId && (
            <div className={styles.panel}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h3 className={styles.panelTitle} style={{ margin: 0 }}>
                  Cobranças do Pedido ({cobrancasList.length})
                </h3>
              </div>
              <Table
                columns={columnsPedido}
                rows={cobrancasList}
                loading={loading}
                onRowClick={r => setCobrancaDetalhe(r as unknown as Cobranca)}
                empty="Nenhuma cobrança para este pedido"
              />
            </div>
          )}

          {!pedidoId && (
            <div className={styles.panel} style={{ textAlign: 'center', padding: '40px 24px', color: '#94a3b8' }}>
              <div style={{ fontSize: '2rem', marginBottom: 10 }}>🔍</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Selecione um pedido</div>
              <div style={{ fontSize: '0.85rem' }}>Busque um pedido pelo número para ver suas cobranças</div>
            </div>
          )}
        </>
      )}

      {/* Modal criar cobrança */}
      {showModal && (
        <Modal title="Nova Cobrança" onClose={() => setShowModal(false)} size="md">
          <form onSubmit={handleCriar} className={styles.form}>
            <label>Pedido *
              {pedidoSelecionado ? (
                <div className={cStyles.pedidoTag}>
                  {pedidoSelecionado.numero} — {moeda(pedidoSelecionado.valorTotal)}
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                    <input
                      placeholder="Buscar pedido..."
                      value={buscaPedido}
                      onChange={e => setBuscaPedido(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), buscarPedidos())}
                    />
                    <button type="button" className={styles.btnSecondary} onClick={buscarPedidos}>Buscar</button>
                  </div>
                  {pedidosBusca.map(p => (
                    <div key={p._id} className={cStyles.pedidoItem}
                      onClick={() => { setPedidoId(p._id); setPedidoSelecionado(p); setPedidosBusca([]) }}>
                      <strong>{p.numero}</strong> — {moeda(p.valorTotal)}
                    </div>
                  ))}
                </div>
              )}
            </label>

            <label>Tipo de Cobrança *
              <select value={tipo} onChange={e => setTipo(e.target.value as TipoCobranca)}>
                <option value="pix">PIX Imediato</option>
                <option value="pix_vencimento">PIX com Vencimento</option>
                <option value="boleto">Boleto Bancário</option>
              </select>
            </label>

            <label>Valor (deixe vazio para usar valor do pedido)
              <input type="number" min="0.01" step="0.01" value={valor}
                onChange={e => setValor(e.target.value)} placeholder="Ex: 1500.00" />
            </label>

            {(tipo === 'pix_vencimento' || tipo === 'boleto') && (
              <label>Data de Vencimento *
                <input type="date" required value={vencimento} onChange={e => setVencimento(e.target.value)} />
              </label>
            )}

            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowModal(false)}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={saving || !pedidoId}>
                {saving ? 'Gerando...' : 'Gerar Cobrança'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal detalhe da cobrança */}
      {cobrancaDetalhe && (
        <Modal title="Detalhe da Cobrança" onClose={() => setCobrancaDetalhe(null)} size="md">
          <div className={cStyles.detalhe}>
            <div className={cStyles.detalheRow}>
              <span>Tipo</span><Badge label={cobrancaDetalhe.tipo.toUpperCase()} variant="info" />
            </div>
            <div className={cStyles.detalheRow}>
              <span>Valor</span><strong>{moeda(cobrancaDetalhe.valor)}</strong>
            </div>
            <div className={cStyles.detalheRow}>
              <span>Status</span>
              <Badge
                label={STATUS_LABEL[cobrancaDetalhe.status]?.label ?? cobrancaDetalhe.status}
                variant={(STATUS_LABEL[cobrancaDetalhe.status]?.variant ?? 'default') as 'success' | 'warning' | 'danger' | 'default'}
              />
            </div>
            {cobrancaDetalhe.txid && <div className={cStyles.detalheRow}><span>TxID</span><code>{cobrancaDetalhe.txid}</code></div>}
            {cobrancaDetalhe.vencimento && <div className={cStyles.detalheRow}><span>Vencimento</span><span>{fmt(cobrancaDetalhe.vencimento)}</span></div>}
            {cobrancaDetalhe.pagoEm && <div className={cStyles.detalheRow}><span>Pago em</span><span style={{ color: '#15803d', fontWeight: 700 }}>{fmt(cobrancaDetalhe.pagoEm)}</span></div>}

            {/* PIX QR Code */}
            {(cobrancaDetalhe.tipo === 'pix' || cobrancaDetalhe.tipo === 'pix_vencimento') && cobrancaDetalhe.pixCopiaECola && (
              <div className={cStyles.qrSection}>
                {cobrancaDetalhe.qrCodeBase64 && (
                  <img
                    src={cobrancaDetalhe.qrCodeBase64.startsWith('data:')
                      ? cobrancaDetalhe.qrCodeBase64
                      : `data:image/png;base64,${cobrancaDetalhe.qrCodeBase64}`}
                    alt="QR Code PIX"
                    className={cStyles.qrImage}
                  />
                )}
                <div className={cStyles.pixCopiaECola}>
                  <label>PIX Copia e Cola</label>
                  <div className={cStyles.pixCode}>{cobrancaDetalhe.pixCopiaECola}</div>
                  <button className={styles.btnSecondary}
                    onClick={() => navigator.clipboard.writeText(cobrancaDetalhe.pixCopiaECola ?? '')}>
                    Copiar código
                  </button>
                </div>
              </div>
            )}

            {/* Boleto */}
            {cobrancaDetalhe.tipo === 'boleto' && (
              <div className={cStyles.boletoSection}>
                {cobrancaDetalhe.boletoBarcode && (
                  <div className={cStyles.detalheRow}>
                    <span>Código de barras</span>
                    <div className={cStyles.pixCode} style={{ fontSize: '0.72rem' }}>{cobrancaDetalhe.boletoBarcode}</div>
                  </div>
                )}
                {cobrancaDetalhe.boletoUrl && (
                  <a href={cobrancaDetalhe.boletoUrl} target="_blank" rel="noreferrer" className={styles.btnPrimary}
                    style={{ textDecoration: 'none', textAlign: 'center', display: 'block', marginTop: 10 }}>
                    Abrir boleto PDF ↗
                  </a>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
