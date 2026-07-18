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
  { value: 'SSL-DV',     label: 'SSL — DV' },
  { value: 'SSL-OV',     label: 'SSL — OV' },
  { value: 'SSL-EV',     label: 'SSL — EV' },
  { value: 'ICP-PF',     label: 'ICP-Brasil PF (e-CPF)' },
  { value: 'ICP-PJ',     label: 'ICP-Brasil PJ (e-CNPJ)' },
  { value: 'CODE-SIGN',  label: 'Code Signing' },
  { value: 'EMAIL',      label: 'S/MIME (E-mail)' },
  { value: 'SAAS',       label: 'SaaS (GestaSports)' },
]

const CATEGORIA_VARIANT: Record<string, string> = {
  'SSL-DV':    'info',
  'SSL-OV':    'purple',
  'SSL-EV':    'success',
  'ICP-PF':    'warning',
  'ICP-PJ':    'warning',
  'CODE-SIGN': 'danger',
  'EMAIL':     'default',
  'SAAS':      'info',
}

const BLANK: ProdutoPayload = {
  codigo: '', nome: '', preco: 0, precoTabela: 0, estoque: 9999,
  ativo: true, categoria: '', fornecedor: '', descricao: '',
}

type Errs = FieldErrors<ProdutoPayload>

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

export default function Produtos() {
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [rows, setRows] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Produto | null>(null)
  const [form, setForm] = useState<ProdutoPayload>(BLANK)
  const [errs, setErrs] = useState<Errs>({})
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [syncingId, setSyncingId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    api.list({ page, busca }).then(res => { setRows(res.data); setTotal(res.total) }).finally(() => setLoading(false))
  }, [page, busca])

  useEffect(() => { load() }, [load])

  const rowsFiltrados = filtroCategoria ? rows.filter(r => r.categoria === filtroCategoria) : rows

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
    if (!confirm('Desativar este produto?')) return
    await api.remove(id).catch(() => {})
    load()
  }

  async function handleSyncTiny(id: string) {
    setSyncingId(id)
    try {
      const r = await tinyApi.sincronizarProduto(id)
      alert(r.message)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao sincronizar')
    } finally { setSyncingId(null) }
  }

  const columns = [
    {
      key: 'codigo', header: 'Código',
      render: (r: Produto) => (
        <code style={{ fontFamily: 'monospace', fontSize: '0.75rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
          {r.codigo}
        </code>
      )
    },
    {
      key: 'nome', header: 'Produto',
      render: (r: Produto) => (
        <div>
          <strong style={{ fontSize: '0.875rem' }}>{r.nome}</strong>
          {r.fornecedor && <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>{r.fornecedor}</div>}
        </div>
      )
    },
    {
      key: 'categoria', header: 'Categoria',
      render: (r: Produto) => r.categoria
        ? <Badge label={r.categoria} variant={(CATEGORIA_VARIANT[r.categoria] ?? 'default') as 'info' | 'success' | 'warning' | 'danger' | 'default'} />
        : <span style={{ color: '#94a3b8' }}>—</span>
    },
    { key: 'preco', header: 'Preço', render: (r: Produto) => <strong>{moeda(r.preco)}</strong> },
    {
      key: 'precoTabela', header: 'Tabela',
      render: (r: Produto) => r.precoTabela ? (
        <span style={{ color: '#94a3b8', fontSize: '0.82rem', textDecoration: r.preco > 0 && r.preco < (r.precoTabela ?? 0) ? 'line-through' : 'none' }}>
          {moeda(r.precoTabela)}
        </span>
      ) : null
    },
    { key: 'ativo', header: 'Status', render: (r: Produto) => <Badge label={r.ativo ? 'Ativo' : 'Inativo'} variant={r.ativo ? 'success' : 'default'} /> },
    {
      key: '_actions', header: '',
      render: (r: Produto) => (
        <div className={styles.rowActions}>
          <button className={styles.btnLink} onClick={e => { e.stopPropagation(); openEdit(r) }}>Editar</button>
          <button
            className={styles.btnLink}
            style={{ color: '#7c3aed' }}
            onClick={e => { e.stopPropagation(); handleSyncTiny(r._id) }}
            disabled={syncingId === r._id}
            title="Sincronizar com Tiny/Olist"
          >
            {syncingId === r._id ? '...' : '🔄'}
          </button>
          <button className={styles.btnDanger} onClick={e => { e.stopPropagation(); handleDelete(r._id) }}>✕</button>
        </div>
      )
    },
  ]

  return (
    <div className={styles.page}>
      <PageHeader
        title="Produtos"
        subtitle={`${total} registro(s) — ${rowsFiltrados.length} exibidos`}
        action={<button className={styles.btnPrimary} onClick={openCreate}>+ Novo Produto</button>}
      />
      <div className={styles.filters}>
        <input
          className={styles.search}
          placeholder="Buscar por nome ou código..."
          value={busca}
          onChange={e => { setBusca(e.target.value); setPage(1) }}
        />
        <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)}>
          <option value="">Todas as categorias</option>
          {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      <Table columns={columns} rows={rowsFiltrados} loading={loading} empty="Nenhum produto encontrado" />
      <Pagination page={page} total={total} limit={20} onChange={setPage} />

      {showModal && (
        <Modal title={editing ? 'Editar Produto' : 'Novo Produto'} onClose={() => setShowModal(false)} size="lg">
          <form onSubmit={handleSave} noValidate className={styles.form}>
            <div className={styles.formGrid2}>
              <label>Código *
                <input
                  value={form.codigo}
                  onChange={e => update({ codigo: e.target.value })}
                  placeholder="Ex: SSL-DV-287"
                  className={errs.codigo ? styles.inputError : ''}
                />
                {errs.codigo && <span className={styles.fieldError}>{errs.codigo}</span>}
              </label>
              <label>Categoria
                <select value={form.categoria || ''} onChange={e => update({ categoria: e.target.value })}>
                  <option value="">Selecione...</option>
                  {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </label>
              <label style={{ gridColumn: 'span 2' }}>Nome *
                <input
                  value={form.nome}
                  onChange={e => update({ nome: e.target.value })}
                  className={errs.nome ? styles.inputError : ''}
                />
                {errs.nome && <span className={styles.fieldError}>{errs.nome}</span>}
              </label>
              <label>Fornecedor
                <input value={form.fornecedor || ''} onChange={e => update({ fornecedor: e.target.value })} placeholder="Ex: Sectigo, SERPRO..." />
              </label>
              <label>Preço de Venda *
                <input
                  type="number" min="0" step="0.01"
                  value={form.preco}
                  onChange={e => update({ preco: Number(e.target.value) })}
                  className={errs.preco ? styles.inputError : ''}
                />
                {errs.preco && <span className={styles.fieldError}>{errs.preco}</span>}
              </label>
              <label>Preço Tabela
                <input type="number" min="0" step="0.01" value={form.precoTabela ?? 0} onChange={e => update({ precoTabela: Number(e.target.value) })} />
              </label>
              <label>Estoque *
                <input
                  type="number" min="0"
                  value={form.estoque}
                  onChange={e => update({ estoque: Number(e.target.value) })}
                  className={errs.estoque ? styles.inputError : ''}
                />
                {errs.estoque && <span className={styles.fieldError}>{errs.estoque}</span>}
              </label>
              <label style={{ gridColumn: 'span 2' }}>Descrição
                <textarea
                  value={form.descricao || ''}
                  onChange={e => update({ descricao: e.target.value })}
                  rows={3}
                  style={{ resize: 'vertical' }}
                />
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
