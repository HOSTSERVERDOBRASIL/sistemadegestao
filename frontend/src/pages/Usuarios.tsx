import { useEffect, useState, useCallback } from 'react'
import PageHeader from '../components/PageHeader'
import Table from '../components/Table'
import Badge from '../components/Badge'
import Pagination from '../components/Pagination'
import Modal from '../components/Modal'
import { usuarios as api } from '../api'
import type { User, Role } from '../types'
import { email as validateEmail, required, minLength, hasErrors, type FieldErrors } from '../utils/validate'
import styles from './Page.module.css'

const ROLES: Role[] = ['admin', 'operador', 'financeiro', 'cliente']

interface UserForm {
  nome: string; email: string; password: string; role: Role; ativo: boolean
}

const BLANK: UserForm = { nome: '', email: '', password: '', role: 'operador', ativo: true }

type Errs = FieldErrors<UserForm>

function validate(f: UserForm, editing: boolean): Errs {
  const errs: Errs = {
    nome:  required(f.nome, 'Nome'),
    email: validateEmail(f.email),
  }
  if (!editing || f.password) {
    errs.password = minLength(f.password, 6, 'Senha')
  }
  return errs
}

export default function Usuarios() {
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [rows, setRows] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroRole, setFiltroRole] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [form, setForm] = useState<UserForm>(BLANK)
  const [errs, setErrs] = useState<Errs>({})
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api.list({ page, busca, role: filtroRole })
      .then(res => { setRows(res.data); setTotal(res.total) })
      .finally(() => setLoading(false))
  }, [page, busca, filtroRole])

  useEffect(() => { load() }, [load])

  function openCreate() { setEditing(null); setForm(BLANK); setErrs({}); setTouched(false); setShowModal(true) }
  function openEdit(u: User) {
    setEditing(u)
    setForm({ nome: u.nome, email: u.email, password: '', role: u.role, ativo: u.ativo })
    setErrs({}); setTouched(false); setShowModal(true)
  }

  function update(patch: Partial<UserForm>) {
    const next = { ...form, ...patch }
    setForm(next)
    if (touched) setErrs(validate(next, !!editing))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setTouched(true)
    const validation = validate(form, !!editing)
    setErrs(validation)
    if (hasErrors(validation)) return
    setSaving(true); setError('')
    try {
      if (editing) {
        const { password, ...rest } = form
        await api.update(editing._id, password ? form : rest)
      } else {
        await api.create(form)
      }
      setShowModal(false); load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Desativar este usuário?')) return
    await api.remove(id).catch(() => {})
    load()
  }

  const ROLE_LABELS: Record<Role, string> = { admin: 'Admin', operador: 'Operador', financeiro: 'Financeiro', cliente: 'Cliente', revenda: 'Revenda' }
  const ROLE_VARIANTS: Record<Role, 'danger' | 'warning' | 'info' | 'default'> = { admin: 'danger', operador: 'info', financeiro: 'warning', cliente: 'default', revenda: 'default' }

  const columns = [
    { key: 'nome', header: 'Nome', render: (r: User) => <strong>{r.nome}</strong> },
    { key: 'email', header: 'E-mail' },
    { key: 'role', header: 'Perfil', render: (r: User) => <Badge label={ROLE_LABELS[r.role]} variant={ROLE_VARIANTS[r.role]} /> },
    { key: 'ativo', header: 'Status', render: (r: User) => <Badge label={r.ativo ? 'Ativo' : 'Inativo'} variant={r.ativo ? 'success' : 'default'} /> },
    { key: 'createdAt', header: 'Criado em', render: (r: User) => new Date(r.createdAt).toLocaleDateString('pt-BR') },
    {
      key: '_actions', header: '', width: '120px',
      render: (r: User) => (
        <div className={styles.rowActions}>
          <button className={styles.btnLink} onClick={e => { e.stopPropagation(); openEdit(r) }}>Editar</button>
          <button className={styles.btnDanger} onClick={e => { e.stopPropagation(); handleDelete(r._id) }}>✕</button>
        </div>
      )
    },
  ]

  return (
    <div className={styles.page}>
      <PageHeader title="Usuários" subtitle={`${total} registro(s)`}
        action={<button className={styles.btnPrimary} onClick={openCreate}>+ Novo Usuário</button>}
      />
      <div className={styles.filters}>
        <input className={styles.search} placeholder="Buscar por nome ou e-mail..." value={busca}
          onChange={e => { setBusca(e.target.value); setPage(1) }} />
        <select value={filtroRole} onChange={e => { setFiltroRole(e.target.value); setPage(1) }}>
          <option value="">Todos os perfis</option>
          {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
      </div>
      <Table columns={columns} rows={rows} loading={loading} empty="Nenhum usuário encontrado" />
      <Pagination page={page} total={total} limit={20} onChange={setPage} />

      {showModal && (
        <Modal title={editing ? 'Editar Usuário' : 'Novo Usuário'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSave} noValidate className={styles.form}>
            <div className={styles.formGrid2}>
              <label>Nome *
                <input
                  value={form.nome}
                  onChange={e => update({ nome: e.target.value })}
                  className={errs.nome ? styles.inputError : ''}
                />
                {errs.nome && <span className={styles.fieldError}>{errs.nome}</span>}
              </label>
              <label>E-mail *
                <input
                  type="email"
                  value={form.email}
                  onChange={e => update({ email: e.target.value })}
                  className={errs.email ? styles.inputError : ''}
                />
                {errs.email && <span className={styles.fieldError}>{errs.email}</span>}
              </label>
              <label>
                {editing ? 'Nova Senha (deixe em branco para manter)' : 'Senha *'}
                <input
                  type="password"
                  value={form.password}
                  onChange={e => update({ password: e.target.value })}
                  placeholder="mín. 6 caracteres"
                  className={errs.password ? styles.inputError : ''}
                />
                {errs.password && <span className={styles.fieldError}>{errs.password}</span>}
              </label>
              <label>Perfil *
                <select value={form.role} onChange={e => update({ role: e.target.value as Role })}>
                  {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
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
