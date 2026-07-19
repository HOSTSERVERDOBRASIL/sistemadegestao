import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Table from '../components/Table'
import Badge from '../components/Badge'
import Pagination from '../components/Pagination'
import Modal from '../components/Modal'
import { parceiros as api } from '../api'
import type { Parceiro, ParceiroPayload, Pedido } from '../types'
import { email as validateEmail, documento as validateDoc, required, hasErrors, type FieldErrors } from '../utils/validate'
import styles from './Page.module.css'

const BLANK: ParceiroPayload = {
  nome: '', documento: '', email: '', telefone: '',
  emissorNFPadrao: 'XDigital', comissaoPercentual: undefined, observacoes: '', ativo: true,
}

type Errs = FieldErrors<ParceiroPayload>
type FiltroAtivo = 'todos' | 'ativos' | 'inativos'

function validate(f: ParceiroPayload): Errs {
  return {
    nome:      required(f.nome, 'Nome'),
    email:     validateEmail(f.email),
    documento: validateDoc(f.documento),
  }
}

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function Parceiros() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [rows, setRows] = useState<Parceiro[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroAtivo, setFiltroAtivo] = useState<FiltroAtivo>('todos')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Parceiro | null>(null)
  const [form, setForm] = useState<ParceiroPayload>(BLANK)
  const [errs, setErrs] = useState<Errs>({})
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toggling, setToggling] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<Parceiro | null>(null)
  const [pedidosParceiro, setPedidosParceiro] = useState<Pedido[]>([])
  const [loadingPedidos, setLoadingPedidos] = useState(false)

  const ativoParam = filtroAtivo === 'ativos' ? 'true' : filtroAtivo === 'inativos' ? 'false' : undefined

  const load = useCallback(() => {
    setLoading(true)
    api.list({ page, busca, ativo: ativoParam })
      .then(res => { setRows(res.data); setTotal(res.total) })
      .finally(() => setLoading(false))
  }, [page, busca, ativoParam])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!detalhe) { setPedidosParceiro([]); return }
    setLoadingPedidos(true)
    api.pedidos(detalhe._id)
      .then(setPedidosParceiro)
      .catch(() => setPedidosParceiro([]))
      .finally(() => setLoadingPedidos(false))
  }, [detalhe?._id])

  function openCreate() {
    setEditing(null); setForm(BLANK); setErrs({}); setTouched(false); setShowModal(true)
  }

  function openEdit(p: Parceiro) {
    setEditing(p)
    setForm({
      nome: p.nome, documento: p.documento, email: p.email,
      telefone: p.telefone ?? '',
      emissorNFPadrao: p.emissorNFPadrao,
      comissaoPercentual: p.comissaoPercentual,
      observacoes: p.observacoes ?? '',
      ativo: p.ativo,
    })
    setErrs({}); setTouched(false); setShowModal(true)
  }

  function update(patch: Partial<ParceiroPayload>) {
    const next = { ...form, ...patch }
    setForm(next)
    if (touched) setErrs(validate(next))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setTouched(true)
    const v = validate(form)
    setErrs(v)
    if (hasErrors(v)) return
    setSaving(true); setError('')
    try {
      if (editing) await api.update(editing._id, form)
      else await api.create(form)
      setShowModal(false); load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  async function handleToggle(p: Parceiro, e: React.MouseEvent) {
    e.stopPropagation()
    const novo = !p.ativo
    if (!confirm(`${novo ? 'Reativar' : 'Desativar'} "${p.nome}"?`)) return
    setToggling(p._id)
    try {
      const updated = await api.toggleAtivo(p._id, novo)
      setRows(prev => prev.map(r => r._id === p._id ? updated : r))
      if (detalhe?._id === p._id) setDetalhe(updated)
    } catch { load() }
    finally { setToggling(null) }
  }

  const ativos = rows.filter(r => r.ativo).length
  const inativos = rows.filter(r => !r.ativo).length

  const totalRevenda = pedidosParceiro.reduce((s, p) => s + p.valorTotal, 0)

  const columns = [
    {
      key: 'nome', header: 'Revendedor',
      render: (r: Parceiro) => (
        <span className={!r.ativo ? styles.rowInativo : ''}>
          <strong>{r.nome}</strong>
          {!r.ativo && <span className={styles.tagInativo}>inativo</span>}
          {r.comissaoPercentual ? (
            <span style={{ fontSize: '0.72rem', color: '#7c3aed', fontWeight: 600, marginLeft: 7, background: '#ede9fe', padding: '1px 6px', borderRadius: 4 }}>
              {r.comissaoPercentual}%
            </span>
          ) : null}
        </span>
      )
    },
    { key: 'documento', header: 'Documento', render: (r: Parceiro) => <span className={!r.ativo ? styles.rowInativo : ''}>{r.documento}</span> },
    { key: 'email', header: 'E-mail', render: (r: Parceiro) => <span className={!r.ativo ? styles.rowInativo : ''}>{r.email}</span> },
    {
      key: 'emissorNFPadrao', header: 'Emite NF por',
      render: (r: Parceiro) => <Badge label={r.emissorNFPadrao} variant={r.emissorNFPadrao === 'Revendedor' ? 'purple' : 'default'} />
    },
    { key: 'ativo', header: 'Status', render: (r: Parceiro) => <Badge label={r.ativo ? 'Ativo' : 'Inativo'} variant={r.ativo ? 'success' : 'default'} /> },
    {
      key: '_actions', header: '', width: '170px',
      render: (r: Parceiro) => (
        <div className={styles.rowActions}>
          <button className={styles.btnLink} onClick={e => { e.stopPropagation(); openEdit(r) }}>Editar</button>
          <button
            className={r.ativo ? styles.btnDesativar : styles.btnReativar}
            disabled={toggling === r._id}
            onClick={e => handleToggle(r, e)}
          >
            {toggling === r._id ? '...' : r.ativo ? 'Desativar' : 'Reativar'}
          </button>
        </div>
      )
    },
  ]

  return (
    <div className={styles.page}>
      <PageHeader
        title="Parceiros / Revendedores"
        subtitle={`${total} cadastrado(s)`}
        action={<button className={styles.btnPrimary} onClick={openCreate}>+ Novo Parceiro</button>}
      />

      <div className={styles.statusRow}>
        <button className={`${styles.chip} ${filtroAtivo === 'todos' ? styles.chipActive : ''}`} onClick={() => { setFiltroAtivo('todos'); setPage(1) }}>
          Todos <span className={styles.chipCount}>{total}</span>
        </button>
        <button className={`${styles.chip} ${styles.chipGreen} ${filtroAtivo === 'ativos' ? styles.chipActive : ''}`} onClick={() => { setFiltroAtivo('ativos'); setPage(1) }}>
          Ativos <span className={styles.chipCount}>{ativos}</span>
        </button>
        <button className={`${styles.chip} ${styles.chipRed} ${filtroAtivo === 'inativos' ? styles.chipActive : ''}`} onClick={() => { setFiltroAtivo('inativos'); setPage(1) }}>
          Inativos <span className={styles.chipCount}>{inativos}</span>
        </button>
      </div>

      <div className={styles.filters}>
        <input className={styles.search} placeholder="Buscar por nome, e-mail ou documento..." value={busca}
          onChange={e => { setBusca(e.target.value); setPage(1) }} />
      </div>

      <Table columns={columns} rows={rows} loading={loading} empty="Nenhum parceiro encontrado" onRowClick={setDetalhe} />
      <Pagination page={page} total={total} limit={20} onChange={setPage} />

      {/* ── Drawer de detalhe ── */}
      {detalhe && (
        <div className={styles.drawerOverlay} onClick={() => setDetalhe(null)}>
          <aside className={styles.drawer} onClick={e => e.stopPropagation()}>
            <div className={styles.drawerHead}>
              <div>
                <h3 className={styles.drawerTitle}>{detalhe.nome}</h3>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  <Badge label={detalhe.ativo ? 'Ativo' : 'Inativo'} variant={detalhe.ativo ? 'success' : 'default'} />
                  <Badge label={`Emite: ${detalhe.emissorNFPadrao}`} variant={detalhe.emissorNFPadrao === 'Revendedor' ? 'purple' : 'default'} />
                  {detalhe.comissaoPercentual != null && (
                    <Badge label={`Comissão ${detalhe.comissaoPercentual}%`} variant="info" />
                  )}
                </div>
              </div>
              <button className={styles.drawerClose} onClick={() => setDetalhe(null)}>✕</button>
            </div>

            <dl className={styles.drawerDl}>
              <dt>Documento</dt><dd>{detalhe.documento}</dd>
              <dt>E-mail</dt><dd>{detalhe.email}</dd>
              {detalhe.telefone && <><dt>Telefone</dt><dd>{detalhe.telefone}</dd></>}
              {detalhe.observacoes && <><dt>Observações</dt><dd style={{ fontSize: '0.8rem', color: '#475569' }}>{detalhe.observacoes}</dd></>}
            </dl>

            {/* Pedidos de revenda */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Pedidos de Revenda
                </span>
                {pedidosParceiro.length > 0 && (
                  <span style={{ fontSize: '0.75rem', color: '#6d28d9', fontWeight: 600 }}>
                    Total: {moeda(totalRevenda)}
                  </span>
                )}
              </div>

              {loadingPedidos ? (
                <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Carregando...</p>
              ) : pedidosParceiro.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Nenhum pedido vinculado</p>
              ) : (
                <div style={{ overflow: 'auto', flex: 1 }}>
                  {pedidosParceiro.slice(0, 8).map(p => {
                    const cliente = typeof p.clienteId === 'object' ? p.clienteId.nome : '—'
                    return (
                      <div
                        key={p._id}
                        onClick={() => navigate(`/pedidos/${p._id}`)}
                        style={{
                          padding: '8px 0', borderBottom: '1px solid #f1f5f9',
                          cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', gap: 8,
                        }}
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
                  {pedidosParceiro.length > 8 && (
                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 6, textAlign: 'center' }}>
                      +{pedidosParceiro.length - 8} pedidos — veja em Pedidos com filtro
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className={styles.drawerFooter}>
              <button className={styles.btnPrimary} onClick={() => { openEdit(detalhe); setDetalhe(null) }}>Editar dados</button>
              <button
                className={detalhe.ativo ? styles.btnDesativar : styles.btnReativar}
                disabled={toggling === detalhe._id}
                onClick={e => handleToggle(detalhe, e)}
              >
                {toggling === detalhe._id ? 'Aguarde...' : detalhe.ativo ? 'Desativar parceiro' : 'Reativar parceiro'}
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Modal de edição ── */}
      {showModal && (
        <Modal title={editing ? 'Editar Parceiro' : 'Novo Parceiro'} onClose={() => setShowModal(false)} size="md">
          <form onSubmit={handleSave} noValidate className={styles.form}>
            <div className={styles.formGrid2}>
              <label>Nome *
                <input value={form.nome} onChange={e => update({ nome: e.target.value })} className={errs.nome ? styles.inputError : ''} />
                {errs.nome && <span className={styles.fieldError}>{errs.nome}</span>}
              </label>
              <label>Documento (CNPJ/CPF) *
                <input value={form.documento} onChange={e => update({ documento: e.target.value })} placeholder="Somente números" className={errs.documento ? styles.inputError : ''} />
                {errs.documento && <span className={styles.fieldError}>{errs.documento}</span>}
              </label>
              <label>E-mail *
                <input type="email" value={form.email} onChange={e => update({ email: e.target.value })} className={errs.email ? styles.inputError : ''} />
                {errs.email && <span className={styles.fieldError}>{errs.email}</span>}
              </label>
              <label>Telefone
                <input value={form.telefone || ''} onChange={e => update({ telefone: e.target.value })} placeholder="(48) 9 9999-9999" />
              </label>
              <label>Emissão de NF padrão
                <select value={form.emissorNFPadrao} onChange={e => update({ emissorNFPadrao: e.target.value as Parceiro['emissorNFPadrao'] })}>
                  <option value="XDigital">XDigital Brasil emite</option>
                  <option value="Revendedor">Revendedor emite</option>
                </select>
              </label>
              <label>Comissão (%)
                <input
                  type="number" min="0" max="100" step="0.1"
                  value={form.comissaoPercentual ?? ''}
                  onChange={e => update({ comissaoPercentual: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="Ex: 10"
                />
              </label>
              <label style={{ gridColumn: 'span 2' }}>Observações
                <textarea value={form.observacoes || ''} onChange={e => update({ observacoes: e.target.value })} rows={2} placeholder="Condições comerciais, contato responsável..." />
              </label>
              <label>Status
                <select value={form.ativo ? 'true' : 'false'} onChange={e => update({ ativo: e.target.value === 'true' })}>
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
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
