import { useEffect, useState, useCallback } from 'react'
import PageHeader from '../components/PageHeader'
import Table from '../components/Table'
import Badge from '../components/Badge'
import Pagination from '../components/Pagination'
import Modal from '../components/Modal'
import styles from './Page.module.css'

// ─── interfaces locais ───────────────────────────────────────────────────────

interface EstoqueItem {
  _id: string
  codigo: string
  nome: string
  tipo: 'Token USB' | 'Cartão Inteligente' | 'Leitor de Cartão' | 'Mídia A3 Nuvem' | 'Envelope Seguro' | 'Outro'
  fabricante?: string
  modelo?: string
  fornecedor?: string
  quantidadeAtual: number
  quantidadeReservada: number
  quantidadeMinima: number
  quantidadeMaxima?: number
  custoUnitario: number
  moeda: 'BRL' | 'USD' | 'EUR'
  precoVenda?: number
  localizacao?: string
  rastreiaNumeroSerie: boolean
  status: 'Ativo' | 'Descontinuado' | 'Suspenso'
  observacoes?: string
}

interface MovimentoEstoque {
  _id: string
  itemId: string | EstoqueItem
  tipo: string
  quantidade: number
  numerosSerie?: string[]
  pedidoNumero?: string
  clienteNome?: string
  custoUnitario?: number
  saldoAnterior: number
  saldoPosterior: number
  responsavelNome?: string
  observacoes?: string
  dataMovimento: string
}

interface KPIs {
  totalItens: number
  abaixoMinimo: number
  semEstoque: number
  totalReservado: number
  valorTotalEstoque: number
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const TIPOS: EstoqueItem['tipo'][] = [
  'Token USB', 'Cartão Inteligente', 'Leitor de Cartão', 'Mídia A3 Nuvem', 'Envelope Seguro', 'Outro',
]

const TIPO_BADGE_VARIANT: Record<string, 'info' | 'success' | 'warning' | 'danger' | 'default' | 'purple'> = {
  'Token USB': 'info',
  'Cartão Inteligente': 'purple',
  'Leitor de Cartão': 'warning',
  'Mídia A3 Nuvem': 'success',
  'Envelope Seguro': 'default',
  'Outro': 'default',
}

const TIPO_LABEL: Record<string, string> = {
  entrada_compra: 'Compra',
  entrada_devolucao: 'Devolução',
  entrada_ajuste: 'Ajuste +',
  saida_pedido: 'Saída pedido',
  saida_avaria: 'Avaria',
  saida_ajuste: 'Ajuste -',
  reserva: 'Reserva',
  cancelamento_reserva: 'Cancel. reserva',
  entrega_reserva: 'Entrega reserva',
}

function movBadgeVariant(tipo: string): 'success' | 'danger' | 'warning' {
  if (tipo.startsWith('entrada') || tipo === 'cancelamento_reserva') return 'success'
  if (tipo.startsWith('saida') || tipo === 'entrega_reserva') return 'danger'
  return 'warning'
}

function estoqueColor(item: EstoqueItem): string {
  const disp = item.quantidadeAtual - item.quantidadeReservada
  if (disp <= 0) return '#ef4444'
  if (disp <= item.quantidadeMinima) return '#f59e0b'
  return '#22c55e'
}

function moeda(v: number, currency = 'BRL') {
  return v.toLocaleString('pt-BR', { style: 'currency', currency })
}

function fmtDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function authHeader(): Record<string, string> {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...authHeader(), ...(opts?.headers ?? {}) },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? `Erro ${res.status}`)
  }
  return res.json()
}

// ─── blank forms ──────────────────────────────────────────────────────────────

function blankItem(): Partial<EstoqueItem> {
  return {
    codigo: '', nome: '', tipo: 'Token USB', fabricante: '', modelo: '', fornecedor: '',
    quantidadeMinima: 1, quantidadeMaxima: undefined, custoUnitario: 0, moeda: 'BRL',
    precoVenda: undefined, localizacao: '', rastreiaNumeroSerie: false, status: 'Ativo', observacoes: '',
  }
}

interface MovForm {
  tipo: string
  quantidade: number
  numerosSerie: string
  lote: string
  pedidoNumero: string
  clienteNome: string
  custoUnitario: string
  precoVenda: string
  nfFornecedor: string
  observacoes: string
  _isVendaAvulsa?: boolean
}

function blankMov(): MovForm {
  return {
    tipo: '', quantidade: 1, numerosSerie: '', lote: '', pedidoNumero: '',
    clienteNome: '', custoUnitario: '', precoVenda: '', nfFornecedor: '', observacoes: '',
  }
}

