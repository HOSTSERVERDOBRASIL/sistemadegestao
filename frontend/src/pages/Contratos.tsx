import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Table from '../components/Table'
import Badge from '../components/Badge'
import Pagination from '../components/Pagination'
import Modal from '../components/Modal'
import { contratos as api, clientes as clientesApi } from '../api'
import type { Contrato, ContratoPayload, Cliente, ModalidadeContrato } from '../types'
import { required, positiveNumber, selectRequired, dateRange, hasErrors, type FieldErrors } from '../utils/validate'
import styles from './Page.module.css'

const BLANK: ContratoPayload = {
  numero: '', clienteId: '', valorTotal: 0, modalidade: 'Parcial',
  dataInicio: '', dataFim: ''
}

type Errs = FieldErrors<ContratoPayload> & { dataRange?: string }

function validate(f: ContratoPayload): Errs {
  return {
    numero:     required(f.numero, 'Número'),
    clienteId:  selectRequired(f.clienteId, 'Cliente'),
    valorTotal: positiveNumber(f.valorTotal, 'Valor Total'),
    dataInicio: required(f.dataInicio, 'Data Início'),
    dataFim:    required(f.dataFim, 'Data Fim'),
    dataRange:  dateRange(f.dataInicio, f.dataFim),
  }
}

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function totalComAditivos(contrato: Contrato) {
  return contrato.valorTotal + (contrato.aditivos ?? []).reduce((total, aditivo) => total + aditivo.valor, 0)
}

function toDateInput(d: string) {
  return d ? d.slice(0, 10) : ''
}

