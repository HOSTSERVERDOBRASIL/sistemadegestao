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
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Parceiro | null>(null)
  const [form, setForm] = useState<ParceiroPayload>(BLANK)
  const [errs, setErrs] = useState<Errs>({})
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api.list({ page, busca }).then(res => { setRows(res.data); setTotal(res.total) }).finally(() => setLoading(false))
  }, [page, busca])

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
    const validation = validate(form)
    setErrs(validation)
    if (hasErrors(validation)) return
    setSaving(true); setError('')
    try {
      if (editing) await api.update(editing._id, form)
      else await api.create(form)
      setShowModal(false); load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Desativar este parceiro?')) return
    await api.remove(id).catch(() => {})
    load()
  }

  const columns = [
    { key: 'nome', header: 'Nome', render: (r: Parceiro) => <strong>{r.nome}</strong> },
    { key: 'email', header: 'E-mail' },
    { key: 'documento', header: 'Documento' },
    { key: 'emissorNFPadrao', header: 'Emissor NF', render: (r: Parceiro) => <Badge label={r.emissorNFPadrao} /> },
    { key: 'ativo', header: 'Status', render: (r: Parceiro) => <Badge label={r.ativo ? 'Ativo' : 'Inativo'} variant={r.ativo ? 'success' : 'default'} /> },
    {
      key: '_actions', header: '', width: '120px',
      render: (r: Parceiro) => (
        <div className={styles.rowActions}>
          <button className={styles.btnLink} onClick={e => { e.stopPropagation(); openEdit(r) }}>Editar</button>
          <button className={styles.btnDanger} onClick={e => { e.stopPropagation(); handleDelete(r._id) }}>✕</button>
        </div>
      )
    },
  ]

  return (
    <div className={styles.page}>
      <PageHeader title="Parceiros / Revendedores" subtitle={`${total} registro(s)`}
        action={<button className={styles.btnPrimary} onClick={openCreate}>+ Novo Parceiro</button>}
      />
      <div className={styles.filters}>
        <input className={styles.search} placeholder="Buscar por nome, e-mail ou documento..." value={busca}
          onChange={e => { setBusca(e.target.value); setPage(1) }} />
      </div>
      <Table columns={columns} rows={rows} loading={loading} empty="Nenhum parceiro encontrado" />
      <Pagination page={page} total={total} limit={20} onChange={setPage} />

      {showModal && (
        <Modal title={editing ? 'Editar Parceiro' : 'Novo Parceiro'} onClose={() => setShowModal(false)}>
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
              <label>Documento (CNPJ/CPF) *
                <input
                  value={form.documento}
                  onChange={e => update({ documento: e.target.value })}
                  placeholder="Somente números"
                  className={errs.documento ? styles.inputError : ''}
                />
                {errs.documento && <span className={styles.fieldError}>{errs.documento}</span>}
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
