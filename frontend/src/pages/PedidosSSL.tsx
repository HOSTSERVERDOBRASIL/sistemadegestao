import { useEffect, useState, useCallback } from 'react'
import PageHeader from '../components/PageHeader'
import Table from '../components/Table'
import Badge from '../components/Badge'
import Pagination from '../components/Pagination'
import Modal from '../components/Modal'
import { pedidosSSL as api, clientes as clientesApi } from '../api'
import type { PedidoSSL, Cliente } from '../types'
import styles from './Page.module.css'

const LIMIT = 20

function fmtDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR')
}

function fmtCurrency(v?: number) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function isVencendoEm30(d?: string) {
  if (!d) return false
  const fim = new Date(d)
  const hoje = new Date()
  const diff = (fim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
  return diff >= 0 && diff <= 30
}

function getNomeCliente(clienteId: PedidoSSL['clienteId']): string {
  if (typeof clienteId === 'object' && clienteId !== null) return clienteId.nome
  return clienteId ?? '—'
}

type TipoBadge = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple'

function tipoBadgeVariant(tipo: PedidoSSL['tipo']): TipoBadge {
  switch (tipo) {
    case 'DV':            return 'info'
    case 'OV':            return 'warning'
    case 'EV':            return 'success'
    case 'EV-MultiDominio': return 'success'
    case 'Wildcard':      return 'purple'
    case 'MultiDominio':  return 'info'
    default:              return 'default'
  }
}

function statusBadgeVariant(status: string): TipoBadge {
  switch (status) {
    case 'Emitido':         return 'success'
    case 'Cancelado':       return 'danger'
    case 'Aguardando DCV':  return 'warning'
    case 'Em Validacao':    return 'warning'
    default:                return 'default'
  }
}

const STATUS_OPTIONS = ['Rascunho', 'Aguardando DCV', 'Em Validacao', 'Emitido', 'Cancelado'] as const
const TIPO_OPTIONS   = ['DV', 'OV', 'EV', 'Wildcard', 'MultiDominio'] as const
const PRAZO_OPTIONS  = [1, 2, 3, 4, 5] as const
const DCV_OPTIONS    = ['HTTP-01', 'DNS-01', 'Email'] as const

export default function PedidosSSL() {
  const [page, setPage]     = useState(1)
  const [total, setTotal]   = useState(0)
  const [rows, setRows]     = useState<PedidoSSL[]>([])
  const [loading, setLoading] = useState(true)

  const [busca, setBusca]               = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroTipo, setFiltroTipo]     = useState('')

  const [certsEmitidos, setCertsEmitidos]     = useState(0)
  const [certsVencendo30, setCertsVencendo30] = useState(0)

  const [showModal, setShowModal] = useState(false)
  const [form, setForm]           = useState<Partial<PedidoSSL>>({ fornecedor: 'Sectigo', prazoAnos: 1 })
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  const [clientesList, setClientesList] = useState<Cliente[]>([])

  const load = useCallback(() => {
    setLoading(true)
    api.list({
      page,
      limit: LIMIT,
      busca:  busca || undefined,
      status: filtroStatus || undefined,
      tipo:   filtroTipo || undefined,
    })
      .then(res => {
        setRows(res.data)
        setTotal(res.total)
        const emitidos  = res.data.filter(r => r.status === 'Emitido').length
        const venc30    = res.data.filter(r => isVencendoEm30(r.fimValidade)).length
        setCertsEmitidos(emitidos)
        setCertsVencendo30(venc30)
      })
      .finally(() => setLoading(false))
  }, [page, busca, filtroStatus, filtroTipo])

  useEffect(() => { load() }, [load])

  async function openCreate() {
    setForm({ fornecedor: 'Sectigo', prazoAnos: 1 })
    setError('')
    if (clientesList.length === 0) {
      const res = await clientesApi.list({ limit: 200 })
      setClientesList(res.data)
    }
    setShowModal(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.clienteId)        { setError('Selecione um cliente.'); return }
    if (!form.dominioPrincipal) { setError('Informe o domínio principal.'); return }
    if (!form.tipo)             { setError('Selecione o tipo.'); return }
    setSaving(true); setError('')
    try {
      await api.create(form)
      setShowModal(false)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const subtitleParts: string[] = []
  if (certsEmitidos > 0)  subtitleParts.push(`${certsEmitidos} emitido(s)`)
  if (certsVencendo30 > 0) subtitleParts.push(`${certsVencendo30} vencendo em 30 dias`)
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(', ') : `${total} registro(s)`

  const columns = [
    {
      key: 'numero',
      header: 'Número',
      render: (r: PedidoSSL) => (
        <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.82rem' }}>
          {r.numero}
        </span>
      ),
    },
    {
      key: 'clienteId',
      header: 'Cliente',
      render: (r: PedidoSSL) => (
        <span style={{ fontSize: '0.85rem' }}>{getNomeCliente(r.clienteId)}</span>
      ),
    },
    {
      key: 'dominioPrincipal',
      header: 'Domínio Principal',
      render: (r: PedidoSSL) => (
        <span>
          <span style={{ fontWeight: 500, fontSize: '0.85rem' }}>{r.dominioPrincipal}</span>
          {isVencendoEm30(r.fimValidade) && (
            <span title="Vencendo em 30 dias" style={{ marginLeft: 6 }}>⚠️</span>
          )}
        </span>
      ),
    },
    {
      key: 'tipo',
      header: 'Tipo',
      render: (r: PedidoSSL) => (
        <Badge label={r.tipo} variant={tipoBadgeVariant(r.tipo)} />
      ),
    },
    {
      key: 'fornecedor',
      header: 'Fornecedor',
      render: (r: PedidoSSL) => (
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{r.fornecedor || '—'}</span>
      ),
    },
    {
      key: 'prazoAnos',
      header: 'Prazo',
      render: (r: PedidoSSL) => (
        <span style={{ fontSize: '0.82rem' }}>{r.prazoAnos ? `${r.prazoAnos} ano${r.prazoAnos > 1 ? 's' : ''}` : '—'}</span>
      ),
    },
    {
      key: 'fimValidade',
      header: 'Validade',
      render: (r: PedidoSSL) => {
        const venc = isVencendoEm30(r.fimValidade)
        return (
          <span style={{
            color: venc ? 'var(--warning, #d97706)' : undefined,
            fontWeight: venc ? 600 : undefined,
            fontSize: '0.82rem',
          }}>
            {fmtDate(r.fimValidade)}
          </span>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (r: PedidoSSL) => (
        <Badge label={r.status} variant={statusBadgeVariant(r.status)} />
      ),
    },
    {
      key: '_actions',
      header: '',
      width: '80px',
      render: (r: PedidoSSL) => (
        <div className={styles.rowActions}>
          <button
            className={styles.btnLink}
            onClick={e => { e.stopPropagation(); alert(`Pedido SSL: ${r._id}`) }}
          >
            Ver
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className={styles.page}>
      <PageHeader
        title="Pedidos SSL"
        subtitle={subtitle}
        action={
          <button className={styles.btnPrimary} onClick={openCreate}>
            + Novo Pedido SSL
          </button>
        }
      />

      <div className={styles.filters}>
        <input
          className={styles.search}
          placeholder="Buscar por domínio..."
          value={busca}
          onChange={e => { setBusca(e.target.value); setPage(1) }}
        />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className={styles.chipRow}>
            <span className={styles.chipLabel}>Status</span>
            <button
              className={`${styles.chip} ${filtroStatus === '' ? styles.chipActive : ''}`}
              onClick={() => { setFiltroStatus(''); setPage(1) }}
            >
              Todos
            </button>
            {STATUS_OPTIONS.map(s => (
              <button
                key={s}
                className={`${styles.chip} ${filtroStatus === s ? styles.chipActive : ''}`}
                onClick={() => { setFiltroStatus(s); setPage(1) }}
              >
                {s}
              </button>
            ))}
          </div>

          <div className={styles.chipRow}>
            <span className={styles.chipLabel}>Tipo</span>
            <button
              className={`${styles.chip} ${filtroTipo === '' ? styles.chipActive : ''}`}
              onClick={() => { setFiltroTipo(''); setPage(1) }}
            >
              Todos
            </button>
            {TIPO_OPTIONS.map(t => (
              <button
                key={t}
                className={`${styles.chip} ${filtroTipo === t ? styles.chipActive : ''}`}
                onClick={() => { setFiltroTipo(t); setPage(1) }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Table<PedidoSSL>
        columns={columns}
        rows={rows}
        loading={loading}
        empty="Nenhum pedido SSL encontrado"
      />
      <Pagination page={page} total={total} limit={LIMIT} onChange={setPage} />

      {showModal && (
        <Modal title="Novo Pedido SSL" onClose={() => setShowModal(false)} size="lg">
          <form onSubmit={handleSave} noValidate className={styles.form}>
            <div className={styles.formGrid2}>
              <label>Cliente *
                <select
                  value={typeof form.clienteId === 'string' ? form.clienteId : ''}
                  onChange={e => setForm(f => ({ ...f, clienteId: e.target.value }))}
                >
                  <option value="">Selecione...</option>
                  {clientesList.map(c => (
                    <option key={c._id} value={c._id}>{c.nome}</option>
                  ))}
                </select>
              </label>

              <label>Tipo *
                <select
                  value={form.tipo ?? ''}
                  onChange={e => setForm(f => ({ ...f, tipo: e.target.value as PedidoSSL['tipo'] }))}
                >
                  <option value="">Selecione...</option>
                  <option value="DV">DV</option>
                  <option value="OV">OV</option>
                  <option value="EV">EV</option>
                  <option value="Wildcard">Wildcard</option>
                  <option value="MultiDominio">MultiDominio</option>
                  <option value="EV-MultiDominio">EV-MultiDominio</option>
                </select>
              </label>

              <label>Domínio Principal *
                <input
                  value={form.dominioPrincipal ?? ''}
                  onChange={e => setForm(f => ({ ...f, dominioPrincipal: e.target.value }))}
                  placeholder="exemplo.com.br"
                />
              </label>

              <label>Fornecedor
                <input
                  value={form.fornecedor ?? 'Sectigo'}
                  onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))}
                  placeholder="Sectigo"
                />
              </label>

              <label>Prazo (anos)
                <select
                  value={form.prazoAnos ?? 1}
                  onChange={e => setForm(f => ({ ...f, prazoAnos: Number(e.target.value) as PedidoSSL['prazoAnos'] }))}
                >
                  {PRAZO_OPTIONS.map(p => (
                    <option key={p} value={p}>{p} {p === 1 ? 'ano' : 'anos'}</option>
                  ))}
                </select>
              </label>

              <label>Método DCV
                <select
                  value={form.metodoDCV ?? ''}
                  onChange={e => setForm(f => ({ ...f, metodoDCV: e.target.value }))}
                >
                  <option value="">Selecione...</option>
                  {DCV_OPTIONS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </label>

              <label>Valor Custo (R$)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.valorCusto ?? ''}
                  onChange={e => setForm(f => ({ ...f, valorCusto: Number(e.target.value) }))}
                  placeholder="0,00"
                />
              </label>

              <label>Valor Venda (R$)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.valorVenda ?? ''}
                  onChange={e => setForm(f => ({ ...f, valorVenda: Number(e.target.value) }))}
                  placeholder="0,00"
                />
              </label>
            </div>

            <label>Observações
              <textarea
                rows={3}
                value={form.observacoes ?? ''}
                onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                placeholder="Informações adicionais..."
              />
            </label>

            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setShowModal(false)}
              >
                Cancelar
              </button>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
