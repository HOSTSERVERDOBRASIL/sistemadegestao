import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Badge from '../components/Badge'
import Table from '../components/Table'
import StatCard from '../components/StatCard'
import RelatorioRevenda from '../components/RelatorioRevenda'
import { parceiros as parceiroApi } from '../api'
import type { MovimentoCreditoRevenda, Pedido, RegraCobrancaRevenda, RelatorioRevenda as RelatorioRevendaType } from '../types'
import { useAuth } from '../context/AuthContext'
import styles from './Page.module.css'
import { fmtDate } from '../utils/fmt'

type Aba = 'visao-geral' | 'carteira' | 'pedidos' | 'relatorio'

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function badgeTipoCredito(tipo: MovimentoCreditoRevenda['tipo']): 'success' | 'danger' | 'info' | 'default' {
  if (tipo === 'Aporte') return 'success'
  if (tipo === 'Consumo') return 'danger'
  if (tipo === 'Estorno') return 'info'
  return 'default'
}
function badgeCobranca(situacao: string): 'success' | 'warning' | 'info' | 'default' {
  if (situacao === 'Pago com creditos') return 'success'
  if (situacao === 'A faturar') return 'warning'
  if (situacao === 'Aguardando pagamento') return 'info'
  return 'default'
}

interface CreditosData { saldo: number; movimentos: MovimentoCreditoRevenda[] }
interface RegrasData { origem: string; regras: RegraCobrancaRevenda; saldoCreditos: number }

const ABAS: { key: Aba; label: string }[] = [
  { key: 'visao-geral', label: 'Visão Geral' },
  { key: 'carteira',    label: 'Carteira de Créditos' },
  { key: 'pedidos',     label: 'Meus Pedidos' },
  { key: 'relatorio',   label: 'Relatório de Consumo' },
]

