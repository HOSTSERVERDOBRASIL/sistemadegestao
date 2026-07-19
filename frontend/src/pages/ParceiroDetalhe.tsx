import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Badge from '../components/Badge'
import Table from '../components/Table'
import Modal from '../components/Modal'
import RelatorioRevenda from '../components/RelatorioRevenda'
import { parceiros as api } from '../api'
import type { Parceiro, ParceiroPayload, Pedido, MovimentoCreditoRevenda, RegraCobrancaRevenda, RelatorioRevenda as RelatorioRevendaType } from '../types'
import { useAuth } from '../context/AuthContext'
import { email as validateEmail, documento as validateDoc, required, hasErrors, type FieldErrors } from '../utils/validate'
import styles from './Page.module.css'

type Aba = 'dados' | 'carteira' | 'pedidos' | 'usuarios' | 'relatorio'

const SITUACAO_VARIANT: Record<string, 'default' | 'info' | 'warning' | 'success' | 'danger'> = {
  'Pago com creditos': 'success',
  'A faturar':         'warning',
  'Aguardando pagamento': 'info',
  'Estornado':         'default',
}

type UsuarioRevenda = { _id: string; nome: string; email: string; ativo: boolean; createdAt: string }

const BLANK_PARCEIRO: ParceiroPayload = {
  nome: '', documento: '', email: '', telefone: '',
  emissorNFPadrao: 'XDigital', comissaoPercentual: undefined, observacoes: '', ativo: true,
  usarRegraCobrancaPadrao: true,
  regrasCobranca: {
    formaPagamento: 'Pre-pago',
    certificadosInternacionais: 'Por emissao',
    certificadosIcpBrasil: 'Por emissao',
    diaVencimento: 10,
    limiteCredito: 0,
  },
}

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmt(d: string) {
  return new Date(d).toLocaleDateString('pt-BR')
}