export default function Contratos() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [rows, setRows] = useState<Contrato[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroModalidade, setFiltroModalidade] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Contrato | null>(null)
  const [form, setForm] = useState<ContratoPayload>(BLANK)
  const [errs, setErrs] = useState<Errs>({})
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [clientesList, setClientesList] = useState<Cliente[]>([])

  const load = useCallback(() => {
    setLoading(true)
    api.list({ page, busca, modalidade: filtroModalidade })
      .then(res => { setRows(res.data); setTotal(res.total) })
      .finally(() => setLoading(false))
  }, [page, busca, filtroModalidade])

  useEffect(() => { load() }, [load])

  async function loadClientes() {
    if (clientesList.length === 0) {
      const res = await clientesApi.list({ limit: 100 })
      setClientesList(res.data)
    }
  }

  async function openCreate() {
    setEditing(null); setForm(BLANK); setErrs({}); setTouched(false)
    await loadClientes()
    setShowModal(true)
  }

  async function openEdit(c: Contrato) {
    setEditing(c)
    setForm({
      numero: c.numero,
      clienteId: typeof c.clienteId === 'object' ? c.clienteId._id : c.clienteId,
      valorTotal: c.valorTotal,
      modalidade: c.modalidade,
      dataInicio: toDateInput(c.dataInicio),
      dataFim: toDateInput(c.dataFim),
    })
    setErrs({}); setTouched(false)
    await loadClientes()
    setShowModal(true)
  }

  function update(patch: Partial<ContratoPayload>) {
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
    if (!confirm('Encerrar este contrato?')) return
    await api.remove(id).catch(() => {})
    load()
  }

  const columns = [
    { key: 'numero', header: 'Número', render: (r: Contrato) => <strong>{r.numero}</strong> },
    {
      key: 'clienteId', header: 'Cliente',
      render: (r: Contrato) => typeof r.clienteId === 'object' ? r.clienteId.nome : r.clienteId
    },
    { key: 'valorTotal', header: 'Valor c/ aditivos', render: (r: Contrato) => moeda(totalComAditivos(r)) },
    {
      key: 'saldo', header: 'Saldo',
      render: (r: Contrato) => {
        const saldo = totalComAditivos(r) - r.valorFaturado
        return <span style={{ color: saldo > 0 ? '#15803d' : '#64748b', fontWeight: 600 }}>{moeda(saldo)}</span>
      }
    },
    { key: 'modalidade', header: 'Modalidade', render: (r: Contrato) => <Badge label={r.modalidade} variant="info" /> },
    { key: 'ativo', header: 'Status', render: (r: Contrato) => <Badge label={r.ativo ? 'Ativo' : 'Encerrado'} variant={r.ativo ? 'success' : 'default'} /> },
    {
      key: '_actions', header: '', width: '140px',
      render: (r: Contrato) => (
        <div className={styles.rowActions}>
          <button className={styles.btnLink} onClick={e => { e.stopPropagation(); openEdit(r) }}>Editar</button>
          <button className={styles.btnDanger} onClick={e => { e.stopPropagation(); handleDelete(r._id) }}>✕</button>
        </div>
      )
    },
  ]

  return (
    <div className={styles.page}>
      <PageHeader title="Contratos" subtitle={`${total} registro(s)`}
        action={<button className={styles.btnPrimary} onClick={openCreate}>+ Novo Contrato</button>}
      />
      <div className={styles.filters}>
        <input className={styles.search} placeholder="Buscar por número..." value={busca}
          onChange={e => { setBusca(e.target.value); setPage(1) }} />
        <select value={filtroModalidade} onChange={e => { setFiltroModalidade(e.target.value); setPage(1) }}>
          <option value="">Todas as modalidades</option>
          {['Total', 'Parcial', 'Por Ordem de Fornecimento'].map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <Table
        columns={columns}
        rows={rows}
        loading={loading}
        onRowClick={(r) => navigate(`/contratos/${(r as Contrato)._id}`)}
        empty="Nenhum contrato encontrado"
      />
      <Pagination page={page} total={total} limit={20} onChange={setPage} />

      {showModal && (
        <Modal title={editing ? 'Editar Contrato' : 'Novo Contrato'} onClose={() => setShowModal(false)} size="lg">
          <form onSubmit={handleSave} noValidate className={styles.form}>
            <div className={styles.formGrid2}>
              <label>Número *
                <input
                  value={form.numero}
                  onChange={e => update({ numero: e.target.value })}
                  className={errs.numero ? styles.inputError : ''}
                />
                {errs.numero && <span className={styles.fieldError}>{errs.numero}</span>}
              </label>
              <label>Modalidade *
                <select value={form.modalidade} onChange={e => update({ modalidade: e.target.value as ModalidadeContrato })}>
                  <option value="Total">Total</option>
                  <option value="Parcial">Parcial</option>
                  <option value="Por Ordem de Fornecimento">Por Ordem de Fornecimento</option>
                </select>
              </label>
              <label>Cliente *
                <select
                  value={form.clienteId}
                  onChange={e => update({ clienteId: e.target.value })}
                  className={errs.clienteId ? styles.inputError : ''}
                >
                  <option value="">Selecione...</option>
                  {clientesList.map(c => <option key={c._id} value={c._id}>{c.nome}</option>)}
                </select>
                {errs.clienteId && <span className={styles.fieldError}>{errs.clienteId}</span>}
              </label>
              <label>Valor Total *
                <input
                  type="number" min="0" step="0.01"
                  value={form.valorTotal}
                  onChange={e => update({ valorTotal: Number(e.target.value) })}
                  className={errs.valorTotal ? styles.inputError : ''}
                />
                {errs.valorTotal && <span className={styles.fieldError}>{errs.valorTotal}</span>}
              </label>
              <label>Data Início *
                <input
                  type="date"
                  value={form.dataInicio}
                  onChange={e => update({ dataInicio: e.target.value })}
                  className={errs.dataInicio ? styles.inputError : ''}
                />
                {errs.dataInicio && <span className={styles.fieldError}>{errs.dataInicio}</span>}
              </label>
              <label>Data Fim *
                <input
                  type="date"
                  value={form.dataFim}
                  onChange={e => update({ dataFim: e.target.value })}
                  className={(errs.dataFim || errs.dataRange) ? styles.inputError : ''}
                />
                {errs.dataFim && <span className={styles.fieldError}>{errs.dataFim}</span>}
                {errs.dataRange && <span className={styles.fieldError}>{errs.dataRange}</span>}
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
