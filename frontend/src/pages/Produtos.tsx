import { useEffect, useState, useCallback } from 'react'
import PageHeader from '../components/PageHeader'
import Table from '../components/Table'
import Badge from '../components/Badge'
import Pagination from '../components/Pagination'
import Modal from '../components/Modal'
import { produtos as api, tiny as tinyApi } from '../api'
import type { Produto, ProdutoPayload } from '../types'
import { required, positiveNumber, nonNegativeNumber, hasErrors, type FieldErrors } from '../utils/validate'
import styles from './Page.module.css'

const CATEGORIAS = [
  { value: 'SSL-DV',    label: 'SSL — DV' },
  { value: 'SSL-OV',    label: 'SSL — OV' },
  { value: 'SSL-EV',    label: 'SSL — EV' },
  { value: 'ICP-PF',    label: 'ICP-Brasil PF (e-CPF)' },
  { value: 'ICP-PJ',    label: 'ICP-Brasil PJ (e-CNPJ)' },
  { value: 'CODE-SIGN', label: 'Code Signing' },
  { value: 'EMAIL',     label: 'S/MIME (E-mail)' },
  { value: 'SAAS',      label: 'SaaS (GestaSports)' },
]

const CAT_VARIANT: Record<string, 'info' | 'success' | 'warning' | 'danger' | 'default' | 'purple'> = {
  'SSL-DV': 'info', 'SSL-OV': 'purple', 'SSL-EV': 'success',
  'ICP-PF': 'warning', 'ICP-PJ': 'warning', 'CODE-SIGN': 'danger',
  'EMAIL': 'default', 'SAAS': 'info',
}

const BLANK: ProdutoPayload = {
  codigo: '', nome: '', preco: 0, precoTabela: 0, estoque: 9999,
  ativo: true, categoria: '', fornecedor: '', descricao: '',
}

type Errs = FieldErrors<ProdutoPayload>
type FiltroAtivo = 'todos' | 'ativos' | 'inativos'

function validate(f: ProdutoPayload): Errs {
  return {
    codigo:  required(f.codigo, 'Código'),
    nome:    required(f.nome, 'Nome'),
    preco:   positiveNumber(f.preco, 'Preço de Venda'),
    estoque: nonNegativeNumber(f.estoque, 'Estoque'),
  }
}

