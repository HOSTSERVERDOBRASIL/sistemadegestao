import { useEffect, useState, useCallback } from 'react'
import PageHeader from '../components/PageHeader'
import Table from '../components/Table'
import Badge from '../components/Badge'
import Pagination from '../components/Pagination'
import Modal from '../components/Modal'
import { parceiros as api } from '../api'
import type { Parceiro, ParceiroPayload } from '../types'
import { email as validateEmail, documento as validateDoc, required, hasErrors, type FieldErrors } from '../utils/validate'
import styles from './Page.module.css'

const BLANK: ParceiroPayload = { nome: '', documento: '', email: '', emissorNFPadrao: 'XDigital', ativo: true }

type Errs = FieldErrors<ParceiroPayload>
type FiltroAtivo = 'todos' | 'ativos' | 'inativos'

function validate(f: ParceiroPayload): Errs {
  return {
    nome:      required(f.nome, 'Nome'),
    email:     validateEmail(f.email),
    documento: validateDoc(f.documento),
  }
}

export default function Parceiros() {
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

  const ativoParam = filtroAtivo === 'ativos' ? 'true' : filtroAtivo === 'inativos' ? 'false' : undefined

  const load = useCallback(() => {
    setLoading(true)
    api.list({ page, busca, ativo: ativoParam })
      .then(res => { setRows(res.data); setTotal(res.total) })
      .finally(() => setLoading(false))
  }, [page, busca, ativoParam])

  useEffect(() => { load() }, [load])

  function openCreate() { setEditing(null); setForm(BLANK); setErrs({}); setTouched(false); setShowModal(true) }
  function openEdit(p: Parceiro) {
    setEditing(p)
    setForm({ nome: p.nome, documento: p.documento, email: p.email, emissorNFPadrao: p.emissorNFPadrao, ativo: p.ativo })
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

  const columns = [
    {
      key: 'nome', header: 'Nome',
      render: (r: Parceiro) => (
        <span className={!r.ativo ? styles.rowInativo : ''}>
          <strong>{r.nome}</strong>
          {!r.ativo && <span className={styles.tagInativo}>inativo</span>}
        </span>
      )
    },
    { key: 'email', header: 'E-mail', render: (r: Parceiro) => <span className={!r.ativo ? styles.rowInativo : ''}>{r.email}</span> },
    { key: 'documento', header: 'Documento', render: (r: Parceiro) => <span className={!r.ativo ? styles.rowInativo : ''}>{r.documento}</span> },
    { key: 'emissorNFPadrao', header: 'Emissor NF', render: (r: Parceiro) => <Badge label={r.emissorNFPadrao} /> },
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
        subtitle={`${total} registro(s)`}
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

      {detalhe && (
        <div className={styles.drawerOverlay} onClick={() => setDetalhe(null)}>
          <aside className={styles.drawer} onClick={e => e.stopPropagation()}>
            <div className={styles.drawerHead}>
              <div>
                <h3 className={styles.drawerTitle}>{detalhe.nome}</h3>
                <Badge label={detalhe.ativo ? 'Ativo' : 'Inativo'} variant={detalhe.ativo ? 'success' : 'default'} />
              </div>
              <button className={styles.drawerClose} onClick={() => setDetalhe(null)}>✕</button>
            </div>
            <dl className={styles.drawerDl}>
              <dt>E-mail</dt><dd>{detalhe.email}</dd>
              <dt>Documento</dt><dd>{detalhe.documento}</dd>
              <dt>Emissor NF</dt><dd><Badge label={detalhe.emissorNFPadrao} /></dd>
            </dl>
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

      {showModal && (
        <Modal title={editing ? 'Editar Parceiro' : 'Novo Parceiro'} onClose={() => setShowModal(false)}>
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
              <label>Emissor NF Padrão
                <select value={form.emissorNFPadrao} onChange={e => update({ emissorNFPadrao: e.target.value as Parceiro['emissorNFPadrao'] })}>
                  <option value="XDigital">XDigital</option>
                  <option value="Revendedor">Revendedor</option>
                </select>
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
