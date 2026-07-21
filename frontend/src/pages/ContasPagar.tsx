import { useEffect, useState, useCallback } from 'react'
import PageHeader from '../components/PageHeader'
import Table from '../components/Table'
import Badge from '../components/Badge'
import Pagination from '../components/Pagination'
import Modal from '../components/Modal'
import { fmtDate, fmtCurrency } from '../utils/fmt'
import styles from './Page.module.css'

interface ContaPagar {
  _id: string
  descricao: string
  tipo: string
  fornecedor?: string
  valor: number
  valorPago: number
  dataVencimento: string
  dataPagamento?: string
  status: string
  recorrencia: string
  centroCusto?: string
  observacoes?: string
  criadorNome?: string
}

interface Kpis {
  totalPendente: number
  vencidas: number
  pagasMes: number
}

const STATUS_LIST = ['Pendente', 'Aprovada', 'Vencida', 'Paga', 'Cancelada']

const CENTRO_CUSTO_OPTIONS = [
  'administrativo', 'comercial', 'icp-brasil', 'ssl', 'dev',
  'infra', 'suporte', 'operacao', 'marketing', 'diretoria',
]

const TIPO_OPTIONS = [
  'Fornecedor', 'Aluguel', 'Software', 'Serviço', 'Imposto', 'Folha',
  'Comissão', 'Infraestrutura', 'Marketing', 'Outros',
]

const RECORRENCIA_OPTIONS = ['Única', 'Mensal', 'Trimestral', 'Semestral', 'Anual']