const LIMIT = 20

// ─── componente principal ─────────────────────────────────────────────────────

export default function Estoque() {
  const [aba, setAba] = useState<'estoque' | 'movimentos'>('estoque')

  // ── aba Estoque ──
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [rows, setRows] = useState<EstoqueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState<KPIs>({ totalItens: 0, abaixoMinimo: 0, semEstoque: 0, totalReservado: 0, valorTotalEstoque: 0 })
  const [filtroTipo, setFiltroTipo] = useState<string[]>([])
  const [filtroFabricante, setFiltroFabricante] = useState<string[]>([])
  const [filtroAbaixoMin, setFiltroAbaixoMin] = useState(false)
  const [fabricantes, setFabricantes] = useState<string[]>([])

  // ── modal Novo Item ──
  const [showItemModal, setShowItemModal] = useState(false)
  const [editingItem, setEditingItem] = useState<EstoqueItem | null>(null)
  const [itemForm, setItemForm] = useState<Partial<EstoqueItem>>(blankItem())
  const [itemSaving, setItemSaving] = useState(false)
  const [itemError, setItemError] = useState('')

  // ── modal Movimento ──
  const [showMovModal, setShowMovModal] = useState(false)
  const [movItem, setMovItem] = useState<EstoqueItem | null>(null)
  const [movForm, setMovForm] = useState<MovForm>(blankMov())
  const [movSaving, setMovSaving] = useState(false)
  const [movError, setMovError] = useState('')

  // ── modal Histórico do item ──
  const [showHistModal, setShowHistModal] = useState(false)
  const [histItem, setHistItem] = useState<EstoqueItem | null>(null)
  const [histRows, setHistRows] = useState<MovimentoEstoque[]>([])
  const [histLoading, setHistLoading] = useState(false)

  // ── aba Movimentos ──
  const [movPage, setMovPage] = useState(1)
  const [movTotal, setMovTotal] = useState(0)
  const [movRows, setMovRows] = useState<MovimentoEstoque[]>([])
  const [movLoading, setMovLoading] = useState(false)
  const [movFiltroTipo, setMovFiltroTipo] = useState<string[]>([])
  const [movBusca, setMovBusca] = useState('')

  // ─── load estoque ────────────────────────────────────────────────────────────

  const loadEstoque = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
      if (filtroTipo.length > 0) params.set('tipo', filtroTipo.join(','))
      if (filtroAbaixoMin) params.set('abaixoMinimo', 'true')
      const data = await apiFetch<{ data: EstoqueItem[]; total: number; kpis?: KPIs }>(`/api/estoque/items?${params}`)
      setRows(data.data)
      setTotal(data.total)
      if (data.kpis) setKpis(data.kpis)
      // coleta fabricantes únicos para filtro
      setFabricantes(prev => {
        const set = new Set([...prev, ...data.data.map(r => r.fabricante).filter(Boolean) as string[]])
        return Array.from(set).sort()
      })
    } finally {
      setLoading(false)
    }
  }, [page, filtroTipo, filtroAbaixoMin])

  useEffect(() => { if (aba === 'estoque') loadEstoque() }, [aba, loadEstoque])

  // ─── load movimentos ─────────────────────────────────────────────────────────

  const loadMovimentos = useCallback(async () => {
    setMovLoading(true)
    try {
      const params = new URLSearchParams({ page: String(movPage), limit: String(LIMIT) })
      if (movFiltroTipo.length > 0) params.set('tipo', movFiltroTipo.join(','))
      if (movBusca) params.set('pedido', movBusca)
      const data = await apiFetch<{ data: MovimentoEstoque[]; total: number }>(`/api/estoque/movimentos?${params}`)
      setMovRows(data.data)
      setMovTotal(data.total)
    } finally {
      setMovLoading(false)
    }
  }, [movPage, movFiltroTipo, movBusca])

  useEffect(() => { if (aba === 'movimentos') loadMovimentos() }, [aba, loadMovimentos])

  // ─── filtro fabricante (client-side sobre rows já carregados) ────────────────
  const rowsFiltrados = filtroFabricante.length > 0
    ? rows.filter(r => r.fabricante && filtroFabricante.includes(r.fabricante))
    : rows

  // ─── toggle chip ─────────────────────────────────────────────────────────────
  function toggleArr(arr: string[], val: string): string[] {
    if (!val) return []
    return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
  }

  // ─── salvar item ─────────────────────────────────────────────────────────────
  async function handleSaveItem(e: React.FormEvent) {
    e.preventDefault()
    if (!itemForm.codigo?.trim()) { setItemError('Código é obrigatório'); return }
    if (!itemForm.nome?.trim()) { setItemError('Nome é obrigatório'); return }
    if (!itemForm.tipo) { setItemError('Tipo é obrigatório'); return }
    if ((itemForm.custoUnitario ?? 0) < 0) { setItemError('Custo unitário inválido'); return }
    setItemSaving(true); setItemError('')
    try {
      if (editingItem) {
        await apiFetch(`/api/estoque/items/${editingItem._id}`, { method: 'PUT', body: JSON.stringify(itemForm) })
      } else {
        await apiFetch('/api/estoque/items', { method: 'POST', body: JSON.stringify(itemForm) })
      }
      setShowItemModal(false)
      loadEstoque()
    } catch (err) {
      setItemError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setItemSaving(false)
    }
  }

  // ─── salvar movimento ─────────────────────────────────────────────────────────
  async function handleSaveMov(e: React.FormEvent) {
    e.preventDefault()
    if (!movForm.tipo) { setMovError('Tipo de movimento é obrigatório'); return }
    if (movForm.quantidade < 1) { setMovError('Quantidade deve ser maior que zero'); return }
    setMovSaving(true); setMovError('')
    try {
      const obsVenda = movForm._isVendaAvulsa && movForm.precoVenda
        ? `Venda avulsa${movForm.clienteNome ? ` para ${movForm.clienteNome}` : ''} — preço unitário: R$ ${Number(movForm.precoVenda).toFixed(2)}`
        : undefined
      const payload: Record<string, unknown> = {
        itemId: movItem?._id,
        tipo: movForm.tipo,
        quantidade: movForm.quantidade,
        observacoes: movForm.observacoes || obsVenda || undefined,
        pedidoNumero: movForm.pedidoNumero || undefined,
        clienteNome: movForm.clienteNome || undefined,
        lote: movForm.lote || undefined,
      }
      if (movItem?.rastreiaNumeroSerie && movForm.numerosSerie.trim()) {
        payload.numerosSerie = movForm.numerosSerie.split('\n').map(s => s.trim()).filter(Boolean)
      }
      if (movForm.tipo.startsWith('entrada') && movForm.custoUnitario) {
        payload.custoUnitario = parseFloat(movForm.custoUnitario)
      }
      if (movForm.tipo === 'entrada_compra' && movForm.nfFornecedor) {
        payload.nfFornecedor = movForm.nfFornecedor
      }
      await apiFetch('/api/estoque/movimentos', { method: 'POST', body: JSON.stringify(payload) })
      setShowMovModal(false)
      loadEstoque()
      if (aba === 'movimentos') loadMovimentos()
    } catch (err) {
      setMovError(err instanceof Error ? err.message : 'Erro ao registrar movimento')
    } finally {
      setMovSaving(false)
    }
  }

  // ─── abrir histórico ─────────────────────────────────────────────────────────
  async function openHist(item: EstoqueItem) {
    setHistItem(item)
    setHistRows([])
    setShowHistModal(true)
    setHistLoading(true)
    try {
      const data = await apiFetch<{ data: MovimentoEstoque[] }>(`/api/estoque/movimentos/item/${item._id}?limit=50`)
      setHistRows(data.data)
    } finally {
      setHistLoading(false)
    }
  }

  // ─── abrir modal movimento ────────────────────────────────────────────────────
  function openMov(item: EstoqueItem, tipoInicial = '', vendaAvulsa = false) {
    setMovItem(item)
    setMovForm({
      ...blankMov(),
      tipo: tipoInicial,
      precoVenda: vendaAvulsa && item.precoVenda ? String(item.precoVenda) : '',
      _isVendaAvulsa: vendaAvulsa,
    })
    setMovError('')
    setShowMovModal(true)
  }

  function openEdit(item: EstoqueItem) {
    setEditingItem(item)
    setItemForm({ ...item })
    setItemError('')
    setShowItemModal(true)
  }

  function openCreate() {
    setEditingItem(null)
    setItemForm(blankItem())
    setItemError('')
    setShowItemModal(true)
  }

  // ─── tab style ────────────────────────────────────────────────────────────────
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 20px', borderRadius: 20, border: 'none', cursor: 'pointer',
    fontWeight: 600, fontSize: '0.85rem', transition: 'all .15s',
    background: active ? 'var(--primary, #2563eb)' : 'transparent',
    color: active ? '#fff' : 'var(--text-secondary, #64748b)',
  })

  // ─── colunas estoque ──────────────────────────────────────────────────────────
  const estoqueColumns = [
    {
      key: 'codigo', header: 'Código',
      render: (r: EstoqueItem) => (
        <code style={{ fontFamily: 'monospace', fontSize: '0.75rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
          {r.codigo}
        </code>
      ),
    },
    {
      key: 'nome', header: 'Item',
      render: (r: EstoqueItem) => (
        <div>
          <strong style={{ fontSize: '0.875rem' }}>{r.nome}</strong>
          {(r.fabricante || r.modelo) && (
            <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: 2 }}>
              {[r.fabricante, r.modelo].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'tipo', header: 'Tipo',
      render: (r: EstoqueItem) => <Badge label={r.tipo} variant={TIPO_BADGE_VARIANT[r.tipo] ?? 'default'} />,
    },
    {
      key: 'disponivel', header: 'Disponível',
      render: (r: EstoqueItem) => {
        const disp = r.quantidadeAtual - r.quantidadeReservada
        const cor = estoqueColor(r)
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: cor, flexShrink: 0 }} />
            <strong style={{ color: cor }}>{disp}</strong>
          </span>
        )
      },
    },
    {
      key: 'quantidadeReservada', header: 'Reservado',
      render: (r: EstoqueItem) => (
        <span style={{ color: r.quantidadeReservada > 0 ? '#f59e0b' : '#94a3b8', fontWeight: r.quantidadeReservada > 0 ? 600 : 400 }}>
          {r.quantidadeReservada}
        </span>
      ),
    },
    {
      key: 'quantidadeMinima', header: 'Mínimo',
      render: (r: EstoqueItem) => <span style={{ color: '#94a3b8' }}>{r.quantidadeMinima}</span>,
    },
    {
      key: 'custoUnitario', header: 'Custo unit.',
      render: (r: EstoqueItem) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{moeda(r.custoUnitario, r.moeda)}</span>,
    },
    {
      key: 'localizacao', header: 'Localização',
      render: (r: EstoqueItem) => r.localizacao
        ? <span style={{ fontSize: '0.8rem', color: '#475569' }}>{r.localizacao}</span>
        : <span style={{ color: '#94a3b8' }}>—</span>,
    },
    {
      key: 'status', header: 'Status',
      render: (r: EstoqueItem) => {
        const v = r.status === 'Ativo' ? 'success' : r.status === 'Suspenso' ? 'warning' : 'default'
        return <Badge label={r.status} variant={v} />
      },
    },
    {
      key: '_actions', header: '', width: '260px',
      render: (r: EstoqueItem) => (
        <div className={styles.rowActions}>
          <button className={styles.btnLink} style={{ color: '#16a34a' }} title="Registrar entrada" onClick={e => { e.stopPropagation(); openMov(r, 'entrada_compra') }}>Entrada</button>
          <button className={styles.btnLink} style={{ color: '#7c3aed', fontWeight: 700 }} title="Venda avulsa — debita estoque" onClick={e => { e.stopPropagation(); openMov(r, 'saida_pedido', true) }}>Vender</button>
          <button className={styles.btnLink} style={{ color: '#dc2626' }} title="Saída / ajuste" onClick={e => { e.stopPropagation(); openMov(r, 'saida_ajuste') }}>Saída</button>
          <button className={styles.btnLink} onClick={e => { e.stopPropagation(); openHist(r) }}>Histórico</button>
        </div>
      ),
    },
  ]

  // ─── colunas movimentos ───────────────────────────────────────────────────────
  const movColumns = [
    {
      key: 'dataMovimento', header: 'Data',
      render: (r: MovimentoEstoque) => <span style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{fmtDate(r.dataMovimento)}</span>,
    },
    {
      key: 'itemId', header: 'Item',
      render: (r: MovimentoEstoque) => (
        <span style={{ fontSize: '0.83rem' }}>
          {typeof r.itemId === 'object' ? r.itemId.nome : r.itemId}
        </span>
      ),
    },
    {
      key: 'tipo', header: 'Tipo',
      render: (r: MovimentoEstoque) => (
        <Badge label={TIPO_LABEL[r.tipo] ?? r.tipo} variant={movBadgeVariant(r.tipo)} />
      ),
    },
    {
      key: 'quantidade', header: 'Qtd',
      render: (r: MovimentoEstoque) => {
        const isEntrada = r.tipo.startsWith('entrada') || r.tipo === 'cancelamento_reserva'
        return (
          <strong style={{ color: isEntrada ? '#16a34a' : '#dc2626' }}>
            {isEntrada ? '+' : '-'}{r.quantidade}
          </strong>
        )
      },
    },
    {
      key: 'pedidoNumero', header: 'Pedido',
      render: (r: MovimentoEstoque) => r.pedidoNumero
        ? <code style={{ fontFamily: 'monospace', fontSize: '0.75rem', background: '#f1f5f9', padding: '2px 5px', borderRadius: 3 }}>{r.pedidoNumero}</code>
        : <span style={{ color: '#94a3b8' }}>—</span>,
    },
    {
      key: 'clienteNome', header: 'Cliente',
      render: (r: MovimentoEstoque) => r.clienteNome
        ? <span style={{ fontSize: '0.82rem' }}>{r.clienteNome}</span>
        : <span style={{ color: '#94a3b8' }}>—</span>,
    },
    {
      key: 'saldoPosterior', header: 'Saldo após',
      render: (r: MovimentoEstoque) => (
        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.83rem' }}>
          <span style={{ color: '#94a3b8' }}>{r.saldoAnterior}</span>
          {' → '}
          <strong>{r.saldoPosterior}</strong>
        </span>
      ),
    },
    {
      key: 'responsavelNome', header: 'Responsável',
      render: (r: MovimentoEstoque) => r.responsavelNome
        ? <span style={{ fontSize: '0.8rem' }}>{r.responsavelNome}</span>
        : <span style={{ color: '#94a3b8' }}>—</span>,
    },
  ]

  // ─── render ──────────────────────────────────────────────────────────────────

  const isEntradaMov = movForm.tipo.startsWith('entrada')
  const isCompra = movForm.tipo === 'entrada_compra'
  const dispAtual = movItem ? movItem.quantidadeAtual - movItem.quantidadeReservada : 0

  return (
    <div className={styles.page}>
      <PageHeader
        title="Estoque de Hardware"
        subtitle={`${total} item(ns) cadastrado(s)`}
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2, #f1f5f9)', borderRadius: 24, padding: 4 }}>
              <button style={tabStyle(aba === 'estoque')} onClick={() => setAba('estoque')}>Estoque</button>
              <button style={tabStyle(aba === 'movimentos')} onClick={() => setAba('movimentos')}>Movimentos</button>
            </div>
            {aba === 'estoque' && (
              <button className={styles.btnPrimary} onClick={openCreate}>+ Novo Item</button>
            )}
          </div>
        }
      />

      {/* ── KPI cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard label="Total de itens" value={String(kpis.totalItens)} />
        <KpiCard
          label="Abaixo do mínimo"
          value={String(kpis.abaixoMinimo)}
          danger={kpis.abaixoMinimo > 0}
        />
        <KpiCard
          label="Sem estoque"
          value={String(kpis.semEstoque)}
          danger={kpis.semEstoque > 0}
        />
        <KpiCard label="Reservado" value={String(kpis.totalReservado)} />
        <KpiCard
          label="Valor total estoque"
          value={moeda(kpis.valorTotalEstoque)}
          wide
        />
      </div>

      {/* ══ ABA ESTOQUE ══ */}
      {aba === 'estoque' && (
        <>
          <div className={styles.filters}>
            <div className={styles.chipRow}>
              <span className={styles.chipLabel}>Tipo:</span>
              {[{ v: '', l: 'Todos' }, ...TIPOS.map(t => ({ v: t, l: t }))].map(({ v, l }) => (
                <button
                  key={v}
                  className={`${styles.chip} ${v === '' ? filtroTipo.length === 0 ? styles.chipActive : '' : filtroTipo.includes(v) ? styles.chipActive : ''}`}
                  onClick={() => { setFiltroTipo(toggleArr(filtroTipo, v)); setPage(1) }}
                >
                  {l}
                </button>
              ))}
            </div>
            {fabricantes.length > 0 && (
              <div className={styles.chipRow}>
                <span className={styles.chipLabel}>Fabricante:</span>
                {fabricantes.map(f => (
                  <button
                    key={f}
                    className={`${styles.chip} ${filtroFabricante.includes(f) ? styles.chipActive : ''}`}
                    onClick={() => setFiltroFabricante(toggleArr(filtroFabricante, f))}
                  >
                    {f}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.83rem', fontWeight: 600, color: filtroAbaixoMin ? '#dc2626' : 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={filtroAbaixoMin}
                  onChange={e => { setFiltroAbaixoMin(e.target.checked); setPage(1) }}
                  style={{ accentColor: '#dc2626', width: 15, height: 15 }}
                />
                Apenas abaixo do mínimo
              </label>
            </div>
          </div>

          <Table<EstoqueItem>
            columns={estoqueColumns}
            rows={rowsFiltrados}
            loading={loading}
            empty="Nenhum item no estoque"
            onRowClick={item => openEdit(item)}
          />
          <Pagination page={page} total={total} limit={LIMIT} onChange={setPage} />
        </>
      )}

      {/* ══ ABA MOVIMENTOS ══ */}
      {aba === 'movimentos' && (
        <>
          <div className={styles.filters}>
            <input
              className={styles.search}
              placeholder="Buscar por número de pedido..."
              value={movBusca}
              onChange={e => { setMovBusca(e.target.value); setMovPage(1) }}
            />
            <div className={styles.chipRow}>
              <span className={styles.chipLabel}>Tipo:</span>
              {[{ v: '', l: 'Todos' }, ...Object.entries(TIPO_LABEL).map(([v, l]) => ({ v, l }))].map(({ v, l }) => (
                <button
                  key={v}
                  className={`${styles.chip} ${v === '' ? movFiltroTipo.length === 0 ? styles.chipActive : '' : movFiltroTipo.includes(v) ? styles.chipActive : ''}`}
                  onClick={() => { setMovFiltroTipo(toggleArr(movFiltroTipo, v)); setMovPage(1) }}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <Table<MovimentoEstoque>
            columns={movColumns}
            rows={movRows}
            loading={movLoading}
            empty="Nenhum movimento encontrado"
          />
          <Pagination page={movPage} total={movTotal} limit={LIMIT} onChange={setMovPage} />
        </>
      )}

      {/* ══ MODAL — NOVO / EDITAR ITEM ══ */}
      {showItemModal && (
        <Modal title={editingItem ? `Editar: ${editingItem.nome}` : 'Novo Item de Estoque'} onClose={() => setShowItemModal(false)} size="lg">
          <form onSubmit={handleSaveItem} noValidate className={styles.form}>
            <div className={styles.formGrid2}>
              <label>Código *
                <input
                  value={itemForm.codigo ?? ''}
                  onChange={e => setItemForm(f => ({ ...f, codigo: e.target.value }))}
                  placeholder="Ex: TOKEN-SAFENET-5110"
                />
              </label>
              <label>Tipo *
                <select value={itemForm.tipo ?? ''} onChange={e => setItemForm(f => ({ ...f, tipo: e.target.value as EstoqueItem['tipo'] }))}>
                  {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label style={{ gridColumn: 'span 2' }}>Nome *
                <input
                  value={itemForm.nome ?? ''}
                  onChange={e => setItemForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex: Token USB SafeNet 5110"
                />
              </label>
              <label>Fabricante
                <input
                  value={itemForm.fabricante ?? ''}
                  onChange={e => setItemForm(f => ({ ...f, fabricante: e.target.value }))}
                  placeholder="Ex: SafeNet, Certisign..."
                />
              </label>
              <label>Modelo
                <input
                  value={itemForm.modelo ?? ''}
                  onChange={e => setItemForm(f => ({ ...f, modelo: e.target.value }))}
                  placeholder="Ex: 5110"
                />
              </label>
              <label style={{ gridColumn: 'span 2' }}>Fornecedor
                <input
                  value={itemForm.fornecedor ?? ''}
                  onChange={e => setItemForm(f => ({ ...f, fornecedor: e.target.value }))}
                  placeholder="Ex: Distribuidor XYZ Ltda"
                />
              </label>
              <label>Qtd. Mínima
                <input type="number" min="0" value={itemForm.quantidadeMinima ?? 0} onChange={e => setItemForm(f => ({ ...f, quantidadeMinima: Number(e.target.value) }))} />
              </label>
              <label>Qtd. Máxima
                <input type="number" min="0" value={itemForm.quantidadeMaxima ?? ''} onChange={e => setItemForm(f => ({ ...f, quantidadeMaxima: e.target.value ? Number(e.target.value) : undefined }))} placeholder="Sem limite" />
              </label>
              <label>Custo Unitário *
                <input type="number" min="0" step="0.01" value={itemForm.custoUnitario ?? 0} onChange={e => setItemForm(f => ({ ...f, custoUnitario: Number(e.target.value) }))} />
              </label>
              <label>Moeda
                <select value={itemForm.moeda ?? 'BRL'} onChange={e => setItemForm(f => ({ ...f, moeda: e.target.value as EstoqueItem['moeda'] }))}>
                  <option value="BRL">BRL — Real</option>
                  <option value="USD">USD — Dólar</option>
                  <option value="EUR">EUR — Euro</option>
                </select>
              </label>
              <label>Preço de Venda
                <input type="number" min="0" step="0.01" value={itemForm.precoVenda ?? ''} onChange={e => setItemForm(f => ({ ...f, precoVenda: e.target.value ? Number(e.target.value) : undefined }))} placeholder="Opcional" />
              </label>
              <label>Localização
                <input value={itemForm.localizacao ?? ''} onChange={e => setItemForm(f => ({ ...f, localizacao: e.target.value }))} placeholder="Ex: Prateleira A3" />
              </label>
              <label style={{ gridColumn: 'span 2', flexDirection: 'row', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={itemForm.rastreiaNumeroSerie ?? false}
                  onChange={e => setItemForm(f => ({ ...f, rastreiaNumeroSerie: e.target.checked }))}
                  style={{ width: 16, height: 16, flexShrink: 0 }}
                />
                Rastrear número de série individualmente
              </label>
              <label>Status
                <select value={itemForm.status ?? 'Ativo'} onChange={e => setItemForm(f => ({ ...f, status: e.target.value as EstoqueItem['status'] }))}>
                  <option value="Ativo">Ativo</option>
                  <option value="Suspenso">Suspenso</option>
                  <option value="Descontinuado">Descontinuado</option>
                </select>
              </label>
              <label style={{ gridColumn: 'span 2' }}>Observações
                <textarea rows={2} value={itemForm.observacoes ?? ''} onChange={e => setItemForm(f => ({ ...f, observacoes: e.target.value }))} />
              </label>
            </div>
            {itemError && <p className={styles.error}>{itemError}</p>}
            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowItemModal(false)}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={itemSaving}>{itemSaving ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ══ MODAL — REGISTRAR MOVIMENTO ══ */}
      {showMovModal && movItem && (
        <Modal title={movForm._isVendaAvulsa ? `Vender: ${movItem.nome}` : `Movimentar: ${movItem.nome}`} onClose={() => setShowMovModal(false)} size="lg">
          <form onSubmit={handleSaveMov} noValidate className={styles.form}>
            {/* saldo atual */}
            <div style={{ display: 'flex', gap: 16, padding: '10px 14px', background: 'var(--surface-2, #f8fafc)', borderRadius: 8, fontSize: '0.83rem', flexWrap: 'wrap' }}>
              <span><strong>Atual:</strong> {movItem.quantidadeAtual}</span>
              <span><strong>Reservado:</strong> {movItem.quantidadeReservada}</span>
              <span style={{ color: estoqueColor(movItem), fontWeight: 700 }}><strong>Disponível:</strong> {dispAtual}</span>
              <span><strong>Mínimo:</strong> {movItem.quantidadeMinima}</span>
            </div>

            <div className={styles.formGrid2}>
              <label style={{ gridColumn: 'span 2' }}>Tipo de Movimento *
                <select value={movForm.tipo} onChange={e => setMovForm(f => ({ ...f, tipo: e.target.value }))}>
                  <option value="">Selecione...</option>
                  <optgroup label="Entradas">
                    <option value="entrada_compra">Compra</option>
                    <option value="entrada_devolucao">Devolução</option>
                    <option value="entrada_ajuste">Ajuste positivo</option>
                  </optgroup>
                  <optgroup label="Saídas">
                    <option value="saida_pedido">Saída para pedido</option>
                    <option value="saida_avaria">Avaria / Descarte</option>
                    <option value="saida_ajuste">Ajuste negativo</option>
                  </optgroup>
                  <optgroup label="Reserva">
                    <option value="reserva">Reservar para pedido</option>
                    <option value="cancelamento_reserva">Cancelar reserva</option>
                    <option value="entrega_reserva">Concretizar entrega</option>
                  </optgroup>
                </select>
              </label>

              <label>Quantidade *
                <input
                  type="number"
                  min="1"
                  value={movForm.quantidade}
                  onChange={e => setMovForm(f => ({ ...f, quantidade: Number(e.target.value) }))}
                />
              </label>

              <label>Lote
                <input value={movForm.lote} onChange={e => setMovForm(f => ({ ...f, lote: e.target.value }))} placeholder="Opcional" />
              </label>

              <label>Pedido (número)
                <input value={movForm.pedidoNumero} onChange={e => setMovForm(f => ({ ...f, pedidoNumero: e.target.value }))} placeholder="Ex: PED-2026-001" />
              </label>

              <label>Cliente
                <input value={movForm.clienteNome} onChange={e => setMovForm(f => ({ ...f, clienteNome: e.target.value }))} placeholder="Nome do cliente" />
              </label>

              {isEntradaMov && (
                <label>Custo Unitário (entrada)
                  <input type="number" min="0" step="0.01" value={movForm.custoUnitario} onChange={e => setMovForm(f => ({ ...f, custoUnitario: e.target.value }))} placeholder="0,00" />
                </label>
              )}

              {movForm._isVendaAvulsa && (
                <label style={{ gridColumn: 'span 2' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    Preço de Venda (R$)
                    {movItem?.precoVenda && <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Sugerido: {moeda(movItem.precoVenda)}</span>}
                  </span>
                  <input type="number" min="0" step="0.01" value={movForm.precoVenda} onChange={e => setMovForm(f => ({ ...f, precoVenda: e.target.value }))} placeholder="0,00" />
                </label>
              )}

              {isCompra && (
                <label>NF do Fornecedor
                  <input value={movForm.nfFornecedor} onChange={e => setMovForm(f => ({ ...f, nfFornecedor: e.target.value }))} placeholder="Ex: NF 12345" />
                </label>
              )}

              {movItem.rastreiaNumeroSerie && (
                <label style={{ gridColumn: 'span 2' }}>Números de Série (um por linha)
                  <textarea
                    rows={4}
                    value={movForm.numerosSerie}
                    onChange={e => setMovForm(f => ({ ...f, numerosSerie: e.target.value }))}
                    placeholder="Insira um número de série por linha"
                  />
                </label>
              )}

              <label style={{ gridColumn: 'span 2' }}>Observações
                <textarea rows={2} value={movForm.observacoes} onChange={e => setMovForm(f => ({ ...f, observacoes: e.target.value }))} />
              </label>
            </div>

            {movError && <p className={styles.error}>{movError}</p>}
            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowMovModal(false)}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={movSaving}>{movSaving ? 'Registrando...' : 'Confirmar Movimento'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ══ MODAL — HISTÓRICO DO ITEM ══ */}
      {showHistModal && histItem && (
        <Modal title={`Histórico: ${histItem.nome}`} onClose={() => setShowHistModal(false)} size="lg">
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {histLoading ? (
              <p style={{ textAlign: 'center', color: '#64748b', padding: 32 }}>Carregando...</p>
            ) : histRows.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#64748b', padding: 32 }}>Nenhum movimento encontrado para este item.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--surface-border)', background: 'var(--surface-2)' }}>
                    {['Data', 'Tipo', 'Qtd', 'Saldo antes → depois', 'Pedido', 'Responsável', 'Obs'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {histRows.map(r => (
                    <tr key={r._id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: '#475569' }}>{fmtDate(r.dataMovimento)}</td>
                      <td style={{ padding: '8px 10px' }}><Badge label={TIPO_LABEL[r.tipo] ?? r.tipo} variant={movBadgeVariant(r.tipo)} /></td>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: r.tipo.startsWith('entrada') ? '#16a34a' : '#dc2626' }}>
                        {r.tipo.startsWith('entrada') || r.tipo === 'cancelamento_reserva' ? '+' : '-'}{r.quantidade}
                      </td>
                      <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums' }}>
                        <span style={{ color: '#94a3b8' }}>{r.saldoAnterior}</span>
                        {' → '}
                        <strong>{r.saldoPosterior}</strong>
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        {r.pedidoNumero
                          ? <code style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>{r.pedidoNumero}</code>
                          : <span style={{ color: '#94a3b8' }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 10px', color: '#475569' }}>{r.responsavelNome ?? '—'}</td>
                      <td style={{ padding: '8px 10px', maxWidth: 160, color: '#64748b' }}>{r.observacoes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className={styles.formActions} style={{ marginTop: 16 }}>
            <button className={styles.btnSecondary} onClick={() => setShowHistModal(false)}>Fechar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── KPI card auxiliar ────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string
  value: string
  danger?: boolean
  wide?: boolean
}

function KpiCard({ label, value, danger, wide }: KpiCardProps) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: `1px solid ${danger ? 'rgba(239,68,68,0.35)' : 'var(--surface-border)'}`,
      borderRadius: 10,
      padding: '14px 18px',
      gridColumn: wide ? 'span 2' : undefined,
    }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1, color: danger ? '#dc2626' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </span>
        {danger && (
          <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#fef2f2', color: '#dc2626', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '2px 6px' }}>
            Atenção
          </span>
        )}
      </div>
    </div>
  )
}