function moeda(v: number) {
  if (!v) return <span style={{ color: '#94a3b8' }}>Sob contrato</span>
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function Produtos({ ativoFixo }: { ativoFixo?: 'ativos' | 'inativos' }) {
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [rows, setRows] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState<string[]>([])
  const [filtroAtivo, setFiltroAtivo] = useState<FiltroAtivo>(ativoFixo ?? 'todos')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Produto | null>(null)
  const [form, setForm] = useState<ProdutoPayload>(BLANK)
  const [errs, setErrs] = useState<Errs>({})
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toggling, setToggling] = useState<string | null>(null)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<Produto | null>(null)

  const ativoParam = filtroAtivo === 'ativos' ? 'true' : filtroAtivo === 'inativos' ? 'false' : undefined

  const load = useCallback(() => {
    setLoading(true)
    api.list({ page, busca, ativo: ativoParam })
      .then(res => { setRows(res.data); setTotal(res.total) })
      .finally(() => setLoading(false))
  }, [page, busca, ativoParam])

  useEffect(() => { load() }, [load])

  function toggle(arr: string[], val: string): string[] {
    if (!val) return []
    return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
  }

  const rowsFiltrados = filtroCategoria.length > 0 ? rows.filter(r => filtroCategoria.includes(r.categoria ?? '')) : rows

  function openCreate() { setEditing(null); setForm(BLANK); setErrs({}); setTouched(false); setShowModal(true) }
  function openEdit(p: Produto) {
    setEditing(p)
    setForm({
      codigo: p.codigo, nome: p.nome, descricao: p.descricao, categoria: p.categoria,
      fornecedor: p.fornecedor, preco: p.preco, precoTabela: p.precoTabela ?? 0,
      estoque: p.estoque, ativo: p.ativo,
    })
    setErrs({}); setTouched(false); setShowModal(true)
  }

  function update(patch: Partial<ProdutoPayload>) {
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

  async function handleToggle(p: Produto, e: React.MouseEvent) {
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

  async function handleSyncTiny(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setSyncingId(id)
    try {
      const r = await tinyApi.sincronizarProduto(id)
      alert(r.message)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao sincronizar')
    } finally { setSyncingId(null) }
  }

  const ativos = rows.filter(r => r.ativo).length
  const inativos = rows.filter(r => !r.ativo).length

  const columns = [
    {
      key: 'codigo', header: 'Código',
      render: (r: Produto) => (
        <code style={{ fontFamily: 'monospace', fontSize: '0.75rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap', opacity: r.ativo ? 1 : 0.45 }}>
          {r.codigo}
        </code>
      )
    },
    {
      key: 'nome', header: 'Produto',
      render: (r: Produto) => (
        <div className={!r.ativo ? styles.rowInativo : ''}>
          <strong style={{ fontSize: '0.875rem' }}>{r.nome}</strong>
          {!r.ativo && <span className={styles.tagInativo}>inativo</span>}
          {r.fornecedor && <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>{r.fornecedor}</div>}
        </div>
      )
    },
    {
      key: 'categoria', header: 'Categoria',
      render: (r: Produto) => r.categoria
        ? <Badge label={r.categoria} variant={CAT_VARIANT[r.categoria] ?? 'default'} />
        : <span style={{ color: '#94a3b8' }}>—</span>
    },
    { key: 'preco', header: 'Preço', render: (r: Produto) => <strong>{moeda(r.preco)}</strong> },
    { key: 'ativo', header: 'Status', render: (r: Produto) => <Badge label={r.ativo ? 'Ativo' : 'Inativo'} variant={r.ativo ? 'success' : 'default'} /> },
    {
      key: '_actions', header: '', width: '200px',
      render: (r: Produto) => (
        <div className={styles.rowActions}>
          <button className={styles.btnLink} onClick={e => { e.stopPropagation(); openEdit(r) }}>Editar</button>
          <button
            className={styles.btnLink}
            style={{ color: '#7c3aed' }}
            disabled={syncingId === r._id}
            title="Sincronizar com Tiny/Olist"
            onClick={e => handleSyncTiny(r._id, e)}
          >
            {syncingId === r._id ? '...' : '🔄'}
          </button>
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
        title={ativoFixo === 'ativos' ? 'Produtos Ativos' : ativoFixo === 'inativos' ? 'Produtos Inativos' : 'Produtos'}
        subtitle={`${total} registro(s)`}
        action={<button className={styles.btnPrimary} onClick={openCreate}>+ Novo Produto</button>}
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
        <input className={styles.search} placeholder="Buscar por nome ou código..." value={busca}
          onChange={e => { setBusca(e.target.value); setPage(1) }} />
        <div className={styles.chipRow}>
          {[{ value: '', label: 'Todas' }, ...CATEGORIAS].map(c => (
            <button key={c.value} className={`${styles.chip} ${c.value === '' ? filtroCategoria.length === 0 ? styles.chipActive : '' : filtroCategoria.includes(c.value) ? styles.chipActive : ''}`} onClick={() => setFiltroCategoria(toggle(filtroCategoria, c.value))}>{c.label}</button>
          ))}
        </div>
      </div>

      <Table columns={columns} rows={rowsFiltrados} loading={loading} empty="Nenhum produto encontrado" onRowClick={setDetalhe} />
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
              <dt>Código</dt><dd><code style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>{detalhe.codigo}</code></dd>
              {detalhe.categoria && <><dt>Categoria</dt><dd><Badge label={detalhe.categoria} variant={CAT_VARIANT[detalhe.categoria] ?? 'default'} /></dd></>}
              {detalhe.fornecedor && <><dt>Fornecedor</dt><dd>{detalhe.fornecedor}</dd></>}
              <dt>Preço</dt><dd><strong>{moeda(detalhe.preco)}</strong></dd>
              {!!detalhe.precoTabela && <><dt>Tabela</dt><dd>{moeda(detalhe.precoTabela)}</dd></>}
              <dt>Estoque</dt><dd>{detalhe.estoque}</dd>
              {detalhe.descricao && <><dt>Descrição</dt><dd style={{ fontSize: '0.8rem', color: '#475569' }}>{detalhe.descricao}</dd></>}
            </dl>
            <div className={styles.drawerFooter}>
              <button className={styles.btnPrimary} onClick={() => { openEdit(detalhe); setDetalhe(null) }}>Editar dados</button>
              <button
                className={detalhe.ativo ? styles.btnDesativar : styles.btnReativar}
                disabled={toggling === detalhe._id}
                onClick={e => handleToggle(detalhe, e)}
              >
                {toggling === detalhe._id ? 'Aguarde...' : detalhe.ativo ? 'Desativar produto' : 'Reativar produto'}
              </button>
            </div>
          </aside>
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Editar Produto' : 'Novo Produto'} onClose={() => setShowModal(false)} size="lg">
          <form onSubmit={handleSave} noValidate className={styles.form}>
            <div className={styles.formGrid2}>
              <label>Código *
                <input value={form.codigo} onChange={e => update({ codigo: e.target.value })} placeholder="Ex: SSL-DV-287" className={errs.codigo ? styles.inputError : ''} />
                {errs.codigo && <span className={styles.fieldError}>{errs.codigo}</span>}
              </label>
              <label>Categoria
                <select value={form.categoria || ''} onChange={e => update({ categoria: e.target.value })}>
                  <option value="">Selecione...</option>
                  {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </label>
              <label style={{ gridColumn: 'span 2' }}>Nome *
                <input value={form.nome} onChange={e => update({ nome: e.target.value })} className={errs.nome ? styles.inputError : ''} />
                {errs.nome && <span className={styles.fieldError}>{errs.nome}</span>}
              </label>
              <label>Fornecedor
                <input value={form.fornecedor || ''} onChange={e => update({ fornecedor: e.target.value })} placeholder="Ex: Sectigo, SERPRO..." />
              </label>
              <label>Preço de Venda *
                <input type="number" min="0" step="0.01" value={form.preco} onChange={e => update({ preco: Number(e.target.value) })} className={errs.preco ? styles.inputError : ''} />
                {errs.preco && <span className={styles.fieldError}>{errs.preco}</span>}
              </label>
              <label>Preço Tabela
                <input type="number" min="0" step="0.01" value={form.precoTabela ?? 0} onChange={e => update({ precoTabela: Number(e.target.value) })} />
              </label>
              <label>Estoque *
                <input type="number" min="0" value={form.estoque} onChange={e => update({ estoque: Number(e.target.value) })} className={errs.estoque ? styles.inputError : ''} />
                {errs.estoque && <span className={styles.fieldError}>{errs.estoque}</span>}
              </label>
              <label style={{ gridColumn: 'span 2' }}>Descrição
                <textarea value={form.descricao || ''} onChange={e => update({ descricao: e.target.value })} rows={3} />
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