function authHeader() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` }
}

function statusVariant(s: string): 'warning' | 'info' | 'success' | 'danger' | 'default' {
  if (s === 'Pendente' || s === 'Parcialmente Paga') return 'warning'
  if (s === 'Aprovada') return 'info'
  if (s === 'Paga') return 'success'
  if (s === 'Vencida') return 'danger'
  return 'default'
}

function isVencida(conta: ContaPagar): boolean {
  if (conta.status === 'Paga' || conta.status === 'Cancelada') return false
  return conta.dataVencimento < new Date().toISOString().slice(0, 10)
}

const emptyNova = {
  descricao: '',
  tipo: '',
  fornecedor: '',
  valor: '',
  dataVencimento: '',
  recorrencia: 'Única',
  centroCusto: '',
  observacoes: '',
}

const emptyPagar = {
  dataPagamento: new Date().toISOString().slice(0, 10),
  valorPago: '',
}

export default function ContasPagar() {
  const [rows, setRows] = useState<ContaPagar[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState<Kpis | null>(null)

  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<string[]>([])
  const [vencendo, setVencendo] = useState(false)

  const [showNova, setShowNova] = useState(false)
  const [novaForm, setNovaForm] = useState(emptyNova)
  const [novaSaving, setNovaSaving] = useState(false)
  const [novaError, setNovaError] = useState('')

  const [showPagar, setShowPagar] = useState(false)
  const [pagarConta, setPagarConta] = useState<ContaPagar | null>(null)
  const [pagarForm, setPagarForm] = useState(emptyPagar)
  const [pagarSaving, setPagarSaving] = useState(false)
  const [pagarError, setPagarError] = useState('')

  const [aprovando, setAprovando] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      if (busca) params.set('busca', busca)
      if (filtroStatus.length > 0) params.set('status', filtroStatus.join(','))
      if (vencendo) params.set('vencendo', 'true')

      const res = await fetch(`/api/contas-pagar?${params}`, { headers: authHeader() })
      if (!res.ok) throw new Error('Erro ao carregar contas')
      const data = await res.json()
      setRows(data.data ?? [])
      setTotal(data.total ?? 0)
      if (data.kpis) setKpis(data.kpis)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [page, busca, filtroStatus, vencendo])

  useEffect(() => { load() }, [load])

  function toggleStatus(s: string) {
    setFiltroStatus(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
    setPage(1)
  }

  async function handleAprovar(conta: ContaPagar) {
    setAprovando(conta._id)
    try {
      const res = await fetch(`/api/contas-pagar/${conta._id}/aprovar`, {
        method: 'PATCH',
        headers: authHeader(),
      })
      if (!res.ok) throw new Error('Erro ao aprovar')
      await load()
    } catch {
      // silent
    } finally {
      setAprovando(null)
    }
  }

  async function handlePagar(e: React.FormEvent) {
    e.preventDefault()
    if (!pagarConta) return
    const valorPago = parseFloat(pagarForm.valorPago.replace(',', '.'))
    if (!pagarForm.dataPagamento) return setPagarError('Data de pagamento é obrigatória')
    if (isNaN(valorPago) || valorPago <= 0) return setPagarError('Valor pago deve ser maior que zero')
    setPagarSaving(true)
    setPagarError('')
    try {
      const res = await fetch(`/api/contas-pagar/${pagarConta._id}/pagar`, {
        method: 'PATCH',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataPagamento: pagarForm.dataPagamento, valorPago }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.message ?? 'Erro ao registrar pagamento')
      }
      setShowPagar(false)
      setPagarConta(null)
      setPagarForm(emptyPagar)
      await load()
    } catch (err) {
      setPagarError(err instanceof Error ? err.message : 'Erro ao registrar pagamento')
    } finally {
      setPagarSaving(false)
    }
  }

  async function handleNovaConta(e: React.FormEvent) {
    e.preventDefault()
    setNovaError('')
    const valor = parseFloat(novaForm.valor.replace(',', '.'))
    if (!novaForm.descricao.trim()) return setNovaError('Descrição é obrigatória')
    if (!novaForm.tipo) return setNovaError('Tipo é obrigatório')
    if (isNaN(valor) || valor <= 0) return setNovaError('Valor deve ser maior que zero')
    if (!novaForm.dataVencimento) return setNovaError('Data de vencimento é obrigatória')
    setNovaSaving(true)
    try {
      const res = await fetch('/api/contas-pagar', {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descricao: novaForm.descricao.trim(),
          tipo: novaForm.tipo,
          fornecedor: novaForm.fornecedor.trim() || undefined,
          valor,
          dataVencimento: novaForm.dataVencimento,
          recorrencia: novaForm.recorrencia,
          centroCusto: novaForm.centroCusto || undefined,
          observacoes: novaForm.observacoes.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.message ?? 'Erro ao criar conta')
      }
      setShowNova(false)
      setNovaForm(emptyNova)
      await load()
    } catch (err) {
      setNovaError(err instanceof Error ? err.message : 'Erro ao criar conta')
    } finally {
      setNovaSaving(false)
    }
  }

  const columns = [
    {
      key: 'descricao', header: 'Descrição',
      render: (r: ContaPagar) => (
        <div>
          <strong style={{ fontSize: '0.875rem' }}>{r.descricao}</strong>
          {r.criadorNome && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{r.criadorNome}</div>
          )}
        </div>
      ),
    },
    {
      key: 'tipo', header: 'Tipo',
      render: (r: ContaPagar) => <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{r.tipo}</span>,
    },
    {
      key: 'fornecedor', header: 'Fornecedor',
      render: (r: ContaPagar) => r.fornecedor
        ? <span style={{ fontSize: '0.85rem' }}>{r.fornecedor}</span>
        : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>,
    },
    {
      key: 'dataVencimento', header: 'Vencimento',
      render: (r: ContaPagar) => (
        <span style={{ color: isVencida(r) ? 'var(--danger)' : undefined, fontWeight: isVencida(r) ? 600 : undefined, fontSize: '0.85rem' }}>
          {fmtDate(r.dataVencimento)}
        </span>
      ),
    },
    {
      key: 'valor', header: 'Valor',
      render: (r: ContaPagar) => <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{fmtCurrency(r.valor)}</span>,
    },
    {
      key: 'valorPago', header: 'Valor Pago',
      render: (r: ContaPagar) => r.valorPago > 0
        ? <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: '0.875rem' }}>{fmtCurrency(r.valorPago)}</span>
        : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>,
    },
    {
      key: 'status', header: 'Status',
      render: (r: ContaPagar) => <Badge label={r.status} variant={statusVariant(r.status)} />,
    },
    {
      key: '_actions', header: '', width: '140px',
      render: (r: ContaPagar) => (
        <div className={styles.rowActions}>
          {r.status === 'Pendente' && (
            <button
              className={styles.btnSecondary}
              style={{ fontSize: '0.72rem', padding: '3px 8px', color: '#2563eb', borderColor: '#bfdbfe' }}
              disabled={aprovando === r._id}
              onClick={e => { e.stopPropagation(); handleAprovar(r) }}
            >
              {aprovando === r._id ? '...' : 'Aprovar'}
            </button>
          )}
          {(r.status === 'Aprovada' || r.status === 'Pendente') && (
            <button
              className={styles.btnSecondary}
              style={{ fontSize: '0.72rem', padding: '3px 8px', color: 'var(--success)', borderColor: 'rgba(34,197,94,0.35)' }}
              onClick={e => {
                e.stopPropagation()
                setPagarConta(r)
                setPagarForm({ dataPagamento: new Date().toISOString().slice(0, 10), valorPago: String(r.valor) })
                setPagarError('')
                setShowPagar(true)
              }}
            >
              Pagar
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className={styles.page}>
      <PageHeader
        title="Contas a Pagar"
        subtitle="Gestão de despesas, aprovações e pagamentos"
        action={
          <button className={styles.btnPrimary} onClick={() => { setNovaError(''); setShowNova(true) }}>
            + Nova Conta
          </button>
        }
      />

      {kpis && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 12, padding: '18px 22px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Total Pendente</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--danger)' }}>{fmtCurrency(kpis.totalPendente)}</div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 12, padding: '18px 22px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--warning, #d97706)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Vencidas</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--warning, #d97706)' }}>{fmtCurrency(kpis.vencidas)}</div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 12, padding: '18px 22px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--success)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Pagas este mês</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success)' }}>{fmtCurrency(kpis.pagasMes)}</div>
          </div>
        </div>
      )}

      <div className={styles.panel}>
        <div className={styles.filters} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className={styles.search}
              placeholder="Buscar por descrição..."
              value={busca}
              onChange={e => { setBusca(e.target.value); setPage(1) }}
            />
            <button
              className={`${styles.chip} ${vencendo ? styles.chipActive : ''}`}
              style={vencendo ? { borderColor: 'var(--warning, #d97706)', background: 'rgba(217,119,6,0.08)', color: 'var(--warning, #d97706)' } : undefined}
              onClick={() => { setVencendo(v => !v); setPage(1) }}
            >
              Vencendo (7d)
            </button>
          </div>
          <div className={styles.chipRow}>
            <span className={styles.chipLabel}>Status:</span>
            {STATUS_LIST.map(s => (
              <button
                key={s}
                className={`${styles.chip} ${filtroStatus.includes(s) ? styles.chipActive : ''}`}
                onClick={() => toggleStatus(s)}
              >
                {s}
              </button>
            ))}
            {filtroStatus.length > 0 && (
              <button className={styles.chip} onClick={() => { setFiltroStatus([]); setPage(1) }}>
                Limpar
              </button>
            )}
          </div>
        </div>

        <Table columns={columns} rows={rows} loading={loading} empty="Nenhuma conta encontrada" />
        <Pagination page={page} total={total} limit={20} onChange={setPage} />
      </div>

      {showNova && (
        <Modal title="Nova Conta a Pagar" onClose={() => setShowNova(false)} size="md">
          <form onSubmit={handleNovaConta} className={styles.form}>
            <label>Descrição *
              <input
                value={novaForm.descricao}
                onChange={e => setNovaForm(f => ({ ...f, descricao: e.target.value }))}
                placeholder="Ex: Licença Adobe, Aluguel escritório..."
                autoFocus
              />
            </label>
            <div className={styles.formGrid2}>
              <label>Tipo *
                <select value={novaForm.tipo} onChange={e => setNovaForm(f => ({ ...f, tipo: e.target.value }))}>
                  <option value="">Selecione</option>
                  {TIPO_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label>Fornecedor
                <input
                  value={novaForm.fornecedor}
                  onChange={e => setNovaForm(f => ({ ...f, fornecedor: e.target.value }))}
                  placeholder="Nome do fornecedor"
                />
              </label>
              <label>Valor (R$) *
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={novaForm.valor}
                  onChange={e => setNovaForm(f => ({ ...f, valor: e.target.value }))}
                  placeholder="0,00"
                />
              </label>
              <label>Vencimento *
                <input
                  type="date"
                  value={novaForm.dataVencimento}
                  onChange={e => setNovaForm(f => ({ ...f, dataVencimento: e.target.value }))}
                />
              </label>
              <label>Recorrência
                <select value={novaForm.recorrencia} onChange={e => setNovaForm(f => ({ ...f, recorrencia: e.target.value }))}>
                  {RECORRENCIA_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label>Centro de Custo
                <select value={novaForm.centroCusto} onChange={e => setNovaForm(f => ({ ...f, centroCusto: e.target.value }))}>
                  <option value="">Não classificado</option>
                  {CENTRO_CUSTO_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <label>Observações
              <textarea
                value={novaForm.observacoes}
                onChange={e => setNovaForm(f => ({ ...f, observacoes: e.target.value }))}
                rows={2}
                placeholder="Observações internas (opcional)"
              />
            </label>
            {novaError && <p className={styles.error}>{novaError}</p>}
            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowNova(false)}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={novaSaving}>
                {novaSaving ? 'Salvando...' : 'Criar Conta'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showPagar && pagarConta && (
        <Modal title="Registrar Pagamento" onClose={() => { setShowPagar(false); setPagarConta(null) }} size="sm">
          <form onSubmit={handlePagar} className={styles.form}>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              <strong>{pagarConta.descricao}</strong>
              {pagarConta.fornecedor && <> — {pagarConta.fornecedor}</>}
            </p>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Valor original: <strong>{fmtCurrency(pagarConta.valor)}</strong>
              {' '}· Vencimento: {fmtDate(pagarConta.dataVencimento)}
            </p>
            <label>Data do Pagamento *
              <input
                type="date"
                value={pagarForm.dataPagamento}
                onChange={e => setPagarForm(f => ({ ...f, dataPagamento: e.target.value }))}
                autoFocus
              />
            </label>
            <label>Valor Pago (R$) *
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={pagarForm.valorPago}
                onChange={e => setPagarForm(f => ({ ...f, valorPago: e.target.value }))}
                placeholder="0,00"
              />
            </label>
            {pagarError && <p className={styles.error}>{pagarError}</p>}
            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => { setShowPagar(false); setPagarConta(null) }}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={pagarSaving}>
                {pagarSaving ? 'Registrando...' : 'Confirmar Pagamento'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
