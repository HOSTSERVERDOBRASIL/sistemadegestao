import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fmtDate } from '../utils/fmt'
import PageHeader from '../components/PageHeader'
import Badge from '../components/Badge'
import Table from '../components/Table'
import Modal from '../components/Modal'
import { contratos as api, uploads, exportar } from '../api'
import type { Contrato, OrdemFornecimento, Pedido, ResumoFinanceiroContrato } from '../types'
import styles from './ContratoDetalhe.module.css'
import pageStyles from './Page.module.css'

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const TIPO_COLOR: Record<string, string> = {
  'Acréscimo':              '#15803d',
  'Supressão':              '#b91c1c',
  'Reequilíbrio Econômico': '#1d4ed8',
  'Prorrogação':            '#7c3aed',
}
const TIPO_BG: Record<string, string> = {
  'Acréscimo':              '#dcfce7',
  'Supressão':              '#fee2e2',
  'Reequilíbrio Econômico': '#dbeafe',
  'Prorrogação':            '#ede9fe',
}

function ContratoHistorico({ contrato, moeda }: { contrato: Contrato; moeda: (v: number) => string }) {
  const aditivos = contrato.aditivos ?? []

  // Monta eventos ordenados por data
  const eventos: Array<{
    tipo: 'original' | 'aditivo' | 'atual'
    data: string
    label: string
    subLabel?: string
    tipoAditivo?: string
    deltaValor?: number
    valorAcumulado: number
    vigenciaAte?: string
    motivo?: string
  }> = []

  let acumulado = contrato.valorTotal
  const vigenciaOriginal = contrato.dataFim

  eventos.push({
    tipo: 'original',
    data: contrato.dataInicio,
    label: 'Contrato Original',
    subLabel: `Início: ${fmtDate(contrato.dataInicio)}`,
    valorAcumulado: acumulado,
    vigenciaAte: vigenciaOriginal,
  })

  const sorted = [...aditivos].sort(
    (a, b) => new Date(a.dataAssinatura).getTime() - new Date(b.dataAssinatura).getTime()
  )

  for (const ad of sorted) {
    acumulado += ad.valor
    eventos.push({
      tipo: 'aditivo',
      data: ad.dataAssinatura,
      label: `Aditivo ${ad.numero}`,
      subLabel: ad.motivo,
      tipoAditivo: ad.tipo,
      deltaValor: ad.valor,
      valorAcumulado: acumulado,
      vigenciaAte: ad.vigenciaAte,
      motivo: ad.motivo,
    })
  }

  // Situação atual é o último ponto
  const vigenciaFinal = sorted.filter(a => a.vigenciaAte).at(-1)?.vigenciaAte ?? contrato.dataFim

  eventos.push({
    tipo: 'atual',
    data: '',
    label: contrato.ativo ? 'Vigente' : 'Encerrado',
    subLabel: `Vigência até ${fmtDate(vigenciaFinal)}`,
    valorAcumulado: acumulado,
    vigenciaAte: vigenciaFinal,
  })

  const valorMax = Math.max(...eventos.map(e => e.valorAcumulado), 0.01)

  return (
    <div className={pageStyles.panel} style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 className={pageStyles.panelTitle} style={{ margin: 0 }}>
          Histórico do Contrato
        </h3>
        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
          {aditivos.length} aditivo{aditivos.length !== 1 ? 's' : ''} · {sorted.filter(a => a.vigenciaAte).length} prorrogação{sorted.filter(a => a.vigenciaAte).length !== 1 ? 'ões' : ''}
        </span>
      </div>

      {/* Tabela de evolução de valor */}
      {aditivos.length > 0 && (
        <div style={{ marginBottom: 24, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border, #e2e8f0)' }}>
                <th style={{ textAlign: 'left', padding: '6px 12px', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Data</th>
                <th style={{ textAlign: 'left', padding: '6px 12px', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Evento</th>
                <th style={{ textAlign: 'left', padding: '6px 12px', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tipo</th>
                <th style={{ textAlign: 'right', padding: '6px 12px', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Variação</th>
                <th style={{ textAlign: 'right', padding: '6px 12px', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Valor Acumulado</th>
                <th style={{ textAlign: 'left', padding: '6px 12px', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vigência</th>
              </tr>
            </thead>
            <tbody>
              {eventos.filter(e => e.tipo !== 'atual').map((ev, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border, #f1f5f9)', background: i % 2 === 0 ? 'transparent' : 'var(--row-alt, #fafbfc)' }}>
                  <td style={{ padding: '10px 12px', color: '#475569', whiteSpace: 'nowrap' }}>
                    {ev.data ? fmtDate(ev.data) : '—'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <strong style={{ fontSize: '0.85rem' }}>{ev.label}</strong>
                    {ev.subLabel && ev.tipo === 'aditivo' && (
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2, maxWidth: 280 }}>{ev.subLabel}</div>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {ev.tipoAditivo ? (
                      <span style={{
                        fontSize: '0.72rem', fontWeight: 700,
                        background: TIPO_BG[ev.tipoAditivo] ?? '#f1f5f9',
                        color: TIPO_COLOR[ev.tipoAditivo] ?? '#475569',
                        padding: '2px 8px', borderRadius: 4,
                      }}>
                        {ev.tipoAditivo}
                      </span>
                    ) : (
                      ev.tipo === 'original' ? (
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, background: '#f0fdf4', color: '#15803d', padding: '2px 8px', borderRadius: 4 }}>
                          Original
                        </span>
                      ) : '—'
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {ev.deltaValor !== undefined ? (
                      <span style={{ color: ev.deltaValor >= 0 ? '#15803d' : '#b91c1c', fontWeight: 700 }}>
                        {ev.deltaValor >= 0 ? '+' : ''}{moeda(ev.deltaValor)}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <strong style={{ fontSize: '0.88rem' }}>{moeda(ev.valorAcumulado)}</strong>
                      <div style={{ width: 100, height: 4, background: 'var(--border, #e2e8f0)', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{
                          width: `${(ev.valorAcumulado / valorMax) * 100}%`,
                          height: '100%',
                          background: 'var(--btn-primary-bg, #0F3961)',
                          borderRadius: 999,
                          transition: 'width 0.3s',
                        }} />
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#475569', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    {ev.tipo === 'original'
                      ? `até ${fmtDate(contrato.dataFim)}`
                      : ev.vigenciaAte
                        ? <span style={{ color: '#7c3aed', fontWeight: 600 }}>↗ até {fmtDate(ev.vigenciaAte)}</span>
                        : 'sem alteração'
                    }
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--border, #e2e8f0)', background: 'var(--sidebar-bg-subtle, #f8fafc)' }}>
                <td colSpan={4} style={{ padding: '10px 12px', fontWeight: 700, fontSize: '0.82rem', color: '#374151' }}>Situação Atual</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: '0.92rem', color: 'var(--btn-primary-bg, #0F3961)' }}>
                  {moeda(acumulado)}
                </td>
                <td style={{ padding: '10px 12px', fontSize: '0.8rem', color: '#475569' }}>
                  até {fmtDate(vigenciaFinal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Timeline vertical */}
      <div style={{ position: 'relative', paddingLeft: 32 }}>
        <div style={{ position: 'absolute', left: 11, top: 12, bottom: 12, width: 2, background: 'var(--border, #e2e8f0)', borderRadius: 999 }} />
        {eventos.map((ev, i) => {
          const isFirst = i === 0
          const isLast = ev.tipo === 'atual'
          const dotColor = isFirst ? '#0F3961' : isLast ? (contrato.ativo ? '#15803d' : '#94a3b8') : (TIPO_COLOR[ev.tipoAditivo ?? ''] ?? '#64748b')
          return (
            <div key={i} style={{ position: 'relative', paddingBottom: isLast ? 0 : 24 }}>
              <div style={{
                position: 'absolute', left: -21, top: 2,
                width: 14, height: 14, borderRadius: '50%',
                background: dotColor, border: '2px solid #fff',
                boxShadow: `0 0 0 2px ${dotColor}`,
                zIndex: 1,
              }} />
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#1e293b' }}>{ev.label}</span>
                    {ev.tipoAditivo && (
                      <span style={{
                        fontSize: '0.68rem', fontWeight: 700,
                        background: TIPO_BG[ev.tipoAditivo] ?? '#f1f5f9',
                        color: TIPO_COLOR[ev.tipoAditivo] ?? '#475569',
                        padding: '1px 6px', borderRadius: 4,
                      }}>{ev.tipoAditivo}</span>
                    )}
                    {ev.data && (
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{fmtDate(ev.data)}</span>
                    )}
                  </div>
                  {ev.motivo && (
                    <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748b' }}>{ev.motivo}</p>
                  )}
                  {ev.subLabel && ev.tipo !== 'aditivo' && (
                    <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748b' }}>{ev.subLabel}</p>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {ev.deltaValor !== undefined && (
                    <div style={{ fontSize: '0.78rem', color: ev.deltaValor >= 0 ? '#15803d' : '#b91c1c', fontWeight: 700 }}>
                      {ev.deltaValor >= 0 ? '+' : ''}{moeda(ev.deltaValor)}
                    </div>
                  )}
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>{moeda(ev.valorAcumulado)}</div>
                  {ev.vigenciaAte && ev.tipo === 'aditivo' && (
                    <div style={{ fontSize: '0.72rem', color: '#7c3aed' }}>vigência ↗ {fmtDate(ev.vigenciaAte)}</div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function ContratoDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [ordens, setOrdens] = useState<OrdemFornecimento[]>([])
  const [pedidosVinculados, setPedidosVinculados] = useState<Pedido[]>([])
  const [resumo, setResumo] = useState<ResumoFinanceiroContrato | null>(null)
  const [loading, setLoading] = useState(true)
  const [showOrdemModal, setShowOrdemModal] = useState(false)
  const [showAditivoModal, setShowAditivoModal] = useState(false)
  const [ordemForm, setOrdemForm] = useState({ numero: '', valor: 0, dataEmissao: '', dataFim: '', observacoes: '' })
  const [aditivoForm, setAditivoForm] = useState({ numero: '', valor: 0, motivo: '', dataAssinatura: '', vigenciaAte: '', tipo: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [faturando, setFaturando] = useState(false)
  const [uploadingVersao, setUploadingVersao] = useState(false)
  const [exportando, setExportando] = useState(false)
  const versaoFileRef = useRef<HTMLInputElement>(null)

  function load() {
    if (!id) return
    setLoading(true)
    Promise.all([
      api.get(id),
      api.ordens(id),
      api.pedidos(id),
      api.resumoFinanceiro(id),
    ]).then(([c, o, p, r]) => {
      setContrato(c)
      setOrdens(o)
      setPedidosVinculados(p)
      setResumo(r)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  async function handleFaturarTotal() {
    if (!id || !contrato) return
    if (!confirm(`Faturar integralmente o contrato ${contrato.numero} por ${moeda(contrato.valorTotal)}?`)) return
    setFaturando(true)
    try {
      await api.faturarTotal(id)
      load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao faturar')
    } finally { setFaturando(false) }
  }

  async function handleUploadVersao(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !id) return
    setUploadingVersao(true)
    try {
      await uploads.versaoContrato(id, file)
      load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao enviar arquivo')
    } finally {
      setUploadingVersao(false)
      if (versaoFileRef.current) versaoFileRef.current.value = ''
    }
  }

  async function handleExportar() {
    setExportando(true)
    try { await exportar.contratos() } catch { /* silent */ } finally { setExportando(false) }
  }

  async function handleCriarOrdem(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    setSaving(true); setError('')
    try {
      await api.criarOrdem(id, ordemForm)
      setShowOrdemModal(false)
      setOrdemForm({ numero: '', valor: 0, dataEmissao: '', dataFim: '', observacoes: '' })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar OF')
    } finally { setSaving(false) }
  }

  async function handleCriarAditivo(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    setSaving(true); setError('')
    try {
      await api.criarAditivo(id, { ...aditivoForm, vigenciaAte: aditivoForm.vigenciaAte || undefined, tipo: aditivoForm.tipo || undefined })
      setShowAditivoModal(false)
      setAditivoForm({ numero: '', valor: 0, motivo: '', dataAssinatura: '', vigenciaAte: '', tipo: '' })
      load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro ao criar aditivo') }
    finally { setSaving(false) }
  }

  if (loading) return <div className={pageStyles.page}><p style={{ color: '#94a3b8', padding: 40 }}>Carregando...</p></div>
  if (!contrato) return <div className={pageStyles.page}><p>Contrato não encontrado.</p></div>

  const cliente = typeof contrato.clienteId === 'object' ? contrato.clienteId : null
  const totalComDireito = resumo?.valorTotalComDireito ?? contrato.valorTotal
  const saldo = resumo?.disponivel ?? totalComDireito - contrato.valorFaturado
  const percFaturado = totalComDireito > 0 ? Math.min(100, (contrato.valorFaturado / totalComDireito) * 100) : 0

  const ordemColumns = [
    { key: 'numero', header: 'Número', render: (r: OrdemFornecimento) => <strong>{r.numero}</strong> },
    { key: 'valor', header: 'Valor', render: (r: OrdemFornecimento) => moeda(r.valor) },
    { key: 'valorFaturado', header: 'Faturado', render: (r: OrdemFornecimento) => moeda(r.valorFaturado) },
    {
      key: 'saldoOf', header: 'Saldo',
      render: (r: OrdemFornecimento) => {
        const s = r.valor - r.valorFaturado
        return <span style={{ color: s > 0 ? '#15803d' : '#64748b', fontWeight: 600 }}>{moeda(s)}</span>
      }
    },
    { key: 'status', header: 'Status', render: (r: OrdemFornecimento) => <Badge label={r.status} /> },
    { key: 'dataFim', header: 'Vigência', render: (r: OrdemFornecimento) => r.dataFim ? `até ${fmtDate(r.dataFim)}` : 'Sem limite próprio' },
  ]

  const pedidoColumns = [
    { key: 'numero', header: 'Número', render: (r: Pedido) => <strong>{r.numero}</strong> },
    {
      key: 'clienteId', header: 'Cliente',
      render: (r: Pedido) => typeof r.clienteId === 'object' ? r.clienteId.nome : r.clienteId
    },
    { key: 'valorTotal', header: 'Valor', render: (r: Pedido) => moeda(r.valorTotal) },
    { key: 'etapaOperacional', header: 'Etapa', render: (r: Pedido) => <Badge label={r.etapaOperacional} variant="info" /> },
    { key: 'status', header: 'Status', render: (r: Pedido) => <Badge label={r.status} /> },
    { key: 'nfEmitida', header: 'NF', render: (r: Pedido) => <Badge label={r.nfEmitida ? 'Emitida' : 'Pendente'} variant={r.nfEmitida ? 'success' : 'warning'} /> },
  ]

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title={`Contrato ${contrato.numero}`}
        subtitle={`${fmtDate(contrato.dataInicio)} até ${fmtDate(contrato.dataFim)}`}
        action={
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className={pageStyles.btnSecondary} onClick={() => navigate(-1)}>← Voltar</button>
            <button className={pageStyles.btnSecondary} onClick={handleExportar} disabled={exportando}>
              {exportando ? 'Exportando...' : '⬇ CSV'}
            </button>
            {contrato.ativo && <button className={pageStyles.btnSecondary} onClick={() => { setError(''); setShowAditivoModal(true) }}>+ Aditivo</button>}
            <label className={pageStyles.btnSecondary} style={{ cursor: 'pointer' }}>
              {uploadingVersao ? 'Enviando...' : '📄 Nova Versão'}
              <input
                ref={versaoFileRef}
                type="file"
                accept=".pdf,.docx,.xlsx"
                style={{ display: 'none' }}
                onChange={handleUploadVersao}
                disabled={uploadingVersao}
              />
            </label>
            {contrato.ativo && saldo > 0 && contrato.modalidade === 'Total' && (
              <button className={pageStyles.btnPrimary} onClick={handleFaturarTotal} disabled={faturando}>
                {faturando ? 'Faturando...' : '⚡ Faturar Total'}
              </button>
            )}
          </div>
        }
      />

      <div className={styles.topGrid}>
        {/* Resumo financeiro */}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Resumo Financeiro</h3>
          <dl className={styles.dl}>
            <dt>Cliente</dt>
            <dd><strong>{cliente?.nome ?? '—'}</strong>{cliente && <><br /><span style={{ fontSize: '0.78rem', color: '#64748b' }}>{cliente.documento}</span></>}</dd>
            <dt>Modalidade</dt><dd><Badge label={contrato.modalidade} variant="info" /></dd>
            <dt>Status</dt><dd><Badge label={contrato.ativo ? 'Ativo' : 'Encerrado'} variant={contrato.ativo ? 'success' : 'default'} /></dd>
            <dt>Valor Original</dt><dd>{moeda(contrato.valorTotal)}</dd>
            <dt>Aditivos</dt><dd>{moeda(resumo?.valorAditivos ?? 0)}</dd>
            <dt>Total com Direito</dt><dd><strong>{moeda(totalComDireito)}</strong></dd>
            <dt>Reservado</dt><dd>{moeda(resumo?.reservado ?? 0)}</dd>
            <dt>Confirmado (protocolo)</dt><dd>{moeda(resumo?.confirmado ?? 0)}</dd>
            <dt>Faturado</dt><dd>{moeda(contrato.valorFaturado)}</dd>
            <dt>Saldo Disponível</dt>
            <dd><strong style={{ color: saldo > 0 ? '#15803d' : '#94a3b8' }}>{moeda(saldo)}</strong></dd>
          </dl>

          <div className={styles.progressWrap}>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${percFaturado}%` }} />
            </div>
            <span className={styles.progressLabel}>{percFaturado.toFixed(1)}% faturado</span>
          </div>
        </div>

        {/* Versões do contrato */}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Versões do Contrato</h3>
          {contrato.versoes.length === 0 ? (
            <p className={styles.empty}>Nenhuma versão registrada</p>
          ) : (
            <div className={styles.versoesList}>
              {[...contrato.versoes].reverse().map((v, i) => (
                <div key={i} className={styles.versaoItem}>
                  <div className={styles.versaoNum}>v{v.numeroVersao}</div>
                  <div className={styles.versaoMeta}>
                    <span>{fmtDate(v.data)}</span>
                    {v.arquivoUrl && (
                      <a href={v.arquivoUrl} target="_blank" rel="noreferrer" className={styles.versaoLink}>
                        Baixar arquivo ↗
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ContratoHistorico contrato={contrato} moeda={moeda} />

      {/* Ordens de Fornecimento */}
      {contrato.modalidade === 'Por Ordem de Fornecimento' && (
        <div className={pageStyles.panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 className={pageStyles.panelTitle} style={{ margin: 0 }}>
              Ordens de Fornecimento ({ordens.length})
            </h3>
            {contrato.ativo && (
              <button className={pageStyles.btnPrimary} onClick={() => setShowOrdemModal(true)}>
                + Nova OF
              </button>
            )}
          </div>
          <Table
            columns={ordemColumns}
            rows={ordens}
            empty="Nenhuma ordem de fornecimento"
          />
        </div>
      )}

      {/* Pedidos vinculados */}
      <div className={pageStyles.panel}>
        <h3 className={pageStyles.panelTitle} style={{ marginBottom: 14 }}>
          Pedidos Vinculados ({pedidosVinculados.length})
        </h3>
        <Table
          columns={pedidoColumns}
          rows={pedidosVinculados}
          onRowClick={(r) => navigate(`/pedidos/${(r as Pedido)._id}`)}
          empty="Nenhum pedido vinculado a este contrato"
        />
      </div>

      {showOrdemModal && (
        <Modal title="Nova Ordem de Fornecimento" onClose={() => setShowOrdemModal(false)} size="sm">
          <form onSubmit={handleCriarOrdem} className={pageStyles.form}>
            <label>Número da OF *
              <input required value={ordemForm.numero} onChange={e => setOrdemForm({ ...ordemForm, numero: e.target.value })} placeholder="OF-001" />
            </label>
            <label>Valor *
              <input type="number" min="1" step="0.01" required value={ordemForm.valor}
                onChange={e => setOrdemForm({ ...ordemForm, valor: Number(e.target.value) })} />
            </label>
            <label>Data de Emissão
              <input type="date" value={ordemForm.dataEmissao} onChange={e => setOrdemForm({ ...ordemForm, dataEmissao: e.target.value })} />
            </label>
            <label>Válida até
              <input type="date" max={contrato.dataFim.slice(0, 10)} value={ordemForm.dataFim} onChange={e => setOrdemForm({ ...ordemForm, dataFim: e.target.value })} />
            </label>
            <label>Observações
              <textarea rows={3} value={ordemForm.observacoes} onChange={e => setOrdemForm({ ...ordemForm, observacoes: e.target.value })} />
            </label>
            {error && <p className={pageStyles.error}>{error}</p>}
            <div className={pageStyles.formActions}>
              <button type="button" className={pageStyles.btnSecondary} onClick={() => setShowOrdemModal(false)}>Cancelar</button>
              <button type="submit" className={pageStyles.btnPrimary} disabled={saving}>{saving ? 'Criando...' : 'Criar OF'}</button>
            </div>
          </form>
        </Modal>
      )}
      {showAditivoModal && <Modal title="Novo Aditivo" onClose={() => setShowAditivoModal(false)} size="sm">
        <form onSubmit={handleCriarAditivo} className={pageStyles.form}>
          <label>Número *<input required value={aditivoForm.numero} onChange={e => setAditivoForm({ ...aditivoForm, numero: e.target.value })} /></label>
          <label>Tipo de Aditivo
            <select value={aditivoForm.tipo} onChange={e => setAditivoForm({ ...aditivoForm, tipo: e.target.value })}>
              <option value="">Selecione (opcional)</option>
              <option value="Reequilíbrio Econômico">Reequilíbrio Econômico</option>
              <option value="Acréscimo">Acréscimo</option>
              <option value="Supressão">Supressão</option>
              <option value="Prorrogação">Prorrogação</option>
            </select>
          </label>
          <label>Valor *<input required type="number" min="0.01" step="0.01" value={aditivoForm.valor} onChange={e => setAditivoForm({ ...aditivoForm, valor: Number(e.target.value) })} /></label>
          <label>Data de assinatura *<input required type="date" value={aditivoForm.dataAssinatura} onChange={e => setAditivoForm({ ...aditivoForm, dataAssinatura: e.target.value })} /></label>
          <label>Prorrogar vigência até<input type="date" value={aditivoForm.vigenciaAte} onChange={e => setAditivoForm({ ...aditivoForm, vigenciaAte: e.target.value })} /></label>
          <label>Motivo *<textarea required rows={3} value={aditivoForm.motivo} onChange={e => setAditivoForm({ ...aditivoForm, motivo: e.target.value })} /></label>
          {error && <p className={pageStyles.error}>{error}</p>}
          <div className={pageStyles.formActions}><button type="button" className={pageStyles.btnSecondary} onClick={() => setShowAditivoModal(false)}>Cancelar</button><button type="submit" className={pageStyles.btnPrimary} disabled={saving}>{saving ? 'Salvando...' : 'Criar Aditivo'}</button></div>
        </form>
      </Modal>}
    </div>
  )
}
