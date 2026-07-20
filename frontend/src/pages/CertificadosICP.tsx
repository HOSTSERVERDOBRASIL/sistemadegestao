import { useEffect, useState, useCallback } from 'react'
import PageHeader from '../components/PageHeader'
import Table from '../components/Table'
import Badge from '../components/Badge'
import Pagination from '../components/Pagination'
import Modal from '../components/Modal'
import { certificadosICP as api, clientes as clientesApi } from '../api'
import type { CertificadoICP, Cliente } from '../types'
import styles from './Page.module.css'

const LIMIT = 20

function fmtDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR')
}

function isVencendoEm30(d?: string) {
  if (!d) return false
  const fim = new Date(d)
  const hoje = new Date()
  const diff = (fim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
  return diff >= 0 && diff <= 30
}

function statusBadgeVariant(s?: string): 'success' | 'danger' | 'default' | 'warning' {
  switch (s) {
    case 'ativo':     return 'success'
    case 'revogado':  return 'danger'
    case 'expirado':  return 'default'
    case 'suspenso':  return 'warning'
    case 'renovado':  return 'info' as 'success'
    case 'solicitado': return 'warning'
    default:          return 'default'
  }
}

function statusLabel(s?: string) {
  if (!s) return 'Ativo'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function CertificadosICP() {
  const [page, setPage]   = useState(1)
  const [total, setTotal] = useState(0)
  const [rows, setRows]   = useState<CertificadoICP[]>([])
  const [loading, setLoading] = useState(true)

  const [busca, setBusca]               = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'' | 'ativo' | 'revogado' | 'expirado'>('')
  const [filtroVencendo, setFiltroVencendo] = useState<'' | '30' | '60' | '90'>('')

  // Contador de ativos e vencendo em 30 dias (calculado dos rows visíveis + total)
  const [totalAtivos, setTotalAtivos]     = useState(0)
  const [totalVenc30, setTotalVenc30]     = useState(0)

  // Modal de cadastro manual
  const [showModal, setShowModal]       = useState(false)
  const [form, setForm]                 = useState<Partial<CertificadoICP>>({})
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState('')
  const [clientesList, setClientesList] = useState<Cliente[]>([])

  // Modal de revogação
  const [showRevogar, setShowRevogar]           = useState(false)
  const [certRevogando, setCertRevogando]       = useState<string | null>(null)
  const [motivoRevogacao, setMotivoRevogacao]   = useState('')
  const [salvandoRev, setSalvandoRev]           = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.list({
      page,
      limit: LIMIT,
      cpfCnpj: busca || undefined,
      statusRevogacao: filtroStatus || undefined,
      vencendoEm: filtroVencendo ? Number(filtroVencendo) : undefined,
    })
      .then(res => {
        setRows(res.data)
        setTotal(res.total)
        // Contagem local
        const ativos = res.data.filter(c => !c.statusRevogacao || c.statusRevogacao === 'ativo').length
        const venc30 = res.data.filter(c => isVencendoEm30(c.fimValidade)).length
        setTotalAtivos(ativos)
        setTotalVenc30(venc30)
      })
      .finally(() => setLoading(false))
  }, [page, busca, filtroStatus, filtroVencendo])

  useEffect(() => { load() }, [load])

  async function openCreate() {
    setForm({})
    setError('')
    if (clientesList.length === 0) {
      const res = await clientesApi.list({ limit: 200 })
      setClientesList(res.data)
    }
    setShowModal(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.clienteId) { setError('Selecione um cliente.'); return }
    if (!form.cpfCnpj)   { setError('CPF/CNPJ é obrigatório.'); return }
    setSaving(true); setError('')
    try {
      await api.create(form)
      setShowModal(false)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  function openRevogar(id: string) {
    setCertRevogando(id)
    setMotivoRevogacao('')
    setShowRevogar(true)
  }

  async function handleRevogar(e: React.FormEvent) {
    e.preventDefault()
    if (!certRevogando) return
    if (!motivoRevogacao.trim()) return
    setSalvandoRev(true)
    try {
      await api.revogar(certRevogando, { motivo: motivoRevogacao })
      setShowRevogar(false)
      setCertRevogando(null)
      load()
    } catch {
      // silently ignore; production could show an error
    } finally {
      setSalvandoRev(false)
    }
  }

  const columns = [
    {
      key: 'cpfCnpj',
      header: 'CPF/CNPJ',
      render: (r: CertificadoICP) => (
        <span>
          {r.cpfCnpj}
          {isVencendoEm30(r.fimValidade) && (
            <span title="Vencendo em 30 dias" style={{ marginLeft: 6 }}>⚠️</span>
          )}
        </span>
      ),
    },
    {
      key: 'nomeEmitente',
      header: 'Nome Emitente',
      render: (r: CertificadoICP) => r.nomeEmitente || '—',
    },
    {
      key: 'companyName',
      header: 'Empresa',
      render: (r: CertificadoICP) => r.companyName || r.nomeEmpresa || '—',
    },
    {
      key: 'fornecedor',
      header: 'Fornecedor',
      render: (r: CertificadoICP) => r.fornecedor || '—',
    },
    {
      key: 'numeroPedido',
      header: 'Produto / Pedido',
      render: (r: CertificadoICP) => (
        <span>
          <span style={{ display: 'block', fontWeight: 600, fontSize: '0.82rem' }}>{r.tipoEmissao || '—'}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.numeroPedido}</span>
        </span>
      ),
    },
    {
      key: 'fimValidade',
      header: 'Validade',
      render: (r: CertificadoICP) => {
        const venc = isVencendoEm30(r.fimValidade)
        return (
          <span style={{ color: venc ? 'var(--warning, #d97706)' : undefined, fontWeight: venc ? 600 : undefined }}>
            {fmtDate(r.fimValidade)}
          </span>
        )
      },
    },
    {
      key: 'statusRevogacao',
      header: 'Status',
      render: (r: CertificadoICP) => (
        <Badge
          label={statusLabel(r.statusRevogacao)}
          variant={statusBadgeVariant(r.statusRevogacao)}
        />
      ),
    },
    {
      key: '_actions',
      header: '',
      width: '100px',
      render: (r: CertificadoICP) => (
        <div className={styles.rowActions}>
          {(!r.statusRevogacao || r.statusRevogacao === 'ativo' || r.statusRevogacao === 'solicitado') && (
            <button
              className={styles.btnDanger}
              onClick={e => { e.stopPropagation(); openRevogar(r._id) }}
            >
              Revogar
            </button>
          )}
        </div>
      ),
    },
  ]

  const subtitleParts: string[] = []
  if (totalAtivos > 0) subtitleParts.push(`${totalAtivos} ativo(s)`)
  if (totalVenc30 > 0) subtitleParts.push(`${totalVenc30} vencendo em 30 dias`)
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(', ') : `${total} registro(s)`

  return (
    <div className={styles.page}>
      <PageHeader
        title="Certificados ICP-Brasil"
        subtitle={subtitle}
        action={
          <button className={styles.btnPrimary} onClick={openCreate}>
            + Novo
          </button>
        }
      />

      <div className={styles.filters}>
        <input
          className={styles.search}
          placeholder="Buscar por CPF/CNPJ..."
          value={busca}
          onChange={e => { setBusca(e.target.value); setPage(1) }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className={styles.chipRow}>
            <span className={styles.chipLabel}>Status</span>
            {([
              { v: '' as const,          l: 'Todos' },
              { v: 'ativo' as const,     l: 'Ativo' },
              { v: 'revogado' as const,  l: 'Revogado' },
              { v: 'expirado' as const,  l: 'Expirado' },
            ]).map(({ v, l }) => (
              <button
                key={v}
                className={`${styles.chip} ${filtroStatus === v ? styles.chipActive : ''}`}
                onClick={() => { setFiltroStatus(v); setPage(1) }}
              >
                {l}
              </button>
            ))}
          </div>
          <div className={styles.chipRow}>
            <span className={styles.chipLabel}>Vencendo em</span>
            {([
              { v: '' as const,   l: 'Qualquer' },
              { v: '30' as const, l: '30 dias' },
              { v: '60' as const, l: '60 dias' },
              { v: '90' as const, l: '90 dias' },
            ]).map(({ v, l }) => (
              <button
                key={v}
                className={`${styles.chip} ${filtroVencendo === v ? styles.chipActive : ''}`}
                onClick={() => { setFiltroVencendo(v); setPage(1) }}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Table<CertificadoICP>
        columns={columns}
        rows={rows}
        loading={loading}
        empty="Nenhum certificado encontrado"
      />
      <Pagination page={page} total={total} limit={LIMIT} onChange={setPage} />

      {/* Modal de cadastro manual */}
      {showModal && (
        <Modal title="Novo Certificado ICP-Brasil" onClose={() => setShowModal(false)} size="lg">
          <form onSubmit={handleSave} noValidate className={styles.form}>
            <div className={styles.formGrid2}>
              <label>Cliente *
                <select
                  value={form.clienteId ?? ''}
                  onChange={e => setForm(f => ({ ...f, clienteId: e.target.value }))}
                >
                  <option value="">Selecione...</option>
                  {clientesList.map(c => (
                    <option key={c._id} value={c._id}>{c.nome}</option>
                  ))}
                </select>
              </label>

              <label>CPF/CNPJ *
                <input
                  value={form.cpfCnpj ?? ''}
                  onChange={e => setForm(f => ({ ...f, cpfCnpj: e.target.value }))}
                  placeholder="000.000.000-00"
                />
              </label>

              <label>Nome Emitente
                <input
                  value={form.nomeEmitente ?? ''}
                  onChange={e => setForm(f => ({ ...f, nomeEmitente: e.target.value }))}
                />
              </label>

              <label>Número do Certificado
                <input
                  value={form.numeroCertif ?? ''}
                  onChange={e => setForm(f => ({ ...f, numeroCertif: e.target.value }))}
                />
              </label>

              <label>Número do Pedido
                <input
                  value={form.numeroPedido ?? ''}
                  onChange={e => setForm(f => ({ ...f, numeroPedido: e.target.value }))}
                />
              </label>

              <label>Fornecedor
                <input
                  value={form.fornecedor ?? ''}
                  onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))}
                />
              </label>

              <label>Validade (Fim)
                <input
                  type="date"
                  value={form.fimValidade ? form.fimValidade.slice(0, 10) : ''}
                  onChange={e => setForm(f => ({ ...f, fimValidade: e.target.value }))}
                />
              </label>

              <label>Valor de Venda (R$)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.valorVenda ?? ''}
                  onChange={e => setForm(f => ({ ...f, valorVenda: Number(e.target.value) }))}
                />
              </label>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowModal(false)}>
                Cancelar
              </button>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal de revogação */}
      {showRevogar && (
        <Modal title="Revogar Certificado" onClose={() => setShowRevogar(false)} size="sm">
          <form onSubmit={handleRevogar} noValidate className={styles.form}>
            <label>Motivo da revogação *
              <textarea
                rows={3}
                value={motivoRevogacao}
                onChange={e => setMotivoRevogacao(e.target.value)}
                placeholder="Descreva o motivo..."
                required
              />
            </label>
            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setShowRevogar(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className={styles.btnDanger}
                disabled={salvandoRev || !motivoRevogacao.trim()}
              >
                {salvandoRev ? 'Revogando...' : 'Confirmar Revogação'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