export default function ParceiroDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isFinanceiro = user?.role === 'admin' || user?.role === 'financeiro'
  const isAdmin = user?.role === 'admin'

  const [parceiro, setParceiro] = useState<Parceiro | null>(null)
  const [loading, setLoading] = useState(true)
  const [aba, setAba] = useState<Aba>('dados')
  const [regraEfetiva, setRegraEfetiva] = useState<{ origem: 'padrao' | 'revenda'; regras: RegraCobrancaRevenda; saldoCreditos: number } | null>(null)
  const [carteira, setCarteira] = useState<{ saldo: number; movimentos: MovimentoCreditoRevenda[] } | null>(null)
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loadingPedidos, setLoadingPedidos] = useState(false)
  const [loadingCarteira, setLoadingCarteira] = useState(false)
  const [filtroPedidoStatus, setFiltroPedidoStatus] = useState<string>('todos')

  // Relatório
  const [relatorio, setRelatorio] = useState<RelatorioRevendaType | null>(null)
  const [loadingRelatorio, setLoadingRelatorio] = useState(false)

  // Usuários revenda
  const [usuarios, setUsuarios] = useState<UsuarioRevenda[]>([])
  const [loadingUsuarios, setLoadingUsuarios] = useState(false)
  const [showNovoUsuario, setShowNovoUsuario] = useState(false)
  const [usuarioForm, setUsuarioForm] = useState({ nome: '', email: '', password: '' })
  const [usuarioErrs, setUsuarioErrs] = useState<Record<string, string>>({})
  const [salvandoUsuario, setSalvandoUsuario] = useState(false)
  const [usuarioError, setUsuarioError] = useState('')

  // Formulário de recarga
  const [valorCredito, setValorCredito] = useState('')
  const [descricaoCredito, setDescricaoCredito] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [creditoError, setCreditoError] = useState('')

  // Modal de edição
  const [showEdit, setShowEdit] = useState(false)
  const [editForm, setEditForm] = useState<ParceiroPayload>(BLANK_PARCEIRO)
  const [editErrs, setEditErrs] = useState<FieldErrors<ParceiroPayload>>({})
  const [editTouched, setEditTouched] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  function validateEdit(f: ParceiroPayload): FieldErrors<ParceiroPayload> {
    return { nome: required(f.nome, 'Nome'), email: validateEmail(f.email), documento: validateDoc(f.documento) }
  }

  function loadParceiro() {
    if (!id) return
    setLoading(true)
    api.get(id).then(setParceiro).finally(() => setLoading(false))
  }

  const loadRegras = useCallback(() => {
    if (!id) return
    api.regrasCobranca(id).then(setRegraEfetiva).catch(() => {})
  }, [id])

  const loadCarteira = useCallback(() => {
    if (!id) return
    setLoadingCarteira(true)
    api.creditos(id).then(setCarteira).finally(() => setLoadingCarteira(false))
  }, [id])

  const loadPedidos = useCallback(() => {
    if (!id) return
    setLoadingPedidos(true)
    api.pedidos(id).then(setPedidos).finally(() => setLoadingPedidos(false))
  }, [id])

  const loadUsuarios = useCallback(() => {
    if (!id) return
    setLoadingUsuarios(true)
    api.usuarios(id).then(setUsuarios).catch(() => setUsuarios([])).finally(() => setLoadingUsuarios(false))
  }, [id])

  const loadRelatorio = useCallback(() => {
    if (!id) return
    setLoadingRelatorio(true)
    api.relatorio(id).then(setRelatorio).catch(() => setRelatorio(null)).finally(() => setLoadingRelatorio(false))
  }, [id])

  useEffect(() => { loadParceiro(); loadRegras() }, [id])

  useEffect(() => {
    if (aba === 'carteira' && !carteira) loadCarteira()
    if (aba === 'pedidos' && pedidos.length === 0) loadPedidos()
    if (aba === 'usuarios' && usuarios.length === 0) loadUsuarios()
    if (aba === 'relatorio' && !relatorio) loadRelatorio()
  }, [aba])

  async function handleRecarga(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    const valor = parseFloat(valorCredito.replace(',', '.'))
    if (isNaN(valor) || valor <= 0) { setCreditoError('Informe um valor maior que zero'); return }
    setSalvando(true); setCreditoError('')
    try {
      await api.adicionarCreditos(id, { valor, descricao: descricaoCredito || undefined })
      setValorCredito(''); setDescricaoCredito('')
      loadCarteira(); loadParceiro()
    } catch (err) {
      setCreditoError(err instanceof Error ? err.message : 'Erro ao adicionar créditos')
    } finally { setSalvando(false) }
  }

  function openEdit() {
    if (!parceiro) return
    setEditForm({
      nome: parceiro.nome, documento: parceiro.documento, email: parceiro.email,
      telefone: parceiro.telefone ?? '',
      emissorNFPadrao: parceiro.emissorNFPadrao,
      comissaoPercentual: parceiro.comissaoPercentual,
      usarRegraCobrancaPadrao: parceiro.usarRegraCobrancaPadrao !== false,
      regrasCobranca: parceiro.regrasCobranca ?? BLANK_PARCEIRO.regrasCobranca,
      observacoes: parceiro.observacoes ?? '',
      ativo: parceiro.ativo,
    })
    setEditErrs({}); setEditTouched(false); setEditError(''); setShowEdit(true)
  }

  function updateEdit(patch: Partial<ParceiroPayload>) {
    const next = { ...editForm, ...patch }
    setEditForm(next)
    if (editTouched) setEditErrs(validateEdit(next))
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    setEditTouched(true)
    const v = validateEdit(editForm)
    setEditErrs(v)
    if (hasErrors(v)) return
    setEditSaving(true); setEditError('')
    try {
      const updated = await api.update(id, editForm)
      setParceiro(updated); setShowEdit(false)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally { setEditSaving(false) }
  }

  function validateUsuario(f: typeof usuarioForm) {
    const e: Record<string, string> = {}
    if (!f.nome.trim()) e.nome = 'Nome obrigatório'
    const emailErr = validateEmail(f.email); if (emailErr) e.email = emailErr
    if (!f.password || f.password.length < 6) e.password = 'Senha mínima de 6 caracteres'
    return e
  }

  async function handleCriarUsuario(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    const errs = validateUsuario(usuarioForm)
    setUsuarioErrs(errs)
    if (Object.keys(errs).length > 0) return
    setSalvandoUsuario(true); setUsuarioError('')
    try {
      await api.criarUsuario(id, usuarioForm)
      setUsuarioForm({ nome: '', email: '', password: '' })
      setShowNovoUsuario(false)
      loadUsuarios()
    } catch (err) {
      setUsuarioError(err instanceof Error ? err.message : 'Erro ao criar usuário')
    } finally { setSalvandoUsuario(false) }
  }

  if (loading) return <div className={styles.page}><p style={{ color: '#94a3b8', padding: 40 }}>Carregando...</p></div>
  if (!parceiro) return <div className={styles.page}><p>Parceiro não encontrado.</p></div>

  const regras = regraEfetiva?.regras
  const saldo = regraEfetiva?.saldoCreditos ?? parceiro.saldoCreditos ?? 0
  const pedidosAFaturar = pedidos.filter(p => p.cobrancaRevenda?.situacao === 'A faturar' && p.status !== 'Cancelado')
  const exposicaoPosPago = pedidosAFaturar.reduce((a, p) => a + (p.cobrancaRevenda?.valorCobrado ?? 0), 0)
  const totalPedidos = pedidos.reduce((a, p) => a + p.valorTotal, 0)
  const pedidosAtivos = pedidos.filter(p => p.status !== 'Cancelado' && p.status !== 'Concluido')
  const pedidosFiltrados = filtroPedidoStatus === 'todos' ? pedidos : pedidos.filter(p => p.status === filtroPedidoStatus)
  const ticketMedio = pedidos.length > 0 ? totalPedidos / pedidos.length : 0

  const ABAS: { key: Aba; label: string }[] = [
    { key: 'dados',     label: 'Dados e Regras' },
    { key: 'carteira',  label: 'Carteira de Créditos' },
    { key: 'pedidos',   label: `Pedidos${pedidos.length > 0 ? ` (${pedidos.length})` : ''}` },
    { key: 'relatorio', label: 'Relatório' },
    { key: 'usuarios',  label: `Usuários${usuarios.length > 0 ? ` (${usuarios.length})` : ''}` },
  ]

  const pedidoColunas = [
    { key: 'numero', header: 'Número', render: (r: Pedido) => <strong>{r.numero}</strong> },
    {
      key: 'clienteId', header: 'Cliente',
      render: (r: Pedido) => typeof r.clienteId === 'object' ? r.clienteId.nome : '—'
    },
    { key: 'valorTotal', header: 'Valor', render: (r: Pedido) => moeda(r.valorTotal) },
    {
      key: 'cobrancaRevenda', header: 'Cobrança',
      render: (r: Pedido) => r.cobrancaRevenda
        ? <Badge label={r.cobrancaRevenda.situacao} variant={SITUACAO_VARIANT[r.cobrancaRevenda.situacao] ?? 'default'} />
        : <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>—</span>
    },
    { key: 'status', header: 'Status', render: (r: Pedido) => <Badge label={r.status} /> },
    { key: 'createdAt', header: 'Data', render: (r: Pedido) => fmt(r.createdAt) },
  ]

  return (
    <div className={styles.page}>
      <PageHeader
        title={parceiro.nome}
        subtitle={parceiro.documento}
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            {(isAdmin || user?.role === 'operador') && (
              <button className={styles.btnPrimary} onClick={openEdit}>Editar parceiro</button>
            )}
            <button className={styles.btnSecondary} onClick={() => navigate(-1)}>← Voltar</button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div className={styles.panel} style={{ margin: 0, padding: '14px 18px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Saldo de Créditos</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: saldo > 0 ? '#15803d' : '#94a3b8' }}>{moeda(saldo)}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 3 }}>
            {regras?.formaPagamento === 'Pre-pago' ? 'Pré-pago' : regras?.formaPagamento === 'Pos-pago' ? 'Pós-pago' : regras?.formaPagamento ?? '—'}
          </div>
        </div>

        {regras?.formaPagamento === 'Pos-pago' && (
          <div className={styles.panel} style={{ margin: 0, padding: '14px 18px' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Exposição Pós-pago</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: exposicaoPosPago > 0 ? '#b45309' : '#94a3b8' }}>{moeda(exposicaoPosPago)}</div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 3 }}>
              Lim: {moeda(regras.limiteCredito)} · Disp: {moeda(Math.max(0, regras.limiteCredito - exposicaoPosPago))}
            </div>
          </div>
        )}

        <div className={styles.panel} style={{ margin: 0, padding: '14px 18px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Total Pedidos</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b' }}>{pedidos.length > 0 ? moeda(totalPedidos) : '—'}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 3 }}>{pedidos.length} pedido{pedidos.length !== 1 ? 's' : ''}</div>
        </div>

        <div className={styles.panel} style={{ margin: 0, padding: '14px 18px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Em Andamento</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: pedidosAtivos.length > 0 ? '#1d4ed8' : '#94a3b8' }}>{pedidosAtivos.length}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 3 }}>pedido{pedidosAtivos.length !== 1 ? 's' : ''} ativos</div>
        </div>

        <div className={styles.panel} style={{ margin: 0, padding: '14px 18px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Ticket Médio</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b' }}>{ticketMedio > 0 ? moeda(ticketMedio) : '—'}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 3 }}>por pedido</div>
        </div>

        <div className={styles.panel} style={{ margin: 0, padding: '14px 18px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Status</div>
          <div style={{ marginTop: 2 }}>
            <Badge label={parceiro.ativo ? 'Ativo' : 'Inativo'} variant={parceiro.ativo ? 'success' : 'default'} />
          </div>
          <div style={{ marginTop: 6 }}>
            <Badge label={`NF: ${parceiro.emissorNFPadrao}`} variant={parceiro.emissorNFPadrao === 'Revendedor' ? 'info' : 'default'} />
          </div>
        </div>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, borderBottom: '1px solid var(--surface-border)' }}>
        {ABAS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setAba(key)}
            style={{
              padding: '8px 18px', background: 'none', border: 'none',
              borderBottom: aba === key ? '2px solid var(--btn-primary-bg, #0F3961)' : '2px solid transparent',
              color: aba === key ? 'var(--btn-primary-bg, #0F3961)' : 'var(--text-secondary)',
              fontWeight: aba === key ? 700 : 500, fontSize: '0.875rem',
              cursor: 'pointer', marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ABA: Dados e Regras */}
      {aba === 'dados' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>Dados Cadastrais</h3>
            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 16px', fontSize: '0.875rem' }}>
              <dt style={{ color: '#64748b', fontWeight: 600 }}>Nome</dt><dd style={{ margin: 0 }}><strong>{parceiro.nome}</strong></dd>
              <dt style={{ color: '#64748b', fontWeight: 600 }}>Documento</dt><dd style={{ margin: 0 }}>{parceiro.documento}</dd>
              <dt style={{ color: '#64748b', fontWeight: 600 }}>E-mail</dt><dd style={{ margin: 0 }}>{parceiro.email}</dd>
              {parceiro.telefone && <><dt style={{ color: '#64748b', fontWeight: 600 }}>Telefone</dt><dd style={{ margin: 0 }}>{parceiro.telefone}</dd></>}
              {parceiro.comissaoPercentual != null && (
                <><dt style={{ color: '#64748b', fontWeight: 600 }}>Comissão</dt><dd style={{ margin: 0, color: '#6d28d9', fontWeight: 700 }}>{parceiro.comissaoPercentual}%</dd></>
              )}
              <dt style={{ color: '#64748b', fontWeight: 600 }}>Emissor NF</dt><dd style={{ margin: 0 }}><Badge label={parceiro.emissorNFPadrao} /></dd>
              <dt style={{ color: '#64748b', fontWeight: 600 }}>Cadastro</dt><dd style={{ margin: 0, color: '#64748b' }}>{fmt(parceiro.createdAt)}</dd>
              {parceiro.observacoes && <><dt style={{ color: '#64748b', fontWeight: 600 }}>Obs.</dt><dd style={{ margin: 0, fontSize: '0.82rem', color: '#475569' }}>{parceiro.observacoes}</dd></>}
            </dl>
          </div>

          {regras && (
            <div className={styles.panel}>
              <h3 className={styles.panelTitle} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                Regras de Cobrança
                <Badge label={regraEfetiva?.origem === 'padrao' ? 'Padrão global' : 'Personalizada'} variant="info" />
              </h3>
              <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 16px', fontSize: '0.875rem' }}>
                <dt style={{ color: '#64748b', fontWeight: 600 }}>Forma de pagamento</dt>
                <dd style={{ margin: 0 }}>
                  <span style={{
                    fontWeight: 700,
                    color: regras.formaPagamento === 'Pre-pago' ? '#15803d' : regras.formaPagamento === 'Pos-pago' ? '#b45309' : '#1d4ed8'
                  }}>
                    {regras.formaPagamento === 'Pre-pago' ? 'Pré-pago' : regras.formaPagamento === 'Pos-pago' ? 'Pós-pago' : 'Por pedido'}
                  </span>
                </dd>
                <dt style={{ color: '#64748b', fontWeight: 600 }}>Certificados internacionais</dt>
                <dd style={{ margin: 0 }}>{regras.certificadosInternacionais}</dd>
                <dt style={{ color: '#64748b', fontWeight: 600 }}>Certificados ICP-Brasil</dt>
                <dd style={{ margin: 0 }}>{regras.certificadosIcpBrasil}</dd>
                <dt style={{ color: '#64748b', fontWeight: 600 }}>Dia de vencimento</dt>
                <dd style={{ margin: 0 }}>Dia {regras.diaVencimento}</dd>
                {regras.formaPagamento === 'Pos-pago' && (
                  <>
                    <dt style={{ color: '#64748b', fontWeight: 600 }}>Limite de crédito</dt>
                    <dd style={{ margin: 0, fontWeight: 700 }}>{moeda(regras.limiteCredito)}</dd>
                    <dt style={{ color: '#64748b', fontWeight: 600 }}>Exposição atual</dt>
                    <dd style={{ margin: 0, color: exposicaoPosPago > 0 ? '#b45309' : '#64748b', fontWeight: 600 }}>
                      {moeda(exposicaoPosPago)}
                      {regras.limiteCredito > 0 && (
                        <span style={{ marginLeft: 8, fontSize: '0.75rem', color: '#94a3b8' }}>
                          ({((exposicaoPosPago / regras.limiteCredito) * 100).toFixed(1)}% do limite)
                        </span>
                      )}
                    </dd>
                  </>
                )}
              </dl>

              {regras.formaPagamento === 'Pos-pago' && regras.limiteCredito > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', marginBottom: 4 }}>
                    <span>Utilizado</span>
                    <span>Disponível: {moeda(Math.max(0, regras.limiteCredito - exposicaoPosPago))}</span>
                  </div>
                  <div style={{ height: 8, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 999,
                      width: `${Math.min(100, (exposicaoPosPago / regras.limiteCredito) * 100)}%`,
                      background: exposicaoPosPago / regras.limiteCredito > 0.8 ? '#b91c1c' : '#b45309',
                      transition: 'width 0.3s',
                    }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ABA: Carteira */}
      {aba === 'carteira' && (
        <div className={styles.panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h3 className={styles.panelTitle} style={{ margin: 0 }}>Extrato de Créditos</h3>
              <div style={{ marginTop: 8, fontSize: '1.3rem', fontWeight: 800, color: saldo > 0 ? '#15803d' : '#94a3b8' }}>
                Saldo atual: {moeda(saldo)}
              </div>
            </div>

            {isFinanceiro && (
              <form onSubmit={handleRecarga} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  Valor (R$)
                  <input
                    type="number" min="0.01" step="0.01"
                    value={valorCredito}
                    onChange={e => setValorCredito(e.target.value)}
                    placeholder="0,00"
                    style={{ padding: '8px 12px', border: '1px solid var(--input-border)', borderRadius: 8, fontSize: '0.875rem', width: 120 }}
                  />
                </label>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  Descrição
                  <input
                    value={descricaoCredito}
                    onChange={e => setDescricaoCredito(e.target.value)}
                    placeholder="Ex: Recarga mensal"
                    style={{ padding: '8px 12px', border: '1px solid var(--input-border)', borderRadius: 8, fontSize: '0.875rem', width: 220 }}
                  />
                </label>
                <button type="submit" className={styles.btnPrimary} disabled={salvando}>
                  {salvando ? 'Adicionando...' : '+ Adicionar Créditos'}
                </button>
              </form>
            )}
          </div>

          {creditoError && <p className={styles.error}>{creditoError}</p>}

          {loadingCarteira ? (
            <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Carregando extrato...</p>
          ) : !carteira || carteira.movimentos.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', textAlign: 'center', padding: '24px 0' }}>
              Nenhuma movimentação registrada
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--surface-border)' }}>
                  {['Data', 'Tipo', 'Descrição', 'Operador', 'Saldo Anterior', 'Valor', 'Saldo Posterior'].map(h => (
                    <th key={h} style={{
                      textAlign: ['Valor', 'Saldo Anterior', 'Saldo Posterior'].includes(h) ? 'right' : 'left',
                      padding: '8px 12px', fontSize: '0.72rem', fontWeight: 700,
                      color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em'
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {carteira.movimentos.map((m, i) => {
                  const credito = m.valor >= 0
                  const operador = (m as MovimentoCreditoRevenda & { usuarioId?: { nome: string } | string }).usuarioId
                  const operadorNome = typeof operador === 'object' && operador !== null
                    ? (operador as { nome: string }).nome
                    : '—'
                  return (
                    <tr key={m._id} style={{ borderBottom: '1px solid var(--surface-border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-2, #fafbfc)' }}>
                      <td style={{ padding: '10px 12px', color: '#475569', whiteSpace: 'nowrap' }}>{fmt(m.createdAt)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                          background: m.tipo === 'Aporte' ? '#dcfce7' : m.tipo === 'Consumo' ? '#fee2e2' : m.tipo === 'Estorno' ? '#dbeafe' : '#f1f5f9',
                          color: m.tipo === 'Aporte' ? '#15803d' : m.tipo === 'Consumo' ? '#b91c1c' : m.tipo === 'Estorno' ? '#1d4ed8' : '#475569',
                        }}>
                          {m.tipo}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#374151', maxWidth: 240 }}>{m.descricao}</td>
                      <td style={{ padding: '10px 12px', color: '#64748b', fontSize: '0.8rem' }}>{operadorNome}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748b' }}>{moeda(m.saldoAnterior)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: credito ? '#15803d' : '#b91c1c' }}>
                        {credito ? '+' : ''}{moeda(m.valor)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{moeda(m.saldoPosterior)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--surface-border)', background: 'var(--surface-2, #f8fafc)' }}>
                  <td colSpan={5} style={{ padding: '10px 12px', fontWeight: 700, fontSize: '0.82rem', color: '#374151' }}>Saldo Atual</td>
                  <td colSpan={2} style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: '1rem', color: saldo >= 0 ? '#15803d' : '#b91c1c' }}>
                    {moeda(saldo)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* ABA: Pedidos */}
      {aba === 'pedidos' && (
        <div className={styles.panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <h3 className={styles.panelTitle} style={{ margin: 0 }}>Pedidos de Revenda</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {pedidos.length > 0 && (
                <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                  Total: <strong style={{ color: '#1e293b' }}>{moeda(totalPedidos)}</strong>
                  {pedidosAFaturar.length > 0 && (
                    <> · A faturar: <strong style={{ color: '#b45309' }}>{moeda(exposicaoPosPago)}</strong></>
                  )}
                </span>
              )}
              <select
                value={filtroPedidoStatus}
                onChange={e => setFiltroPedidoStatus(e.target.value)}
                style={{ padding: '6px 10px', border: '1px solid var(--input-border)', borderRadius: 8, fontSize: '0.82rem' }}
              >
                <option value="todos">Todos os status</option>
                <option value="Rascunho">Rascunho</option>
                <option value="Aprovado">Aprovado</option>
                <option value="Em processo">Em processo</option>
                <option value="Faturado">Faturado</option>
                <option value="Concluido">Concluído</option>
                <option value="Cancelado">Cancelado</option>
              </select>
            </div>
          </div>
          <Table
            columns={pedidoColunas}
            rows={pedidosFiltrados}
            loading={loadingPedidos}
            empty="Nenhum pedido vinculado a este parceiro"
            onRowClick={r => navigate(`/pedidos/${(r as Pedido)._id}`)}
          />
          {pedidosFiltrados.length > 0 && pedidosFiltrados.length !== pedidos.length && (
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 8, textAlign: 'right' }}>
              Mostrando {pedidosFiltrados.length} de {pedidos.length} pedidos
            </p>
          )}
        </div>
      )}

      {/* ABA: Relatório */}
      {aba === 'relatorio' && (
        relatorio
          ? <RelatorioRevenda dados={relatorio} loading={loadingRelatorio} />
          : loadingRelatorio
            ? <p style={{ color: '#94a3b8', fontSize: '0.875rem', padding: '24px 0' }}>Carregando relatório...</p>
            : <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <p style={{ color: '#94a3b8', marginBottom: 12 }}>Relatório não carregado</p>
                <button className={styles.btnSecondary} onClick={loadRelatorio}>Carregar</button>
              </div>
      )}

      {/* ABA: Usuários */}
      {aba === 'usuarios' && (
        <div className={styles.panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 className={styles.panelTitle} style={{ margin: 0 }}>Usuários Revenda</h3>
              <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 4 }}>
                Contas de acesso ao portal deste parceiro
              </p>
            </div>
            {isFinanceiro && (
              <button className={styles.btnPrimary} onClick={() => { setShowNovoUsuario(true); setUsuarioForm({ nome: '', email: '', password: '' }); setUsuarioErrs({}); setUsuarioError('') }}>
                + Novo Usuário
              </button>
            )}
          </div>

          {loadingUsuarios ? (
            <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Carregando...</p>
          ) : usuarios.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: 8 }}>Nenhum usuário vinculado a este parceiro</p>
              {isFinanceiro && (
                <button className={styles.btnPrimary} onClick={() => setShowNovoUsuario(true)}>
                  Criar primeiro acesso
                </button>
              )}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--surface-border)' }}>
                  {['Nome', 'E-mail', 'Status', 'Criado em'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u, i) => (
                  <tr key={u._id} style={{ borderBottom: '1px solid var(--surface-border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface-2, #fafbfc)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{u.nome}</td>
                    <td style={{ padding: '10px 12px', color: '#475569' }}>{u.email}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <Badge label={u.ativo ? 'Ativo' : 'Inativo'} variant={u.ativo ? 'success' : 'default'} />
                    </td>
                    <td style={{ padding: '10px 12px', color: '#64748b', fontSize: '0.8rem' }}>{fmt(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal: Novo usuário revenda */}
      {showNovoUsuario && (
        <Modal title="Criar Acesso Revenda" onClose={() => setShowNovoUsuario(false)}>
          <form onSubmit={handleCriarUsuario} noValidate className={styles.form}>
            <div className={styles.formGrid2}>
              <label style={{ gridColumn: 'span 2' }}>Nome *
                <input
                  value={usuarioForm.nome}
                  onChange={e => setUsuarioForm(f => ({ ...f, nome: e.target.value }))}
                  className={usuarioErrs.nome ? styles.inputError : ''}
                />
                {usuarioErrs.nome && <span className={styles.fieldError}>{usuarioErrs.nome}</span>}
              </label>
              <label>E-mail *
                <input
                  type="email"
                  value={usuarioForm.email}
                  onChange={e => setUsuarioForm(f => ({ ...f, email: e.target.value }))}
                  className={usuarioErrs.email ? styles.inputError : ''}
                />
                {usuarioErrs.email && <span className={styles.fieldError}>{usuarioErrs.email}</span>}
              </label>
              <label>Senha *
                <input
                  type="password"
                  value={usuarioForm.password}
                  onChange={e => setUsuarioForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Mínimo 6 caracteres"
                  className={usuarioErrs.password ? styles.inputError : ''}
                />
                {usuarioErrs.password && <span className={styles.fieldError}>{usuarioErrs.password}</span>}
              </label>
            </div>
            {usuarioError && <p className={styles.error}>{usuarioError}</p>}
            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowNovoUsuario(false)}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={salvandoUsuario}>
                {salvandoUsuario ? 'Criando...' : 'Criar acesso'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Editar parceiro */}
      {showEdit && (
        <Modal title="Editar Parceiro" onClose={() => setShowEdit(false)} size="lg">
          <form onSubmit={handleSaveEdit} noValidate className={styles.form}>
            <div className={styles.formGrid2}>
              <label>Nome *
                <input value={editForm.nome} onChange={e => updateEdit({ nome: e.target.value })} className={editErrs.nome ? styles.inputError : ''} />
                {editErrs.nome && <span className={styles.fieldError}>{editErrs.nome}</span>}
              </label>
              <label>Documento (CNPJ/CPF) *
                <input value={editForm.documento} onChange={e => updateEdit({ documento: e.target.value })} className={editErrs.documento ? styles.inputError : ''} />
                {editErrs.documento && <span className={styles.fieldError}>{editErrs.documento}</span>}
              </label>
              <label>E-mail *
                <input type="email" value={editForm.email} onChange={e => updateEdit({ email: e.target.value })} className={editErrs.email ? styles.inputError : ''} />
                {editErrs.email && <span className={styles.fieldError}>{editErrs.email}</span>}
              </label>
              <label>Telefone
                <input value={editForm.telefone || ''} onChange={e => updateEdit({ telefone: e.target.value })} placeholder="(48) 9 9999-9999" />
              </label>
              <label>Emissão de NF padrão
                <select value={editForm.emissorNFPadrao} onChange={e => updateEdit({ emissorNFPadrao: e.target.value as Parceiro['emissorNFPadrao'] })}>
                  <option value="XDigital">XDigital Brasil emite</option>
                  <option value="Revendedor">Revendedor emite</option>
                </select>
              </label>
              <label>Comissão (%)
                <input
                  type="number" min="0" max="100" step="0.1"
                  value={editForm.comissaoPercentual ?? ''}
                  onChange={e => updateEdit({ comissaoPercentual: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="Ex: 10"
                />
              </label>
              <label style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox"
                  checked={editForm.usarRegraCobrancaPadrao}
                  onChange={e => updateEdit({ usarRegraCobrancaPadrao: e.target.checked })}
                  style={{ width: 16, height: 16 }}
                />
                Usar a regra de cobrança padrão definida em Configurações
              </label>
              {!editForm.usarRegraCobrancaPadrao && (
                <>
                  <label>Forma de pagamento
                    <select
                      value={editForm.regrasCobranca.formaPagamento}
                      onChange={e => updateEdit({ regrasCobranca: { ...editForm.regrasCobranca, formaPagamento: e.target.value as RegraCobrancaRevenda['formaPagamento'] } })}
                    >
                      <option value="Pre-pago">Pré-pago — consome créditos</option>
                      <option value="Pos-pago">Pós-pago — gera faturamento</option>
                      <option value="Por pedido">Pagamento por pedido</option>
                    </select>
                  </label>
                  <label>Certificados internacionais
                    <select
                      value={editForm.regrasCobranca.certificadosInternacionais}
                      onChange={e => updateEdit({ regrasCobranca: { ...editForm.regrasCobranca, certificadosInternacionais: e.target.value as RegraCobrancaRevenda['certificadosInternacionais'] } })}
                    >
                      <option value="Por emissao">Cobrar por emissão</option>
                      <option value="Por pedido">Cobrar por pedido</option>
                      <option value="Fatura mensal">Consolidar em fatura mensal</option>
                    </select>
                  </label>
                  <label>Certificados ICP-Brasil
                    <select
                      value={editForm.regrasCobranca.certificadosIcpBrasil}
                      onChange={e => updateEdit({ regrasCobranca: { ...editForm.regrasCobranca, certificadosIcpBrasil: e.target.value as RegraCobrancaRevenda['certificadosIcpBrasil'] } })}
                    >
                      <option value="Por emissao">Cobrar por emissão</option>
                      <option value="Por pedido">Cobrar por pedido</option>
                      <option value="Fatura mensal">Consolidar em fatura mensal</option>
                    </select>
                  </label>
                  <label>Dia do vencimento
                    <input
                      type="number" min="1" max="28"
                      value={editForm.regrasCobranca.diaVencimento}
                      onChange={e => updateEdit({ regrasCobranca: { ...editForm.regrasCobranca, diaVencimento: Number(e.target.value) } })}
                    />
                  </label>
                  <label>Limite de crédito (R$)
                    <input
                      type="number" min="0" step="0.01"
                      value={editForm.regrasCobranca.limiteCredito}
                      onChange={e => updateEdit({ regrasCobranca: { ...editForm.regrasCobranca, limiteCredito: Number(e.target.value) } })}
                    />
                  </label>
                </>
              )}
              <label style={{ gridColumn: 'span 2' }}>Observações
                <textarea value={editForm.observacoes || ''} onChange={e => updateEdit({ observacoes: e.target.value })} rows={2} />
              </label>
              <label>Status
                <select value={editForm.ativo ? 'true' : 'false'} onChange={e => updateEdit({ ativo: e.target.value === 'true' })}>
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
              </label>
            </div>
            {editError && <p className={styles.error}>{editError}</p>}
            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowEdit(false)}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={editSaving}>{editSaving ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
