import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Badge from '../components/Badge'
import Table from '../components/Table'
import Modal from '../components/Modal'
import {
  clientes as clientesApi,
  contratos as contratosApi,
  financeiro as financeiroApi,
  certificadosICP as certICPApi,
} from '../api'
import type { Cliente, ClientePayload, Pedido, Contrato, NotaFiscal, CertificadoICP } from '../types'
import {
  email as validateEmail,
  documento as validateDoc,
  required,
  hasErrors,
  type FieldErrors,
} from '../utils/validate'
import styles from './ClienteDetalhe.module.css'

// ── Types ──────────────────────────────────────────────────
type TabKey = 'dados' | 'pedidos' | 'comprasDiretas' | 'contratos' | 'financeiro' | 'portfolio' | 'equipe' | 'certificadosICP'
type Errs = FieldErrors<ClientePayload>

const BLANK: ClientePayload = {
  nome: '',
  email: '',
  documento: '',
  tipo: 'pessoa-juridica',
  esferaPublica: false,
  ativo: true,
}

function validate(f: ClientePayload): Errs {
  return {
    nome: required(f.nome, 'Nome'),
    email: validateEmail(f.email),
    documento: validateDoc(f.documento),
  }
}

function fmtDate(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

function fmtDateTime(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR')
}

function fmtMoney(v?: number) {
  if (v === undefined || v === null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ── Component ──────────────────────────────────────────────
export default function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // Client data
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [loadingCliente, setLoadingCliente] = useState(true)

  // Active tab
  const [activeTab, setActiveTab] = useState<TabKey>('dados')

  // Status dropdown
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [toggling, setToggling] = useState(false)
  const statusRef = useRef<HTMLDivElement>(null)

  // Pedidos tab
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loadingPedidos, setLoadingPedidos] = useState(false)
  const [pedidosLoaded, setPedidosLoaded] = useState(false)

  // Contratos tab
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [loadingContratos, setLoadingContratos] = useState(false)
  const [contratosLoaded, setContratosLoaded] = useState(false)

  // Financeiro tab
  const [notas, setNotas] = useState<NotaFiscal[]>([])
  const [loadingNotas, setLoadingNotas] = useState(false)
  const [notasLoaded, setNotasLoaded] = useState(false)

  // Edit modal
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<ClientePayload>(BLANK)
  const [errs, setErrs] = useState<Errs>({})
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [consultandoDocumento, setConsultandoDocumento] = useState(false)

  // Certificados ICP tab
  const [certICP, setCertICP] = useState<CertificadoICP[]>([])
  const [certICPTotal, setCertICPTotal] = useState(0)
  const [certICPPage, setCertICPPage] = useState(1)
  const [loadingCertICP, setLoadingCertICP] = useState(false)
  const [certICPLoaded, setCertICPLoaded] = useState(false)

  // Equipe modal
  const [showEquipeModal, setShowEquipeModal] = useState(false)
  const [equipeForm, setEquipeForm] = useState({
    nome: '', email: '', cargo: '', cpf: '', role: 'Atendente' as string,
  })
  const [savingEquipe, setSavingEquipe] = useState(false)
  const [equipeError, setEquipeError] = useState('')

  // Revalidar
  const [revalidando, setRevalidando] = useState(false)

  // ── Fetch cliente ─────────────────────────────────────────
  const loadCliente = useCallback(() => {
    if (!id) return
    setLoadingCliente(true)
    clientesApi
      .get(id)
      .then(setCliente)
      .catch(() => setCliente(null))
      .finally(() => setLoadingCliente(false))
  }, [id])

  useEffect(() => {
    loadCliente()
  }, [loadCliente])

  // ── Close status menu on outside click ───────────────────
  useEffect(() => {
    if (!statusMenuOpen) return
    function handleClick(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setStatusMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [statusMenuOpen])

  // ── Lazy load tab data ────────────────────────────────────
  useEffect(() => {
    if (!id || !['pedidos', 'comprasDiretas'].includes(activeTab) || pedidosLoaded) return
    setLoadingPedidos(true)
    clientesApi
      .pedidos(id)
      .then(data => { setPedidos(data); setPedidosLoaded(true) })
      .catch(() => setPedidos([]))
      .finally(() => setLoadingPedidos(false))
  }, [id, activeTab, pedidosLoaded])

  useEffect(() => {
    if (!id || activeTab !== 'contratos' || contratosLoaded) return
    setLoadingContratos(true)
    contratosApi
      .list({ clienteId: id, limit: 100 })
      .then(res => { setContratos(res.data); setContratosLoaded(true) })
      .catch(() => setContratos([]))
      .finally(() => setLoadingContratos(false))
  }, [id, activeTab, contratosLoaded])

  useEffect(() => {
    if (!id || activeTab !== 'certificadosICP' || certICPLoaded) return
    setLoadingCertICP(true)
    certICPApi
      .list({ clienteId: id, limit: 50, page: certICPPage })
      .then(res => {
        setCertICP(res.data)
        setCertICPTotal(res.total)
        setCertICPLoaded(true)
      })
      .catch(() => setCertICP([]))
      .finally(() => setLoadingCertICP(false))
  }, [id, activeTab, certICPLoaded, certICPPage])

  useEffect(() => {
    if (!id || activeTab !== 'financeiro' || notasLoaded) return
    setLoadingNotas(true)
    // financeiro.notas does not support clienteId filter directly;
    // load and filter by pedido's clienteId reference if needed.
    // We request a broad set and rely on the backend returning relevant items
    // via pedidoId links. Since there is no clienteId filter on notas,
    // we load pedidos first to get pedidoIds, then filter notas by pedidoId.
    // If pedidos not yet loaded, do it inline.
    const fetchNotas = async () => {
      let peds = pedidos
      if (!pedidosLoaded) {
        peds = await clientesApi.pedidos(id).catch(() => [])
      }
      const pedidoIds = new Set(peds.map(p => p._id))
      const res = await financeiroApi.notas({ limit: 200 })
      const filtered = res.data.filter(n => {
        const pedidoId =
          typeof n.pedidoId === 'string' ? n.pedidoId : n.pedidoId?._id
        return pedidoId && pedidoIds.has(pedidoId)
      })
      setNotas(filtered)
      setNotasLoaded(true)
    }
    fetchNotas()
      .catch(() => setNotas([]))
      .finally(() => setLoadingNotas(false))
  }, [id, activeTab, notasLoaded, pedidos, pedidosLoaded])

  // ── Status toggle ─────────────────────────────────────────
  async function handleToggle(novoAtivo: boolean) {
    if (!cliente || !id) return
    setStatusMenuOpen(false)
    setToggling(true)
    try {
      const updated = await clientesApi.toggleAtivo(id, novoAtivo)
      setCliente(updated)
    } catch {
      // silently fail; state stays as is
    } finally {
      setToggling(false)
    }
  }

  // ── Edit modal ────────────────────────────────────────────
  function openEdit() {
    if (!cliente) return
    setForm({
      nome: cliente.nome,
      email: cliente.email,
      documento: cliente.documento,
      tipo: cliente.tipo,
      telefone: cliente.telefone,
      esferaPublica: cliente.esferaPublica,
      ativo: cliente.ativo,
    })
    setErrs({})
    setTouched(false)
    setFormError('')
    setShowModal(true)
  }

  function updateForm(patch: Partial<ClientePayload>) {
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
    if (!cliente || !id) return
    setSaving(true)
    setFormError('')
    try {
      const updated = await clientesApi.update(id, form)
      setCliente(updated)
      setShowModal(false)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  async function handleConsultarDocumento() {
    const documento = form.documento.replace(/\D/g, '')
    if (![11, 14].includes(documento.length)) {
      setFormError('Informe um CPF ou CNPJ válido antes da consulta.')
      return
    }
    setConsultandoDocumento(true)
    setFormError('')
    try {
      const cadastro = await clientesApi.consultarDocumento(documento)
      updateForm({
        nome: cadastro.nome || form.nome,
        tipo: documento.length === 14 ? 'pessoa-juridica' : 'pessoa-fisica',
        esferaPublica: cadastro.esferaPublica ?? form.esferaPublica,
      })
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Não foi possível consultar o documento'
      )
    } finally {
      setConsultandoDocumento(false)
    }
  }

  // ── Revalidar Serpro ──────────────────────────────────────
  async function handleRevalidar() {
    if (!cliente || !id) return
    setRevalidando(true)
    try {
      const updated = await clientesApi.revalidarCadastro(id)
      setCliente(updated)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Não foi possível revalidar o cadastro')
    } finally {
      setRevalidando(false)
    }
  }

  // ── Equipe ────────────────────────────────────────────────
  function openEquipeModal() {
    setEquipeForm({ nome: '', email: '', cargo: '', cpf: '', role: 'Atendente' })
    setEquipeError('')
    setShowEquipeModal(true)
  }

  async function handleSalvarEquipe(e: React.FormEvent) {
    e.preventDefault()
    if (!equipeForm.nome.trim() || !equipeForm.email.trim()) {
      setEquipeError('Nome e e-mail são obrigatórios.')
      return
    }
    if (!cliente || !id) return
    setSavingEquipe(true)
    setEquipeError('')
    try {
      const updated = await clientesApi.upsertEquipe(id, {
        nome: equipeForm.nome,
        email: equipeForm.email,
        cargo: equipeForm.cargo || undefined,
        cpf: equipeForm.cpf || undefined,
        role: equipeForm.role,
        permissions: [],
      })
      setCliente(updated)
      setShowEquipeModal(false)
    } catch (err) {
      setEquipeError(err instanceof Error ? err.message : 'Erro ao salvar membro')
    } finally {
      setSavingEquipe(false)
    }
  }

  async function handleRemoverEquipe(email: string) {
    if (!id) return
    if (!confirm(`Remover ${email} da equipe?`)) return
    try {
      await clientesApi.removerEquipe(id, email)
      setCliente(prev =>
        prev
          ? { ...prev, equipe: (prev.equipe ?? []).filter(m => m.email !== email) }
          : prev
      )
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao remover membro')
    }
  }

  // ── Registrar LGPD ────────────────────────────────────────
  async function handleLgpd() {
    if (!cliente || !id) return
    const tipo = prompt(
      'Tipo da solicitação: Acesso, Correcao, Exclusao ou Portabilidade',
      'Acesso'
    )?.trim() as 'Acesso' | 'Correcao' | 'Exclusao' | 'Portabilidade' | undefined
    if (!tipo) return
    const motivo = prompt('Motivo ou observação (opcional):', '')?.trim()
    try {
      const updated = await clientesApi.registrarLgpd(id, {
        tipo,
        motivo: motivo || undefined,
      })
      setCliente(updated)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Não foi possível registrar a solicitação LGPD')
    }
  }

  // ── Column definitions ────────────────────────────────────
  const pedidoColumns = [
    {
      key: 'numero',
      header: 'Número',
      render: (r: Pedido) => <strong>{r.numero}</strong>,
    },
    {
      key: 'etapaOperacional',
      header: 'Etapa',
      render: (r: Pedido) => r.etapaOperacional ?? '—',
    },
    {
      key: 'status',
      header: 'Status',
      render: (r: Pedido) => <Badge label={r.status} />,
    },
    {
      key: 'valorTotal',
      header: 'Valor',
      render: (r: Pedido) => fmtMoney(r.valorTotal),
    },
    {
      key: 'createdAt',
      header: 'Data',
      render: (r: Pedido) => fmtDate(r.createdAt),
    },
    {
      key: '_actions',
      header: '',
      width: '100px',
      render: (r: Pedido) => (
        <button
          className={styles.btnLink}
          onClick={e => {
            e.stopPropagation()
            navigate(`/pedidos/${r._id}`)
          }}
        >
          Ver pedido
        </button>
      ),
    },
  ]

  const contratoColumns = [
    {
      key: 'numero',
      header: 'Número',
      render: (r: Contrato) => <strong>{r.numero}</strong>,
    },
    {
      key: 'modalidade',
      header: 'Modalidade',
      render: (r: Contrato) => r.modalidade,
    },
    {
      key: 'ativo',
      header: 'Status',
      render: (r: Contrato) => (
        <Badge label={r.ativo ? 'Ativo' : 'Encerrado'} variant={r.ativo ? 'success' : 'default'} />
      ),
    },
    {
      key: 'valorTotal',
      header: 'Valor Total',
      render: (r: Contrato) => fmtMoney(r.valorTotal),
    },
    {
      key: 'dataInicio',
      header: 'Início',
      render: (r: Contrato) => fmtDate(r.dataInicio),
    },
    {
      key: 'dataFim',
      header: 'Fim',
      render: (r: Contrato) => fmtDate(r.dataFim),
    },
    {
      key: '_actions',
      header: '',
      width: '100px',
      render: (r: Contrato) => (
        <button
          className={styles.btnLink}
          onClick={e => {
            e.stopPropagation()
            navigate(`/contratos/${r._id}`)
          }}
        >
          Ver contrato
        </button>
      ),
    },
  ]

  const notaColumns = [
    {
      key: 'numero',
      header: 'Número',
      render: (r: NotaFiscal) => <strong>{r.numero || '—'}</strong>,
    },
    {
      key: 'emissor',
      header: 'Emissor',
      render: (r: NotaFiscal) => <Badge label={r.emissor} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r: NotaFiscal) => <Badge label={r.status} />,
    },
    {
      key: 'valor',
      header: 'Valor',
      render: (r: NotaFiscal) => fmtMoney(r.valor),
    },
    {
      key: 'createdAt',
      header: 'Emitida em',
      render: (r: NotaFiscal) => fmtDate(r.createdAt),
    },
  ]

  // ── Render ────────────────────────────────────────────────
  if (loadingCliente) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Carregando...</div>
      </div>
    )
  }

  if (!cliente) {
    return (
      <div className={styles.page}>
        <button className={styles.backBtn} onClick={() => navigate('/clientes')}>
          ← Voltar
        </button>
        <div className={styles.empty}>Cliente não encontrado.</div>
      </div>
    )
  }

  const tabCounts: Record<TabKey, number | undefined> = {
    dados: undefined,
    pedidos: pedidosLoaded ? pedidos.length : undefined,
    comprasDiretas: pedidosLoaded
      ? pedidos.filter(pedido => pedido.vinculo.tipo === 'CompraDireta').length
      : undefined,
    contratos: contratosLoaded ? contratos.length : undefined,
    financeiro: notasLoaded ? notas.length : undefined,
    portfolio: cliente
      ? (cliente.portfolioSSL?.length ?? 0) + (cliente.portfolioICP?.length ?? 0)
      : undefined,
    equipe: cliente ? (cliente.equipe?.length ?? 0) : undefined,
    certificadosICP: certICPLoaded ? certICPTotal : undefined,
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'dados', label: 'Dados de Cadastro' },
    { key: 'pedidos', label: 'Pedidos' },
    { key: 'comprasDiretas', label: 'Compras diretas' },
    { key: 'contratos', label: 'Contratos' },
    { key: 'financeiro', label: 'Financeiro' },
    { key: 'portfolio', label: 'Portfólio' },
    { key: 'equipe', label: 'Equipe' },
    { key: 'certificadosICP', label: 'Certificados ICP' },
  ]

  return (
    <div className={styles.page}>
      {/* Back button */}
      <button className={styles.backBtn} onClick={() => navigate('/clientes')}>
        ← Voltar para Clientes
      </button>

      {/* Page header */}
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <h1 className={styles.clienteName}>{cliente.nome}</h1>
          <nav className={styles.breadcrumb}>
            <Link to="/">Início</Link>
            <span>•</span>
            <Link to="/clientes">Clientes</Link>
            <span>•</span>
            <span style={{ color: 'var(--text-secondary)' }}>{cliente.nome}</span>
          </nav>
        </div>

        {/* Status dropdown */}
        <div className={styles.statusDropdown} ref={statusRef}>
          <button
            className={styles.statusTrigger}
            onClick={() => setStatusMenuOpen(prev => !prev)}
            disabled={toggling}
            aria-haspopup="true"
            aria-expanded={statusMenuOpen}
          >
            <Badge
              label={cliente.ativo ? 'Ativo' : 'Inativo'}
              variant={cliente.ativo ? 'success' : 'default'}
            />
            <span className={styles.chevron}>{toggling ? '...' : '▾'}</span>
          </button>

          {statusMenuOpen && (
            <div className={styles.statusMenu} role="menu">
              {cliente.ativo ? (
                <button
                  className={`${styles.statusMenuItem} ${styles.danger}`}
                  role="menuitem"
                  onClick={() => handleToggle(false)}
                >
                  Desativar cliente
                </button>
              ) : (
                <button
                  className={`${styles.statusMenuItem} ${styles.success}`}
                  role="menuitem"
                  onClick={() => handleToggle(true)}
                >
                  Reativar cliente
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs} role="tablist">
        {tabs.map(t => (
          <button
            key={t.key}
            role="tab"
            aria-selected={activeTab === t.key}
            className={`${styles.tab} ${activeTab === t.key ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
            {tabCounts[t.key] !== undefined && (
              <span className={styles.tabBadge}>{tabCounts[t.key]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className={styles.tabContent} role="tabpanel">

        {/* ── Dados de Cadastro ── */}
        {activeTab === 'dados' && (
          <>
            <div className={styles.actionsRow}>
              <button className={styles.btnPrimary} onClick={openEdit}>
                Editar dados
              </button>
              {cliente.tipo === 'pessoa-juridica' && (
                <button
                  className={styles.btnSecondary}
                  onClick={handleRevalidar}
                  disabled={revalidando}
                >
                  {revalidando ? 'Consultando...' : 'Revalidar Serpro'}
                </button>
              )}
              <button className={styles.btnSecondary} onClick={handleLgpd}>
                Registrar LGPD
              </button>
            </div>

            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>E-mail</span>
                <span className={styles.infoValue}>{cliente.email}</span>
              </div>

              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Usuário master</span>
                <span className={styles.infoValue}>
                  {typeof cliente.usuarioMasterId === 'object' && cliente.usuarioMasterId ? (
                    <>
                      {cliente.usuarioMasterId.nome}
                      <span className={styles.infoValueMuted}> · {cliente.usuarioMasterId.email}</span>
                    </>
                  ) : (
                    <span className={styles.infoValueMuted}>Não cadastrado</span>
                  )}
                </span>
              </div>

              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Documento (CPF/CNPJ)</span>
                <span className={styles.infoValue}>{cliente.documento}</span>
              </div>

              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Tipo</span>
                <span className={styles.infoValue}>
                  {cliente.tipo === 'pessoa-juridica' ? 'Pessoa Jurídica' : 'Pessoa Física'}
                </span>
              </div>

              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Telefone</span>
                <span className={cliente.telefone ? styles.infoValue : styles.infoValueMuted}>
                  {cliente.telefone || '—'}
                </span>
              </div>

              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Classificação institucional</span>
                <span className={styles.infoValue}>
                  {cliente.esferaPublica ? (
                    <Badge label="Esfera pública" variant="warning" />
                  ) : (
                    <Badge label="Setor privado" variant="default" />
                  )}
                </span>
              </div>

              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Situação Cadastral</span>
                <span className={styles.infoValue}>
                  {cliente.situacaoCadastral ? (
                    <Badge
                      label={cliente.situacaoCadastral}
                      variant={
                        cliente.situacaoCadastral.toUpperCase() === 'ATIVA'
                          ? 'success'
                          : 'warning'
                      }
                    />
                  ) : (
                    <span className={styles.infoValueMuted}>—</span>
                  )}
                </span>
              </div>

              {(cliente.naturezaJuridicaCodigo || cliente.naturezaJuridicaDescricao) && (
                <div className={styles.infoItemFull}>
                  <span className={styles.infoLabel}>Natureza Jurídica</span>
                  <span className={styles.infoValue}>
                    {[cliente.naturezaJuridicaCodigo, cliente.naturezaJuridicaDescricao]
                      .filter(Boolean)
                      .join(' — ')}
                  </span>
                </div>
              )}

              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Última Validação Serpro</span>
                <span className={styles.infoValue}>{fmtDateTime(cliente.validadoSerproEm)}</span>
              </div>

              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Cadastrado em</span>
                <span className={styles.infoValue}>{fmtDate(cliente.createdAt)}</span>
              </div>

              {cliente.esferaPublicaRevisao && (
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Classificação</span>
                  <span className={styles.infoValue}>
                    <Badge label="Revisão manual" variant="warning" />
                  </span>
                </div>
              )}
            </div>

            {/* Endereço */}
            {cliente.address && Object.values(cliente.address).some(Boolean) && (
              <>
                <p className={styles.sectionTitle}>Endereço</p>
                <div className={styles.infoGrid}>
                  {cliente.address.rua && (
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>Rua</span>
                      <span className={styles.infoValue}>{cliente.address.rua}</span>
                    </div>
                  )}
                  {cliente.address.numero && (
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>Número</span>
                      <span className={styles.infoValue}>{cliente.address.numero}</span>
                    </div>
                  )}
                  {cliente.address.bairro && (
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>Bairro</span>
                      <span className={styles.infoValue}>{cliente.address.bairro}</span>
                    </div>
                  )}
                  {cliente.address.cidade && (
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>Cidade</span>
                      <span className={styles.infoValue}>{cliente.address.cidade}</span>
                    </div>
                  )}
                  {cliente.address.uf && (
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>UF</span>
                      <span className={styles.infoValue}>{cliente.address.uf}</span>
                    </div>
                  )}
                  {cliente.address.cep && (
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>CEP</span>
                      <span className={styles.infoValue}>{cliente.address.cep}</span>
                    </div>
                  )}
                  {cliente.address.complemento && (
                    <div className={styles.infoItemFull}>
                      <span className={styles.infoLabel}>Complemento</span>
                      <span className={styles.infoValue}>{cliente.address.complemento}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Fiscal */}
            {(cliente.cnae || cliente.cst || cliente.aliquota || cliente.codeMunicipio) && (
              <>
                <p className={styles.sectionTitle}>Fiscal</p>
                <div className={styles.infoGrid}>
                  {cliente.cnae && (
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>CNAE</span>
                      <span className={styles.infoValue}>{cliente.cnae}</span>
                    </div>
                  )}
                  {cliente.cst && (
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>CST</span>
                      <span className={styles.infoValue}>{cliente.cst}</span>
                    </div>
                  )}
                  {cliente.aliquota && (
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>Alíquota</span>
                      <span className={styles.infoValue}>{cliente.aliquota}</span>
                    </div>
                  )}
                  {cliente.codeMunicipio && (
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>Código Município</span>
                      <span className={styles.infoValue}>{cliente.codeMunicipio}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Financeiro */}
            {(cliente.paymentMethod || cliente.formaAPagar || cliente.dataFechamento || cliente.limiteCredito) && (
              <>
                <p className={styles.sectionTitle}>Financeiro</p>
                <div className={styles.infoGrid}>
                  {cliente.paymentMethod && (
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>Método de Pagamento</span>
                      <span className={styles.infoValue}>{cliente.paymentMethod}</span>
                    </div>
                  )}
                  {cliente.formaAPagar && (
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>Forma a Pagar</span>
                      <span className={styles.infoValue}>{cliente.formaAPagar}</span>
                    </div>
                  )}
                  {cliente.dataFechamento !== undefined && (
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>Dia Fechamento</span>
                      <span className={styles.infoValue}>{cliente.dataFechamento}</span>
                    </div>
                  )}
                  {cliente.limiteCredito !== undefined && (
                    <div className={styles.infoItem}>
                      <span className={styles.infoLabel}>Limite de Crédito</span>
                      <span className={styles.infoValue}>{fmtMoney(cliente.limiteCredito)}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Serviços Contratados */}
            {(cliente.servicosContratados?.length ?? 0) > 0 && (
              <>
                <p className={styles.sectionTitle}>Serviços Contratados</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                  {cliente.servicosContratados!.map(s => (
                    <Badge key={s} label={s} variant="info" />
                  ))}
                </div>
              </>
            )}

            {/* LGPD history */}
            {(cliente.solicitacoesLgpd?.length ?? 0) > 0 && (
              <>
                <p className={styles.sectionTitle}>Histórico de Solicitações LGPD</p>
                <div className={styles.lgpdList}>
                  {[...cliente.solicitacoesLgpd!].reverse().map(item => (
                    <div key={item._id} className={styles.lgpdItem}>
                      <Badge
                        label={item.tipo}
                        variant={
                          item.tipo === 'Exclusao'
                            ? 'danger'
                            : item.tipo === 'Acesso'
                            ? 'info'
                            : 'warning'
                        }
                      />
                      <Badge
                        label={item.status}
                        variant={
                          item.status === 'Atendida'
                            ? 'success'
                            : item.status === 'Negada'
                            ? 'danger'
                            : 'warning'
                        }
                      />
                      {item.motivo && (
                        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                          {item.motivo}
                        </span>
                      )}
                      <span className={styles.lgpdMeta}>
                        {fmtDate(item.solicitadaEm)}
                        {item.resolvidaEm ? ` → ${fmtDate(item.resolvidaEm)}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ── Pedidos ── */}
        {activeTab === 'pedidos' && (
          <Table
            columns={pedidoColumns}
            rows={pedidos}
            loading={loadingPedidos}
            empty="Nenhum pedido encontrado para este cliente"
          />
        )}

        {/* ── Compras diretas ── */}
        {activeTab === 'comprasDiretas' && (
          <Table
            columns={pedidoColumns}
            rows={pedidos.filter(pedido => pedido.vinculo.tipo === 'CompraDireta')}
            loading={loadingPedidos}
            empty="Nenhuma compra direta encontrada para este cliente"
          />
        )}

        {/* ── Contratos ── */}
        {activeTab === 'contratos' && (
          <Table
            columns={contratoColumns}
            rows={contratos}
            loading={loadingContratos}
            empty="Nenhum contrato encontrado para este cliente"
          />
        )}

        {/* ── Financeiro ── */}
        {activeTab === 'financeiro' && (
          <Table
            columns={notaColumns}
            rows={notas}
            loading={loadingNotas}
            empty="Nenhuma nota fiscal encontrada para este cliente"
          />
        )}

        {/* ── Portfólio ── */}
        {activeTab === 'portfolio' && (
          <>
            {/* Portfólio SSL/Raiz */}
            <p className={styles.sectionTitle}>Portfólio SSL / Raiz</p>
            {(cliente.portfolioSSL?.length ?? 0) === 0 ? (
              <div className={styles.empty}>Nenhum produto SSL no portfólio</div>
            ) : (
              <div style={{ overflowX: 'auto', marginBottom: 28 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--surface-border)' }}>
                      {['Produto', 'Tipo', 'Fornecedor', 'Qtd Contratada', 'Qtd Emitida', 'Preço Venda', 'Contrato'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.73rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cliente.portfolioSSL!.map((item, i) => (
                      <tr key={item._id ?? i} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.nome}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{item.tipo}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{item.fornecedor || '—'}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', textAlign: 'center' }}>{item.quantidade}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', textAlign: 'center' }}>{item.quantidadeEmitida}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{fmtMoney(item.precoVenda)}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{item.numContrato || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Portfólio ICP-Brasil */}
            <p className={styles.sectionTitle}>Portfólio ICP-Brasil</p>
            {(cliente.portfolioICP?.length ?? 0) === 0 ? (
              <div className={styles.empty}>Nenhum produto ICP-Brasil no portfólio</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--surface-border)' }}>
                      {['Produto', 'Fornecedor', 'Tipo Cert', 'Finalidade', 'Qtd Contratada', 'Qtd Emitida', 'Contrato'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.73rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cliente.portfolioICP!.map((item, i) => (
                      <tr key={item._id ?? i} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{item.nome}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{item.fornecedor}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{item.tipoCertificado || '—'}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{item.finalidade || '—'}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', textAlign: 'center' }}>{item.quantidade}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', textAlign: 'center' }}>{item.quantidadeEmitida}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{item.numContrato || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Equipe ── */}
        {activeTab === 'equipe' && (
          <>
            <div className={styles.actionsRow}>
              <button className={styles.btnPrimary} onClick={openEquipeModal}>
                Adicionar Membro
              </button>
            </div>
            {(cliente.equipe?.length ?? 0) === 0 ? (
              <div className={styles.empty}>Nenhum membro na equipe</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--surface-border)' }}>
                      {['Nome', 'Cargo', 'Email', 'CPF', 'Permissões', ''].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.73rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cliente.equipe!.map((m, i) => (
                      <tr key={m._id ?? i} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{m.nome}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{m.cargo || '—'}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{m.email}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>{m.cpf || '—'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {m.role && <Badge label={m.role} variant="info" />}
                            {m.permissions.map(p => (
                              <Badge key={p} label={p} variant="default" />
                            ))}
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <button
                            className={styles.btnLink}
                            style={{ color: 'var(--danger)' }}
                            onClick={() => handleRemoverEquipe(m.email)}
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Certificados ICP ── */}
        {activeTab === 'certificadosICP' && (
          <>
            {loadingCertICP ? (
              <div className={styles.loading}>Carregando...</div>
            ) : certICP.length === 0 ? (
              <div className={styles.empty}>Nenhum certificado ICP-Brasil encontrado para este cliente</div>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--surface-border)' }}>
                        {['CPF/CNPJ', 'Nome', 'Fornecedor', 'Validade', 'Status', ''].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.73rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {certICP.map(cert => (
                        <tr key={cert._id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                          <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '0.82rem' }}>{cert.cpfCnpj}</td>
                          <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{cert.nomeEmitente}</td>
                          <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{cert.fornecedor || '—'}</td>
                          <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtDate(cert.fimValidade)}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <Badge
                              label={cert.statusRevogacao ?? cert.status}
                              variant={
                                cert.statusRevogacao === 'ativo' ? 'success'
                                : cert.statusRevogacao === 'revogado' ? 'danger'
                                : cert.statusRevogacao === 'expirado' ? 'warning'
                                : cert.statusRevogacao === 'suspenso' ? 'warning'
                                : 'default'
                              }
                            />
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <button
                              className={styles.btnLink}
                              onClick={() => navigate(`/certificados-icp?id=${cert._id}`)}
                            >
                              Ver detalhes
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {certICPTotal > certICP.length && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
                    {certICPPage > 1 && (
                      <button className={styles.btnSecondary} onClick={() => { setCertICPPage(p => p - 1); setCertICPLoaded(false) }}>
                        ← Anterior
                      </button>
                    )}
                    <span style={{ fontSize: '0.83rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                      Exibindo {certICP.length} de {certICPTotal}
                    </span>
                    {certICP.length < certICPTotal && (
                      <button className={styles.btnSecondary} onClick={() => { setCertICPPage(p => p + 1); setCertICPLoaded(false) }}>
                        Próxima →
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ── Equipe Modal ── */}
      {showEquipeModal && (
        <Modal title="Adicionar Membro" onClose={() => setShowEquipeModal(false)} size="md">
          <form onSubmit={handleSalvarEquipe} noValidate className={styles.form}>
            <div className={styles.formGrid2}>
              <label>
                Nome *
                <input
                  value={equipeForm.nome}
                  onChange={e => setEquipeForm(f => ({ ...f, nome: e.target.value }))}
                />
              </label>

              <label>
                E-mail *
                <input
                  type="email"
                  value={equipeForm.email}
                  onChange={e => setEquipeForm(f => ({ ...f, email: e.target.value }))}
                />
              </label>

              <label>
                Cargo
                <input
                  value={equipeForm.cargo}
                  onChange={e => setEquipeForm(f => ({ ...f, cargo: e.target.value }))}
                />
              </label>

              <label>
                CPF
                <input
                  value={equipeForm.cpf}
                  onChange={e => setEquipeForm(f => ({ ...f, cpf: e.target.value }))}
                  placeholder="Somente números"
                />
              </label>

              <label style={{ gridColumn: 'span 2' }}>
                Perfil de acesso
                <select
                  value={equipeForm.role}
                  onChange={e => setEquipeForm(f => ({ ...f, role: e.target.value }))}
                >
                  <option value="Admin">Admin</option>
                  <option value="Gerente">Gerente</option>
                  <option value="Atendente">Atendente</option>
                  <option value="Revenda">Revenda</option>
                </select>
              </label>
            </div>

            {equipeError && <p className={styles.error}>{equipeError}</p>}

            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setShowEquipeModal(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className={styles.btnPrimary}
                disabled={savingEquipe}
              >
                {savingEquipe ? 'Salvando...' : 'Adicionar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Edit Modal ── */}
      {showModal && (
        <Modal title="Editar Cliente" onClose={() => setShowModal(false)} size="md">
          <form onSubmit={handleSave} noValidate className={styles.form}>
            <div className={styles.formGrid2}>
              <label>
                Nome *
                <input
                  value={form.nome}
                  onChange={e => updateForm({ nome: e.target.value })}
                  className={errs.nome ? styles.inputError : ''}
                />
                {errs.nome && <span className={styles.fieldError}>{errs.nome}</span>}
              </label>

              <label>
                E-mail *
                <input
                  type="email"
                  value={form.email}
                  onChange={e => updateForm({ email: e.target.value })}
                  className={errs.email ? styles.inputError : ''}
                />
                {errs.email && <span className={styles.fieldError}>{errs.email}</span>}
              </label>

              <label>
                Documento (CPF/CNPJ) *
                <input
                  value={form.documento}
                  onChange={e => updateForm({ documento: e.target.value })}
                  placeholder="Somente números"
                  className={errs.documento ? styles.inputError : ''}
                />
                {errs.documento && (
                  <span className={styles.fieldError}>{errs.documento}</span>
                )}
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={handleConsultarDocumento}
                  disabled={consultandoDocumento}
                  style={{ marginTop: 6 }}
                >
                  {consultandoDocumento ? 'Consultando...' : 'Consultar cadastro oficial'}
                </button>
              </label>

              <label>
                Telefone
                <input
                  value={form.telefone || ''}
                  onChange={e => updateForm({ telefone: e.target.value })}
                />
              </label>

              <label>
                Tipo *
                <select
                  value={form.tipo}
                  onChange={e =>
                    updateForm({ tipo: e.target.value as Cliente['tipo'] })
                  }
                >
                  <option value="pessoa-juridica">Pessoa Jurídica</option>
                  <option value="pessoa-fisica">Pessoa Física</option>
                </select>
              </label>

              <label>
                Status
                <select
                  value={form.ativo ? 'true' : 'false'}
                  onChange={e => updateForm({ ativo: e.target.value === 'true' })}
                >
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
              </label>

              <label style={{ gridColumn: 'span 2' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginTop: 4,
                  }}
                >
                  <input
                    type="checkbox"
                    id="esferaPublicaEdit"
                    checked={!!form.esferaPublica}
                    onChange={e => updateForm({ esferaPublica: e.target.checked })}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                  <span style={{ fontWeight: 500 }}>Cliente da esfera pública</span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    (Lei 4.320/64 — exige empenho nos pedidos)
                  </span>
                </div>
              </label>
            </div>

            {formError && <p className={styles.error}>{formError}</p>}

            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => setShowModal(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className={styles.btnPrimary}
                disabled={saving}
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
