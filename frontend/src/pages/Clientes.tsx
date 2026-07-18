import { useEffect, useState, useCallback } from 'react'
import PageHeader from '../components/PageHeader'
import Table from '../components/Table'
import Badge from '../components/Badge'
import Pagination from '../components/Pagination'
import Modal from '../components/Modal'
import { clientes as api } from '../api'
import type { Cliente, ClientePayload } from '../types'
import { email as validateEmail, documento as validateDoc, required, hasErrors, type FieldErrors } from '../utils/validate'
import styles from './Page.module.css'
import cStyles from './Clientes.module.css'

const BLANK: ClientePayload = { nome: '', email: '', documento: '', tipo: 'pessoa-juridica', ativo: true }

type Errs = FieldErrors<ClientePayload>

function validate(f: ClientePayload): Errs {
  return {
    nome:      required(f.nome, 'Nome'),
    email:     validateEmail(f.email),
    documento: validateDoc(f.documento),
  }
}

export default function Clientes() {
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [rows, setRows] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroAtivo, setFiltroAtivo] = useState<'todos' | 'ativos' | 'inativos'>('todos')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Cliente | null>(null)
  const [form, setForm] = useState<ClientePayload>(BLANK)
  const [errs, setErrs] = useState<Errs>({})
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toggling, setToggling] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<Cliente | null>(null)

  const ativoQuery = filtroAtivo === 'ativos' ? 'true' : filtroAtivo === 'inativos' ? 'false' : undefined

  const load = useCallback(() => {
    setLoading(true)
    api.list({ page, busca, tipo: filtroTipo, ativo: ativoQuery })
      .then(res => { setRows(res.data); setTotal(res.total) })
      .finally(() => setLoading(false))
  }, [page, busca, filtroTipo, ativoQuery])

  useEffect(() => { load() }, [load])

  function openCreate() { setEditing(null); setForm(BLANK); setErrs({}); setTouched(false); setShowModal(true) }
  function openEdit(c: Cliente) {
    setEditing(c)
    setForm({ nome: c.nome, email: c.email, documento: c.documento, tipo: c.tipo, telefone: c.telefone, ativo: c.ativo })
    setErrs({}); setTouched(false); setShowModal(true)
  }

  function update(patch: Partial<ClientePayload>) {
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

  async function handleToggle(cliente: Cliente, e: React.MouseEvent) {
    e.stopPropagation()
    const novoStatus = !cliente.ativo
    if (!confirm(`${novoStatus ? 'Reativar' : 'Desativar'} o cliente "${cliente.nome}"?`)) return
    setToggling(cliente._id)
    try {
      const atualizado = await api.toggleAtivo(cliente._id, novoStatus)
      setRows(prev => prev.map(r => r._id === cliente._id ? atualizado : r))
      if (detalhe?._id === cliente._id) setDetalhe(atualizado)
    } catch {
      // silencioso — o load() restaura o estado
      load()
    } finally { setToggling(null) }
  }

  const columns = [
    {
      key: 'nome', header: 'Nome',
      render: (r: Cliente) => (
        <span className={!r.ativo ? cStyles.inativo : ''}>
          <strong>{r.nome}</strong>
          {!r.ativo && <span className={cStyles.inativoTag}>Inativo</span>}
        </span>
      )
    },
    { key: 'email', header: 'E-mail', render: (r: Cliente) => <span className={!r.ativo ? cStyles.inativo : ''}>{r.email}</span> },
    { key: 'documento', header: 'Documento', render: (r: Cliente) => <span className={!r.ativo ? cStyles.inativo : ''}>{r.documento}</span> },
    {
      key: 'tipo', header: 'Tipo',
      render: (r: Cliente) => <Badge label={r.tipo === 'pessoa-juridica' ? 'PJ' : 'PF'} variant="default" />
    },
    {
      key: 'ativo', header: 'Status',
      render: (r: Cliente) => <Badge label={r.ativo ? 'Ativo' : 'Inativo'} variant={r.ativo ? 'success' : 'default'} />
    },
    {
      key: '_actions', header: '', width: '160px',
      render: (r: Cliente) => (
        <div className={styles.rowActions}>
          <button className={styles.btnLink} onClick={e => { e.stopPropagation(); openEdit(r) }}>Editar</button>
          <button
            className={r.ativo ? cStyles.btnDesativar : cStyles.btnReativar}
            disabled={toggling === r._id}
            onClick={e => handleToggle(r, e)}
          >
            {toggling === r._id ? '...' : r.ativo ? 'Desativar' : 'Reativar'}
          </button>
        </div>
      )
    },
  ]

  const totalAtivos = rows.filter(r => r.ativo).length
  const totalInativos = rows.filter(r => !r.ativo).length

  return (
    <div className={styles.page}>
      <PageHeader
        title="Clientes"
        subtitle={`${total} registro(s)`}
        action={<button className={styles.btnPrimary} onClick={openCreate}>+ Novo Cliente</button>}
      />

      <div className={cStyles.statsRow}>
        <button
          className={`${cStyles.statChip} ${filtroAtivo === 'todos' ? cStyles.statChipActive : ''}`}
          onClick={() => { setFiltroAtivo('todos'); setPage(1) }}
        >
          Todos <span className={cStyles.statNum}>{total}</span>
        </button>
        <button
          className={`${cStyles.statChip} ${cStyles.statChipGreen} ${filtroAtivo === 'ativos' ? cStyles.statChipActive : ''}`}
          onClick={() => { setFiltroAtivo('ativos'); setPage(1) }}
        >
          Ativos <span className={cStyles.statNum}>{totalAtivos}</span>
        </button>
        <button
          className={`${cStyles.statChip} ${cStyles.statChipRed} ${filtroAtivo === 'inativos' ? cStyles.statChipActive : ''}`}
          onClick={() => { setFiltroAtivo('inativos'); setPage(1) }}
        >
          Inativos <span className={cStyles.statNum}>{totalInativos}</span>
        </button>
      </div>

      <div className={styles.filters}>
        <input
          className={styles.search}
          placeholder="Buscar por nome, e-mail ou documento..."
          value={busca}
          onChange={e => { setBusca(e.target.value); setPage(1) }}
        />
        <select value={filtroTipo} onChange={e => { setFiltroTipo(e.target.value); setPage(1) }}>
          <option value="">Todos os tipos</option>
          <option value="pessoa-juridica">Pessoa Jurídica</option>
          <option value="pessoa-fisica">Pessoa Física</option>
        </select>
      </div>

      <Table
        columns={columns}
        rows={rows}
        loading={loading}
        empty="Nenhum cliente encontrado"
        onRowClick={r => setDetalhe(r)}
      />
      <Pagination page={page} total={total} limit={20} onChange={setPage} />

      {/* Painel de detalhe */}
      {detalhe && (
        <div className={cStyles.drawerOverlay} onClick={() => setDetalhe(null)}>
          <div className={cStyles.drawer} onClick={e => e.stopPropagation()}>
            <div className={cStyles.drawerHeader}>
              <div>
                <h3 className={cStyles.drawerNome}>{detalhe.nome}</h3>
                <Badge label={detalhe.ativo ? 'Ativo' : 'Inativo'} variant={detalhe.ativo ? 'success' : 'default'} />
              </div>
              <button className={cStyles.drawerClose} onClick={() => setDetalhe(null)}>✕</button>
            </div>
            <dl className={cStyles.drawerInfo}>
              <dt>E-mail</dt><dd>{detalhe.email}</dd>
              <dt>Documento</dt><dd>{detalhe.documento}</dd>
              <dt>Tipo</dt><dd>{detalhe.tipo === 'pessoa-juridica' ? 'Pessoa Jurídica' : 'Pessoa Física'}</dd>
              {detalhe.telefone && <><dt>Telefone</dt><dd>{detalhe.telefone}</dd></>}
            </dl>
            <div className={cStyles.drawerActions}>
              <button className={styles.btnPrimary} onClick={() => { openEdit(detalhe); setDetalhe(null) }}>
                Editar dados
              </button>
              <button
                className={detalhe.ativo ? cStyles.btnDesativar : cStyles.btnReativar}
                disabled={toggling === detalhe._id}
                onClick={e => { handleToggle(detalhe, e) }}
              >
                {toggling === detalhe._id ? 'Aguarde...' : detalhe.ativo ? 'Desativar cliente' : 'Reativar cliente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Editar Cliente' : 'Novo Cliente'} onClose={() => setShowModal(false)}>
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
              <label>Documento (CPF/CNPJ) *
                <input
                  value={form.documento}
                  onChange={e => update({ documento: e.target.value })}
                  placeholder="Somente números"
                  className={errs.documento ? styles.inputError : ''}
                />
                {errs.documento && <span className={styles.fieldError}>{errs.documento}</span>}
              </label>
              <label>Telefone
                <input value={form.telefone || ''} onChange={e => update({ telefone: e.target.value })} />
              </label>
              <label>Tipo *
                <select value={form.tipo} onChange={e => update({ tipo: e.target.value as Cliente['tipo'] })}>
                  <option value="pessoa-juridica">Pessoa Jurídica</option>
                  <option value="pessoa-fisica">Pessoa Física</option>
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