export default function PortalRevenda() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const parceiroId = user?.parceiroId

  const abaParam = (searchParams.get('aba') ?? 'visao-geral') as Aba
  const aba = ABAS.some(a => a.key === abaParam) ? abaParam : 'visao-geral'

  function setAba(a: Aba) { setSearchParams({ aba: a }) }

  const [saldo, setSaldo] = useState(0)
  const [movimentos, setMovimentos] = useState<MovimentoCreditoRevenda[]>([])
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [regras, setRegras] = useState<RegrasData | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [relatorio, setRelatorio] = useState<RelatorioRevendaType | null>(null)
  const [loadingRelatorio, setLoadingRelatorio] = useState(false)
  const [relatorioCarregado, setRelatorioCarregado] = useState(false)

  const carregar = useCallback(async () => {
    if (!parceiroId) return
    setLoading(true); setErro(null)
    try {
      const [creditos, peds, reg] = await Promise.all([
        parceiroApi.creditos(parceiroId) as Promise<CreditosData>,
        parceiroApi.pedidos(parceiroId),
        parceiroApi.regrasCobranca(parceiroId) as Promise<RegrasData>,
      ])
      setSaldo(creditos.saldo)
      setMovimentos(creditos.movimentos)
      setPedidos(peds)
      setRegras(reg)
    } catch { setErro('Erro ao carregar dados da revenda.') }
    finally { setLoading(false) }
  }, [parceiroId])

  const carregarRelatorio = useCallback(async () => {
    if (!parceiroId) return
    setLoadingRelatorio(true)
    try {
      const r = await parceiroApi.relatorio(parceiroId)
      setRelatorio(r); setRelatorioCarregado(true)
    } catch { setRelatorio(null) }
    finally { setLoadingRelatorio(false) }
  }, [parceiroId])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (aba === 'relatorio' && !relatorioCarregado) carregarRelatorio()
  }, [aba])

  if (!parceiroId) {
    return (
      <div className={styles.page}>
        <PageHeader title="Portal da Revenda" subtitle="Sua conta e relatórios" />
        <div className={styles.panel}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Conta não vinculada a uma revenda. Contate o administrador.
          </p>
        </div>
      </div>
    )
  }

  const pedidosAtivos = pedidos.filter(p => p.status !== 'Cancelado' && p.status !== 'Concluido')
  const totalPedidos = pedidos.reduce((s, p) => s + p.valorTotal, 0)
  const nfsEmitidas = pedidos.filter(p => p.nfEmitida).length
  const pedidosAFaturar = pedidos.filter(p => p.cobrancaRevenda?.situacao === 'A faturar')
  const valorAFaturar = pedidosAFaturar.reduce((s, p) => s + (p.cobrancaRevenda?.valorCobrado ?? 0), 0)

  const colsCreditos = [
    { key: 'createdAt', header: 'Data', render: (r: MovimentoCreditoRevenda) => fmtDate(r.createdAt) },
    { key: 'tipo', header: 'Tipo', render: (r: MovimentoCreditoRevenda) => <Badge label={r.tipo} variant={badgeTipoCredito(r.tipo)} /> },
    { key: 'descricao', header: 'Descrição', render: (r: MovimentoCreditoRevenda) => <span style={{ fontSize: '0.82rem' }}>{r.descricao}</span> },
    { key: 'saldoAnterior', header: 'Saldo anterior', render: (r: MovimentoCreditoRevenda) => <span style={{ color: '#64748b' }}>{moeda(r.saldoAnterior)}</span> },
    {
      key: 'valor', header: 'Valor',
      render: (r: MovimentoCreditoRevenda) => (
        <strong style={{ color: r.valor >= 0 ? '#15803d' : '#b91c1c' }}>
          {r.valor >= 0 ? '+' : ''}{moeda(r.valor)}
        </strong>
      ),
    },
    { key: 'saldoPosterior', header: 'Saldo após', render: (r: MovimentoCreditoRevenda) => <strong>{moeda(r.saldoPosterior)}</strong> },
  ]

  const colsPedidos = [
    { key: 'numero', header: 'Número', render: (p: Pedido) => <strong>{p.numero}</strong> },
    { key: 'clienteId', header: 'Cliente', render: (p: Pedido) => typeof p.clienteId === 'object' ? p.clienteId.nome : '—' },
    { key: 'valorTotal', header: 'Valor', render: (p: Pedido) => moeda(p.valorTotal) },
    { key: 'status', header: 'Status', render: (p: Pedido) => <Badge label={p.status} /> },
    { key: 'nfEmitida', header: 'NF', render: (p: Pedido) => <Badge label={p.nfEmitida ? 'Emitida' : 'Pendente'} variant={p.nfEmitida ? 'success' : 'warning'} /> },
    {
      key: 'cobrancaRevenda', header: 'Cobrança',
      render: (p: Pedido) => p.cobrancaRevenda
        ? <Badge label={p.cobrancaRevenda.situacao} variant={badgeCobranca(p.cobrancaRevenda.situacao)} />
        : <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>—</span>,
    },
    { key: 'createdAt', header: 'Data', render: (p: Pedido) => fmtDate(p.createdAt) },
  ]

  return (
    <div className={styles.page}>
      <PageHeader
        title="Portal da Revenda"
        subtitle={user?.nome}
      />

      {erro && <p className={styles.error}>{erro}</p>}

      {/* Abas */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid var(--surface-border)' }}>
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
            {key === 'pedidos' && pedidos.length > 0 && (
              <span style={{ marginLeft: 6, fontSize: '0.7rem', background: 'var(--surface-border)', padding: '1px 6px', borderRadius: 10 }}>
                {pedidos.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ABA: Visão Geral */}
      {aba === 'visao-geral' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <StatCard label="Saldo de Créditos" value={loading ? '—' : moeda(saldo)} accent />
            <StatCard label="Pedidos Ativos" value={loading ? '—' : pedidosAtivos.length} />
            <StatCard label="Total Faturado" value={loading ? '—' : moeda(totalPedidos)} />
            {valorAFaturar > 0 && <StatCard label="A Faturar" value={loading ? '—' : moeda(valorAFaturar)} />}
            <StatCard label="NFs Emitidas" value={loading ? '—' : nfsEmitidas} />
          </div>

          {regras && (
            <div className={styles.panel}>
              <h3 className={styles.panelTitle}>Minhas Regras Comerciais</h3>
              <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 20px', fontSize: '0.875rem' }}>
                <dt style={{ color: '#64748b', fontWeight: 600 }}>Forma de pagamento</dt>
                <dd style={{ margin: 0, fontWeight: 700, color: regras.regras.formaPagamento === 'Pre-pago' ? '#15803d' : regras.regras.formaPagamento === 'Pos-pago' ? '#b45309' : '#1d4ed8' }}>
                  {regras.regras.formaPagamento === 'Pre-pago' ? 'Pré-pago' : regras.regras.formaPagamento === 'Pos-pago' ? 'Pós-pago' : 'Por pedido'}
                </dd>
                <dt style={{ color: '#64748b', fontWeight: 600 }}>Certificados ICP-Brasil</dt>
                <dd style={{ margin: 0 }}>{regras.regras.certificadosIcpBrasil}</dd>
                <dt style={{ color: '#64748b', fontWeight: 600 }}>Certificados internacionais</dt>
                <dd style={{ margin: 0 }}>{regras.regras.certificadosInternacionais}</dd>
                {regras.regras.formaPagamento === 'Pos-pago' && (
                  <>
                    <dt style={{ color: '#64748b', fontWeight: 600 }}>Limite de crédito</dt>
                    <dd style={{ margin: 0, fontWeight: 700 }}>{moeda(regras.regras.limiteCredito)}</dd>
                  </>
                )}
                <dt style={{ color: '#64748b', fontWeight: 600 }}>Vencimento</dt>
                <dd style={{ margin: 0 }}>Dia {regras.regras.diaVencimento} de cada mês</dd>
              </dl>
            </div>
          )}

          {/* últimas 5 movimentações */}
          {movimentos.length > 0 && (
            <div className={styles.panel} style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 className={styles.panelTitle} style={{ margin: 0 }}>Últimas Movimentações</h3>
                <button className={styles.btnLink} onClick={() => setAba('carteira')}>Ver extrato completo →</button>
              </div>
              {movimentos.slice(0, 5).map(m => (
                <div key={m._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--surface-border)' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Badge label={m.tipo} variant={badgeTipoCredito(m.tipo)} />
                    <span style={{ fontSize: '0.82rem', color: '#374151' }}>{m.descricao}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong style={{ color: m.valor >= 0 ? '#15803d' : '#b91c1c', fontSize: '0.875rem' }}>
                      {m.valor >= 0 ? '+' : ''}{moeda(m.valor)}
                    </strong>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{fmtDate(m.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* últimos 5 pedidos */}
          {pedidos.length > 0 && (
            <div className={styles.panel} style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 className={styles.panelTitle} style={{ margin: 0 }}>Pedidos Recentes</h3>
                <button className={styles.btnLink} onClick={() => setAba('pedidos')}>Ver todos →</button>
              </div>
              {pedidos.slice(0, 5).map(p => {
                const cliente = typeof p.clienteId === 'object' ? p.clienteId.nome : '—'
                return (
                  <div
                    key={p._id}
                    onClick={() => navigate(`/pedidos/${p._id}`)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--surface-border)', cursor: 'pointer' }}
                  >
                    <div>
                      <strong style={{ fontSize: '0.82rem' }}>{p.numero}</strong>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{cliente}</div>
                    </div>
                    <div style={{ textAlign: 'right', display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{moeda(p.valorTotal)}</span>
                      <Badge label={p.status} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ABA: Carteira */}
      {aba === 'carteira' && (
        <div className={styles.panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 className={styles.panelTitle} style={{ margin: 0 }}>Extrato de Créditos</h3>
              <div style={{ marginTop: 6, fontSize: '1.2rem', fontWeight: 800, color: saldo > 0 ? '#15803d' : '#94a3b8' }}>
                Saldo atual: {moeda(saldo)}
              </div>
            </div>
          </div>
          <Table<MovimentoCreditoRevenda>
            columns={colsCreditos}
            rows={movimentos}
            keyField="_id"
            loading={loading}
            empty="Nenhuma movimentação registrada"
          />
        </div>
      )}

      {/* ABA: Pedidos */}
      {aba === 'pedidos' && (
        <div className={styles.panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 className={styles.panelTitle} style={{ margin: 0 }}>Meus Pedidos</h3>
            {pedidos.length > 0 && (
              <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                Total: <strong>{moeda(totalPedidos)}</strong>
                {valorAFaturar > 0 && <> · A faturar: <strong style={{ color: '#b45309' }}>{moeda(valorAFaturar)}</strong></>}
              </span>
            )}
          </div>
          <Table<Pedido>
            columns={colsPedidos}
            rows={pedidos}
            keyField="_id"
            loading={loading}
            empty="Nenhum pedido encontrado"
            onRowClick={p => navigate(`/pedidos/${p._id}`)}
          />
        </div>
      )}

      {/* ABA: Relatório */}
      {aba === 'relatorio' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className={styles.btnSecondary} onClick={carregarRelatorio} disabled={loadingRelatorio} style={{ fontSize: '0.8rem' }}>
              {loadingRelatorio ? 'Atualizando...' : 'Atualizar relatório'}
            </button>
          </div>
          {relatorio
            ? <RelatorioRevenda dados={relatorio} loading={loadingRelatorio} />
            : <p style={{ color: '#94a3b8', fontSize: '0.875rem', padding: '24px 0' }}>
                {loadingRelatorio ? 'Carregando relatório...' : 'Relatório indisponível'}
              </p>
          }
        </>
      )}
    </div>
  )
}
