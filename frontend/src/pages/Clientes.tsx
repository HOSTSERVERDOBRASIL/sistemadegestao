import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Table from '../components/Table'
import Badge from '../components/Badge'
import Pagination from '../components/Pagination'
import Modal from '../components/Modal'
import { clientes as api } from '../api'
import type { Cliente, ClientePayload } from '../types'
import { email as validateEmail, documento as validateDoc, required, hasErrors, type FieldErrors } from '../utils/validate'
import { fmtDate, fmtDateTime } from '../utils/fmt'
import styles from './Page.module.css'

const BLANK: ClientePayload = { nome: '', email: '', documento: '', tipo: 'pessoa-juridica', esferaPublica: false, ativo: true }

type Errs = FieldErrors<ClientePayload>
type MasterForm = { nome: string; email: string; password: string }

const BLANK_MASTER: MasterForm = { nome: '', email: '', password: '' }

function validate(f: ClientePayload): Errs {
  return {
    nome:      required(f.nome, 'Nome'),
    email:     validateEmail(f.email),
    documento: validateDoc(f.documento),
  }
}

type FiltroAtivo = 'todos' | 'ativos' | 'inativos'

export default function Clientes() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [rows, setRows] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<string[]>([])
  const [filtroAtivo, setFiltroAtivo] = useState<FiltroAtivo>('todos')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Cliente | null>(null)
  const [form, setForm] = useState<ClientePayload>(BLANK)
  const [masterForm, setMasterForm] = useState<MasterForm>(BLANK_MASTER)
  const [errs, setErrs] = useState<Errs>({})
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toggling, setToggling] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<Cliente | null>(null)
  const [consultandoDocumento, setConsultandoDocumento] = useState(false)
  const [revalidando, setRevalidando] = useState(false)

  const ativoParam = filtroAtivo === 'ativos' ? 'true' : filtroAtivo === 'inativos' ? 'false' : undefined

  function toggle(arr: string[], val: string): string[] {
    if (!val) return []
    return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
  }

  const load = useCallback(() => {
    setLoading(true)
    api.list({ page, busca, tipo: filtroTipo.length > 0 ? filtroTipo.join(',') : undefined, ativo: ativoParam })
      .then(res => { setRows(res.data); setTotal(res.total) })
      .finally(() => setLoading(false))
  }, [page, busca, filtroTipo, ativoParam])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditing(null)
    setForm(BLANK)
    setMasterForm(BLANK_MASTER)
    setErrs({})
    setTouched(false)
    setError('')
    setShowModal(true)
  }
  function openEdit(c: Cliente) {
    setEditing(c)
    setForm({ nome: c.nome, email: c.email, documento: c.documento, tipo: c.tipo, telefone: c.telefone, esferaPublica: c.esferaPublica, ativo: c.ativo })
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
    const v = validate(form)
    setErrs(v)
    if (hasErrors(v)) return
    if (!editing && (!masterForm.nome.trim() || !masterForm.email.trim())) {
      setError('Preencha o nome e o e-mail do usuário master')
      return
    }
    if (!editing && masterForm.password.length < 6) {
      setError('A senha inicial do usuário master deve ter ao menos 6 caracteres')
      return
    }
    setSaving(true); setError('')
    try {
      if (editing) await api.update(editing._id, form)
      else await api.onboard({ cliente: form, usuarioMaster: masterForm })
      setShowModal(false); load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  async function handleToggle(c: Cliente, e: React.MouseEvent) {
    e.stopPropagation()
    const novo = !c.ativo
    if (!confirm(`${novo ? 'Reativar' : 'Desativar'} "${c.nome}"?`)) return
    setToggling(c._id)
    try {
      const updated = await api.toggleAtivo(c._id, novo)
      setRows(prev => prev.map(r => r._id === c._id ? updated : r))
      if (detalhe?._id === c._id) setDetalhe(updated)
    } catch { load() }
    finally { setToggling(null) }
  }

  async function handleConsultarDocumento() {
    const documento = form.documento.replace(/\D/g, '')
    if (![11, 14].includes(documento.length)) {
      setError('Informe um CPF ou CNPJ válido antes da consulta.')
      return
    }
    setConsultandoDocumento(true); setError('')
    try {
      const cadastro = await api.consultarDocumento(documento)
      update({
        nome: cadastro.nome || form.nome,
        tipo: documento.length === 14 ? 'pessoa-juridica' : 'pessoa-fisica',
        esferaPublica: cadastro.esferaPublica ?? form.esferaPublica,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível consultar o documento')
    } finally { setConsultandoDocumento(false) }
  }

  async function handleRevalidar(cliente: Cliente) {
    setRevalidando(true)
    try {
      const atualizado = await api.revalidarCadastro(cliente._id)
      setDetalhe(atualizado)
      setRows(prev => prev.map(item => item._id === atualizado._id ? atualizado : item))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Não foi possível revalidar o cadastro')
    } finally { setRevalidando(false) }
  }

  async function handleLgpd(cliente: Cliente) {
    const tipo = prompt('Tipo da solicitação: Acesso, Correcao, Exclusao ou Portabilidade', 'Acesso')?.trim() as 'Acesso' | 'Correcao' | 'Exclusao' | 'Portabilidade' | undefined
    if (!tipo) return
    const motivo = prompt('Motivo ou observação da solicitação (opcional):', '')?.trim()
    try {
      const atualizado = await api.registrarLgpd(cliente._id, { tipo, motivo: motivo || undefined })
      setDetalhe(atualizado)
      setRows(prev => prev.map(item => item._id === atualizado._id ? atualizado : item))
    } catch (err) { alert(err instanceof Error ? err.message : 'Não foi possível registrar a solicitação LGPD') }
  }

  const ativos = rows.filter(r => r.ativo).length
  const inativos = rows.filter(r => !r.ativo).length

  const columns = [
    {
      key: 'nome', header: 'Nome',
      render: (r: Cliente) => (
        <span className={!r.ativo ? styles.rowInativo : ''}>
          <strong>{r.nome}</strong>
          {!r.ativo && <span className={styles.tagInativo}>inativo</span>}
        </span>
      )
    },
    { key: 'email', header: 'E-mail', render: (r: Cliente) => <span className={!r.ativo ? styles.rowInativo : ''}>{r.email}</span> },
    { key: 'documento', header: 'Documento', render: (r: Cliente) => <span className={!r.ativo ? styles.rowInativo : ''}>{r.documento}</span> },
    { key: 'tipo', header: 'Tipo', render: (r: Cliente) => <Badge label={r.tipo === 'pessoa-juridica' ? 'PJ' : 'PF'} variant="default" /> },
    {
      key: 'esferaPublica', header: 'Esfera',
      render: (r: Cliente) => r.esferaPublica
        ? <Badge label="Pública" variant="warning" />
        : <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>—</span>
    },
    { key: 'ativo', header: 'Status', render: (r: Cliente) => <Badge label={r.ativo ? 'Ativo' : 'Inativo'} variant={r.ativo ? 'success' : 'default'} /> },
    {
      key: '_actions', header: '', width: '170px',
      render: (r: Cliente) => (
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
        title="Clientes"
        subtitle={`${total} registro(s)`}
        action={<button className={styles.btnPrimary} onClick={openCreate}>+ Novo Cliente</button>}
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
        <div className={styles.chipRow}>
          {[{ v: '', l: 'Todos os tipos' }, { v: 'pessoa-juridica', l: 'Pessoa Jurídica' }, { v: 'pessoa-fisica', l: 'Pessoa Física' }].map(({ v, l }) => (
            <button key={v} className={`${styles.chip} ${v === '' ? filtroTipo.length === 0 ? styles.chipActive : '' : filtroTipo.includes(v) ? styles.chipActive : ''}`} onClick={() => { setFiltroTipo(toggle(filtroTipo, v)); setPage(1) }}>{l}</button>
          ))}
        </div>
      </div>

      <Table
        columns={columns}
        rows={rows}
        loading={loading}
        empty="Nenhum cliente encontrado"
        onRowClick={cliente => navigate(`/clientes/${cliente._id}`)}
      />
      <Pagination page={page} total={total} limit={20} onChange={setPage} />

      {/* Drawer de detalhe */}
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
              <dt>Tipo</dt><dd>{detalhe.tipo === 'pessoa-juridica' ? 'Pessoa Jurídica' : 'Pessoa Física'}</dd>
              {detalhe.telefone && <><dt>Telefone</dt><dd>{detalhe.telefone}</dd></>}
              <dt>Esfera Pública</dt>
              <dd>{detalhe.esferaPublica
                ? <Badge label="Esfera Pública" variant="warning" />
                : <span style={{ color: '#94a3b8' }}>Privada / não classificada</span>
              }</dd>
              {detalhe.situacaoCadastral && <><dt>Situação Serpro</dt><dd><Badge label={detalhe.situacaoCadastral} variant={detalhe.situacaoCadastral.toUpperCase() === 'ATIVA' ? 'success' : 'warning'} /></dd></>}
              {detalhe.naturezaJuridicaDescricao && <><dt>Natureza jurídica</dt><dd>{detalhe.naturezaJuridicaCodigo} — {detalhe.naturezaJuridicaDescricao}</dd></>}
              {detalhe.esferaPublicaRevisao && <><dt>Classificação</dt><dd><Badge label="Revisão manual" variant="warning" /></dd></>}
              {detalhe.validadoSerproEm && <><dt>Última validação</dt><dd>{fmtDateTime(detalhe.validadoSerproEm)}</dd></>}
              {(detalhe.solicitacoesLgpd?.length ?? 0) > 0 && <><dt>LGPD</dt><dd>{detalhe.solicitacoesLgpd!.slice(-3).reverse().map(item => <div key={item._id} style={{ marginBottom: 5 }}><Badge label={`${item.tipo}: ${item.status}`} variant={item.status === 'Atendida' ? 'success' : 'warning'} /><br /><small>{fmtDate(item.solicitadaEm)}</small></div>)}</dd></>}
            </dl>
            <div className={styles.drawerFooter}>
              <button className={styles.btnPrimary} onClick={() => { openEdit(detalhe); setDetalhe(null) }}>Editar dados</button>
              {detalhe.tipo === 'pessoa-juridica' && <button className={styles.btnSecondary} onClick={() => handleRevalidar(detalhe)} disabled={revalidando}>{revalidando ? 'Consultando...' : 'Revalidar Serpro'}</button>}
              <button className={styles.btnSecondary} onClick={() => handleLgpd(detalhe)}>Registrar LGPD</button>
              <button
                className={detalhe.ativo ? styles.btnDesativar : styles.btnReativar}
                disabled={toggling === detalhe._id}
                onClick={e => handleToggle(detalhe, e)}
              >
                {toggling === detalhe._id ? 'Aguarde...' : detalhe.ativo ? 'Desativar cliente' : 'Reativar cliente'}
              </button>
            </div>
          </aside>
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Editar Cliente' : 'Novo Cliente e Usuário Master'} onClose={() => setShowModal(false)} size="lg">
          <form onSubmit={handleSave} noValidate className={styles.form}>
            <div className={styles.formGrid2}>
              <label>Nome *
                <input value={form.nome} onChange={e => update({ nome: e.target.value })} className={errs.nome ? styles.inputError : ''} />
                {errs.nome && <span className={styles.fieldError}>{errs.nome}</span>}
              </label>
              <label>E-mail *
                <input type="email" value={form.email} onChange={e => update({ email: e.target.value })} className={errs.email ? styles.inputError : ''} />
                {errs.email && <span className={styles.fieldError}>{errs.email}</span>}
              </label>
              <label>Documento (CPF/CNPJ) *
                <input value={form.documento} onChange={e => update({ documento: e.target.value })} placeholder="Somente números" className={errs.documento ? styles.inputError : ''} />
                {errs.documento && <span className={styles.fieldError}>{errs.documento}</span>}
                <button type="button" className={styles.btnSecondary} onClick={handleConsultarDocumento} disabled={consultandoDocumento} style={{ marginTop: 6 }}>
                  {consultandoDocumento ? 'Consultando...' : 'Consultar cadastro oficial'}
                </button>
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
              <label style={{ gridColumn: 'span 2' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  <input
                    type="checkbox"
                    id="esferaPublica"
                    checked={!!form.esferaPublica}
                    onChange={e => update({ esferaPublica: e.target.checked })}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                  <span style={{ fontWeight: 500 }}>Esfera Pública</span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    (Lei 4.320/64 — exige empenho nos pedidos)
                  </span>
                </div>
              </label>
            </div>
            {!editing && (
              <>
                <div className={styles.formDivider}>
                  <strong>Usuário master</strong>
                  <span>Primeiro acesso administrativo do cliente</span>
                </div>
                <div className={styles.formGrid2}>
                  <label>Nome do responsável *
                    <input
                      value={masterForm.nome}
                      onChange={e => setMasterForm(prev => ({ ...prev, nome: e.target.value }))}
                      autoComplete="name"
                    />
                  </label>
                  <label>E-mail de acesso *
                    <input
                      type="email"
                      value={masterForm.email}
                      onChange={e => setMasterForm(prev => ({ ...prev, email: e.target.value }))}
                      autoComplete="email"
                    />
                  </label>
                  <label>Senha inicial *
                    <input
                      type="password"
                      value={masterForm.password}
                      onChange={e => setMasterForm(prev => ({ ...prev, password: e.target.value }))}
                      minLength={6}
                      autoComplete="new-password"
                    />
                    <span className={styles.fieldHint}>Mínimo de 6 caracteres; deverá ser alterada no primeiro acesso.</span>
                  </label>
                </div>
              </>
            )}
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
