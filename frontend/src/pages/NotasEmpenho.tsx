import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Table from '../components/Table'
import Badge from '../components/Badge'
import Pagination from '../components/Pagination'
import Modal from '../components/Modal'
import { notasEmpenho as api, clientes as clientesApi, contratos as contratosApi } from '../api'
import type { NotaEmpenho, NotaEmpenhoPayload, Cliente, Contrato, Pedido } from '../types'
import styles from './Page.module.css'

const STATUS_OPTS = ['Aberto', 'Parcialmente utilizado', 'Encerrado']

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmt(d: string) {
  return new Date(d).toLocaleDateString('pt-BR')
}

const BLANK: NotaEmpenhoPayload = {
  numero: '', clienteId: '', contratoId: '', valor: 0,
  dataEmissao: '', dataVencimento: '', descricao: '', observacoes: '',
}

export default function NotasEmpenho() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [rows, setRows] = useState<NotaEmpenho[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<NotaEmpenhoPayload>(BLANK)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [detalhe, setDetalhe] = useState<NotaEmpenho | null>(null)
  const [pedidosNota, setPedidosNota] = useState<Pedido[]>([])
  const [loadingPedidos, setLoadingPedidos] = useState(false)
  const [clientesList, setClientesList] = useState<Cliente[]>([])
  const [contratosList, setContratosList] = useState<Contrato[]>([])
  const [editando, setEditando] = useState<NotaEmpenho | null>(null)
  const [editForm, setEditForm] = useState<{ numero: string; descricao: string; dataVencimento: string; observacoes: string }>({ numero: '', descricao: '', dataVencimento: '', observacoes: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api.list({ page, busca, status: filtroStatus || undefined })
      .then(res => { setRows(res.data); setTotal(res.total) })
      .finally(() => setLoading(false))
  }, [page, busca, filtroStatus])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!showModal) return
    clientesApi.list({ limit: 100, ativo: 'true' }).then(r => setClientesList(r.data))
  }, [showModal])

  useEffect(() => {
    if (!showModal || !form.clienteId) { setContratosList([]); return }
    contratosApi.list({ clienteId: form.clienteId, ativo: 'true', limit: 100 })
      .then(r => setContratosList(r.data))
  }, [showModal, form.clienteId])

  useEffect(() => {
    if (!detalhe) { setPedidosNota([]); return }
    setLoadingPedidos(true)
    api.pedidos(detalhe._id)
      .then(setPedidosNota)
      .catch(() => setPedidosNota([]))
      .finally(() => setLoadingPedidos(false))
  }, [detalhe?._id])

  function update(patch: Partial<NotaEmpenhoPayload>) {
    setForm(prev => ({ ...prev, ...patch }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.numero || !form.clienteId || !form.valor || !form.dataEmissao) {
      setError('Preencha número, cliente, valor e data de emissão')
      return
    }
    setSaving(true); setError('')
    try {
      await api.create({
        ...form,
        contratoId: form.contratoId || undefined,
        dataVencimento: form.dataVencimento || undefined,
        descricao: form.descricao || undefined,
        observacoes: form.observacoes || undefined,
      })
      setShowModal(false); setForm(BLANK); load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  function abrirEdicao(nota: NotaEmpenho) {
    setEditando(nota)
    setEditForm({
      numero: nota.numero,
      descricao: nota.descricao || '',
      dataVencimento: nota.dataVencimento ? nota.dataVencimento.slice(0, 10) : '',
      observacoes: nota.observacoes || '',
    })
    setEditError('')
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editando) return
    setEditSaving(true); setEditError('')
    try {
      const updated = await api.update(editando._id, {
        numero: editForm.numero || undefined,
        descricao: editForm.descricao || undefined,
        dataVencimento: editForm.dataVencimento || undefined,
        observacoes: editForm.observacoes || undefined,
      })
      setEditando(null)
      load()
      if (detalhe?._id === updated._id) setDetalhe(updated)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally { setEditSaving(false) }
  }

  async function handleEncerrar(nota: NotaEmpenho) {
    if (!confirm(`Encerrar nota de empenho "${nota.numero}"?`)) return
    try {
      await api.update(nota._id, { status: 'Encerrado' })
      load()
      if (detalhe?._id === nota._id) setDetalhe(prev => prev ? { ...prev, status: 'Encerrado' } : null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro')
    }
  }

  const statusVariant = (s: NotaEmpenho['status']) =>
    s === 'Aberto' ? 'success' : s === 'Parcialmente utilizado' ? 'warning' : 'default'

  const saldo = (nota: NotaEmpenho) => nota.valor - nota.valorUtilizado

  const columns = [
    { key: 'numero', header: 'Número', render: (r: NotaEmpenho) => <strong>{r.numero}</strong> },
    {
      key: 'clienteId', header: 'Cliente',
      render: (r: NotaEmpenho) => typeof r.clienteId === 'object' ? r.clienteId.nome : r.clienteId
    },
    { key: 'dataEmissao', header: 'Emissão', render: (r: NotaEmpenho) => fmt(r.dataEmissao) },
    { key: 'valor', header: 'Valor', render: (r: NotaEmpenho) => moeda(r.valor) },
    {
      key: 'saldo', header: 'Saldo',
      render: (r: NotaEmpenho) => {
        const s = saldo(r)
        return <span style={{ color: s > 0 ? '#15803d' : '#b91c1c', fontWeight: 600 }}>{moeda(s)}</span>
      }
    },
    {
      key: 'status', header: 'Status',
      render: (r: NotaEmpenho) => <Badge label={r.status} variant={statusVariant(r.status)} />
    },
    {
      key: '_actions', header: '', width: '160px',
      render: (r: NotaEmpenho) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            className={styles.btnSecondary}
            style={{ fontSize: '0.72rem', padding: '4px 8px' }}
            onClick={e => { e.stopPropagation(); abrirEdicao(r) }}
          >Editar</button>
          {r.status !== 'Encerrado' && (
            <button
              className={styles.btnDesativar}
              style={{ fontSize: '0.72rem' }}
              onClick={e => { e.stopPropagation(); handleEncerrar(r) }}
            >Encerrar</button>
          )}
        </div>
      )
    },
  ]

  return (
    <div className={styles.page}>
      <PageHeader
        title="Notas de Empenho"
        subtitle={`${total} registro(s)`}
        action={<button className={styles.btnPrimary} onClick={() => { setForm(BLANK); setError(''); setShowModal(true) }}>+ Nova Nota de Empenho</button>}
      />

      <div className={styles.filters}>
        <input
          className={styles.search}
          placeholder="Buscar por número..."
          value={busca}
          onChange={e => { setBusca(e.target.value); setPage(1) }}
        />
        <select value={filtroStatus} onChange={e => { setFiltroStatus(e.target.value); setPage(1) }}>
          <option value="">Todos os status</option>
          {STATUS_OPTS.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      <Table columns={columns} rows={rows} loading={loading} empty="Nenhuma nota de empenho encontrada" onRowClick={setDetalhe} />
      <Pagination page={page} total={total} limit={20} onChange={setPage} />

      {/* Drawer de detalhe */}
      {detalhe && (
        <div className={styles.drawerOverlay} onClick={() => setDetalhe(null)}>
          <aside className={styles.drawer} onClick={e => e.stopPropagation()}>
            <div className={styles.drawerHead}>
              <div>
                <h3 className={styles.drawerTitle}>{detalhe.numero}</h3>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <Badge label={detalhe.status} variant={statusVariant(detalhe.status)} />
                </div>
              </div>
              <button className={styles.drawerClose} onClick={() => setDetalhe(null)}>✕</button>
            </div>

            <dl className={styles.drawerDl}>
              <dt>Cliente</dt>
              <dd><strong>{typeof detalhe.clienteId === 'object' ? detalhe.clienteId.nome : detalhe.clienteId}</strong></dd>
              {typeof detalhe.clienteId === 'object' && <><dt>Documento</dt><dd>{detalhe.clienteId.documento}</dd></>}
              {detalhe.contratoId && typeof detalhe.contratoId === 'object' && (
                <><dt>Contrato</dt><dd>{detalhe.contratoId.numero}</dd></>
              )}
              <dt>Emissão</dt><dd>{fmt(detalhe.dataEmissao)}</dd>
              {detalhe.dataVencimento && <><dt>Vencimento</dt><dd>{fmt(detalhe.dataVencimento)}</dd></>}
              <dt>Valor total</dt><dd><strong>{moeda(detalhe.valor)}</strong></dd>
              <dt>Utilizado</dt><dd>{moeda(detalhe.valorUtilizado)}</dd>
              <dt>Saldo</dt>
              <dd style={{ color: saldo(detalhe) > 0 ? '#15803d' : '#b91c1c', fontWeight: 700 }}>
                {moeda(saldo(detalhe))}
              </dd>
              {detalhe.descricao && <><dt>Descrição</dt><dd>{detalhe.descricao}</dd></>}
              {detalhe.observacoes && <><dt>Obs.</dt><dd style={{ fontSize: '0.8rem', color: '#475569' }}>{detalhe.observacoes}</dd></>}
            </dl>

            {/* Pedidos vinculados */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Pedidos vinculados
              </span>
              {loadingPedidos ? (
                <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Carregando...</p>
              ) : pedidosNota.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Nenhum pedido vinculado</p>
              ) : (
                <div style={{ overflow: 'auto', flex: 1 }}>
                  {pedidosNota.map(p => {
                    const cliente = typeof p.clienteId === 'object' ? p.clienteId.nome : '—'
                    return (
                      <div
                        key={p._id}
                        onClick={() => navigate(`/pedidos/${p._id}`)}
                        style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
                      >
                        <div>
                          <strong style={{ fontSize: '0.82rem' }}>{p.numero}</strong>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{cliente}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{moeda(p.valorTotal)}</div>
                          <Badge label={p.status} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className={styles.drawerFooter}>
              <button className={styles.btnSecondary} onClick={() => abrirEdicao(detalhe)}>
                Editar
              </button>
              {detalhe.status !== 'Encerrado' && (
                <button className={styles.btnDesativar} onClick={() => handleEncerrar(detalhe)}>
                  Encerrar empenho
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Modal de edição */}
      {editando && (
        <Modal title={`Editar — ${editando.numero}`} onClose={() => setEditando(null)} size="md">
          <form onSubmit={handleEditSave} noValidate className={styles.form}>
            <div className={styles.formGrid2}>
              <label style={{ gridColumn: 'span 2' }}>Número do empenho *
                <input value={editForm.numero} onChange={e => setEditForm(f => ({ ...f, numero: e.target.value }))} />
              </label>
              <label>Data de vencimento
                <input type="date" value={editForm.dataVencimento} onChange={e => setEditForm(f => ({ ...f, dataVencimento: e.target.value }))} />
              </label>
              <label>Descrição
                <input value={editForm.descricao} onChange={e => setEditForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Objeto do empenho..." />
              </label>
              <label style={{ gridColumn: 'span 2' }}>Observações
                <textarea value={editForm.observacoes} onChange={e => setEditForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} />
              </label>
            </div>
            {editError && <p className={styles.error}>{editError}</p>}
            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setEditando(null)}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={editSaving}>{editSaving ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal de criação */}
      {showModal && (
        <Modal title="Nova Nota de Empenho" onClose={() => setShowModal(false)} size="md">
          <form onSubmit={handleSave} noValidate className={styles.form}>
            <div className={styles.formGrid2}>
              <label>Número do empenho *
                <input value={form.numero} onChange={e => update({ numero: e.target.value })} placeholder="Ex: 2024NE001234" />
              </label>
              <label>Valor (R$) *
                <input type="number" min="0" step="0.01" value={form.valor || ''} onChange={e => update({ valor: Number(e.target.value) })} />
              </label>
              <label style={{ gridColumn: 'span 2' }}>Cliente *
                <select value={form.clienteId} onChange={e => update({ clienteId: e.target.value, contratoId: '' })}>
                  <option value="">Selecione o cliente...</option>
                  {clientesList.map(c => <option key={c._id} value={c._id}>{c.nome} — {c.documento}</option>)}
                </select>
              </label>
              {contratosList.length > 0 && (
                <label style={{ gridColumn: 'span 2' }}>Contrato (opcional)
                  <select value={form.contratoId || ''} onChange={e => update({ contratoId: e.target.value })}>
                    <option value="">Sem contrato</option>
                    {contratosList.map(c => <option key={c._id} value={c._id}>{c.numero} — {c.modalidade}</option>)}
                  </select>
                </label>
              )}
              <label>Data de emissão *
                <input type="date" value={form.dataEmissao} onChange={e => update({ dataEmissao: e.target.value })} />
              </label>
              <label>Data de vencimento
                <input type="date" value={form.dataVencimento || ''} onChange={e => update({ dataVencimento: e.target.value })} />
              </label>
              <label style={{ gridColumn: 'span 2' }}>Descrição
                <input value={form.descricao || ''} onChange={e => update({ descricao: e.target.value })} placeholder="Objeto do empenho..." />
              </label>
              <label style={{ gridColumn: 'span 2' }}>Observações
                <textarea value={form.observacoes || ''} onChange={e => update({ observacoes: e.target.value })} rows={2} />
              </label>
            </div>
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowModal(false)}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
