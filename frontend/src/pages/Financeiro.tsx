import { useEffect, useState, useCallback } from 'react'
import PageHeader from '../components/PageHeader'
import Table from '../components/Table'
import Badge from '../components/Badge'
import Pagination from '../components/Pagination'
import StatCard from '../components/StatCard'
import Modal from '../components/Modal'
import { financeiro as api, exportar } from '../api'
import type { NotaFiscal } from '../types'
import styles from './Page.module.css'
import fStyles from './Financeiro.module.css'

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmt(d: string) {
  return new Date(d).toLocaleDateString('pt-BR')
}

export default function Financeiro() {
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [rows, setRows] = useState<NotaFiscal[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState<string[]>([])
  const [filtroEmissor, setFiltroEmissor] = useState<string[]>([])
  const [filtroTipoFat, setFiltroTipoFat] = useState<string[]>([])
  const [resumo, setResumo] = useState<{ notasEmitidas: number; totalFaturado: number; pedidosFaturados: number; notasPendentes: number } | null>(null)
  const [conciliacao, setConciliacao] = useState<{
    por_emissor: { _id: string; total: number; quantidade: number }[]
    por_mes: { _id: { ano: number; mes: number }; total: number; quantidade: number }[]
  } | null>(null)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelNota, setCancelNota] = useState<NotaFiscal | null>(null)
  const [cancelObs, setCancelObs] = useState('')
  const [canceling, setCanceling] = useState(false)
  const [error, setError] = useState('')
  const [retentando, setRetentando] = useState<string | null>(null)
  const [baixando, setBaixando] = useState<string | null>(null)
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [exportando, setExportando] = useState(false)
  const [showAvulsa, setShowAvulsa] = useState(false)
  const [avulsaForm, setAvulsaForm] = useState({ numero: '', valor: '', emissor: 'XDigital' as 'XDigital' | 'Revendedor', tipoFaturamento: '' as '' | 'Total' | 'Demanda' | 'Fechamento', descricao: '', observacoes: '' })
  const [savingAvulsa, setSavingAvulsa] = useState(false)
  const [avulsaError, setAvulsaError] = useState('')

  function toggle(arr: string[], val: string): string[] {
    if (!val) return []
    return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
  }

  const loadNotas = useCallback(() => {
    setLoading(true)
    api.notas({
      page,
      status: filtroStatus.length > 0 ? filtroStatus.join(',') : undefined,
      emissor: filtroEmissor.length > 0 ? filtroEmissor.join(',') : undefined,
      tipoFaturamento: filtroTipoFat.length > 0 ? filtroTipoFat.join(',') : undefined,
    })
      .then(res => { setRows(res.data); setTotal(res.total) })
      .finally(() => setLoading(false))
  }, [page, filtroStatus, filtroEmissor, filtroTipoFat])

  const loadResumo = useCallback(() => {
    Promise.all([
      api.resumo({ dataInicio: dataInicio || undefined, dataFim: dataFim || undefined }),
      api.conciliacao({ dataInicio: dataInicio || undefined, dataFim: dataFim || undefined }),
    ]).then(([r, c]) => { setResumo(r); setConciliacao(c) })
  }, [dataInicio, dataFim])

  useEffect(() => { loadNotas() }, [loadNotas])
  useEffect(() => { loadResumo() }, [loadResumo])

  async function handleExportar() {
    setExportando(true)
    const params: Record<string, string> = {}
    if (filtroStatus.length > 0) params.status = filtroStatus.join(',')
    if (filtroEmissor.length > 0) params.emissor = filtroEmissor.join(',')
    if (dataInicio) params.dataInicio = dataInicio
    if (dataFim) params.dataFim = dataFim
    try { await exportar.notas(params) } catch { /* silent */ } finally { setExportando(false) }
  }

  async function handleRetentar(nota: NotaFiscal) {
    setRetentando(nota._id)
    try {
      const r = await api.retentar(nota._id)
      if (r.ok) {
        loadNotas(); loadResumo()
      } else {
        alert(`Erro SEFAZ: ${r.erro ?? 'falha desconhecida'}`)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao retentar emissão')
    } finally { setRetentando(null) }
  }

  async function handleDownload(nota: NotaFiscal, tipo: 'pdf' | 'xml') {
    setBaixando(`${nota._id}-${tipo}`)
    try {
      if (tipo === 'pdf') await api.downloadPdf(nota._id)
      else await api.downloadXml(nota._id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao baixar arquivo')
    } finally { setBaixando(null) }
  }

  async function handleCriarAvulsa(e: React.FormEvent) {
    e.preventDefault()
    setAvulsaError('')
    const valor = parseFloat(avulsaForm.valor.replace(',', '.'))
    if (!avulsaForm.numero.trim()) return setAvulsaError('Número da NF é obrigatório')
    if (isNaN(valor) || valor <= 0) return setAvulsaError('Valor deve ser maior que zero')
    setSavingAvulsa(true)
    try {
      await api.criarAvulsa({
        numero: avulsaForm.numero.trim(),
        valor,
        emissor: avulsaForm.emissor,
        tipoFaturamento: avulsaForm.tipoFaturamento || undefined,
        descricao: avulsaForm.descricao.trim() || undefined,
        observacoes: avulsaForm.observacoes.trim() || undefined,
      })
      setShowAvulsa(false)
      setAvulsaForm({ numero: '', valor: '', emissor: 'XDigital', tipoFaturamento: '', descricao: '', observacoes: '' })
      loadNotas(); loadResumo()
    } catch (err) {
      setAvulsaError(err instanceof Error ? err.message : 'Erro ao criar nota')
    } finally { setSavingAvulsa(false) }
  }

  async function handleCancelar(e: React.FormEvent) {
    e.preventDefault()
    if (!cancelNota) return
    setCanceling(true); setError('')
    try {
      await api.cancelarNota(cancelNota._id, cancelObs)
      setShowCancelModal(false); setCancelNota(null); setCancelObs('')
      loadNotas(); loadResumo()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro')
    } finally { setCanceling(false) }
  }

  const columns = [
    { key: 'numero', header: 'Número NF', render: (r: NotaFiscal) => <strong>{r.numero}</strong> },
    {
      key: 'pedidoId', header: 'Pedido',
      render: (r: NotaFiscal) => typeof r.pedidoId === 'object' ? (r.pedidoId as { numero?: string }).numero ?? '—' : r.pedidoId
    },
    { key: 'valor', header: 'Valor', render: (r: NotaFiscal) => moeda(r.valor) },
    { key: 'emissor', header: 'Emissor', render: (r: NotaFiscal) => <Badge label={r.emissor} /> },
    {
      key: 'tipoFaturamento', header: 'Tipo Fat.',
      render: (r: NotaFiscal) => {
        if (!r.tipoFaturamento) return <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>—</span>
        const map: Record<string, 'info' | 'success' | 'warning'> = { Total: 'info', Demanda: 'success', Fechamento: 'warning' }
        return <Badge label={r.tipoFaturamento} variant={map[r.tipoFaturamento] ?? 'default'} />
      }
    },
    { key: 'status', header: 'Status', render: (r: NotaFiscal) => <Badge label={r.status} /> },
    { key: 'createdAt', header: 'Data', render: (r: NotaFiscal) => fmt(r.createdAt) },
    {
      key: 'situacaoTiny', header: 'SEFAZ',
      render: (r: NotaFiscal) => {
        if (!r.situacaoTiny) return <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>—</span>
        const map: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
          Autorizada: 'success', Erro: 'danger', Rascunho: 'warning', Cancelada: 'default',
        }
        return <Badge label={r.situacaoTiny} variant={map[r.situacaoTiny] ?? 'default'} />
      }
    },
    {
      key: '_actions', header: '', width: '210px',
      render: (r: NotaFiscal) => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {r.situacaoTiny === 'Autorizada' && (
            <>
              <button
                className={styles.btnSecondary}
                style={{ fontSize: '0.72rem', padding: '3px 7px' }}
                disabled={baixando === `${r._id}-pdf`}
                onClick={e => { e.stopPropagation(); handleDownload(r, 'pdf') }}
                title="Baixar DANFE/PDF"
              >
                {baixando === `${r._id}-pdf` ? '...' : 'PDF'}
              </button>
              <button
                className={styles.btnSecondary}
                style={{ fontSize: '0.72rem', padding: '3px 7px' }}
                disabled={baixando === `${r._id}-xml`}
                onClick={e => { e.stopPropagation(); handleDownload(r, 'xml') }}
                title="Baixar XML NF-e"
              >
                {baixando === `${r._id}-xml` ? '...' : 'XML'}
              </button>
            </>
          )}
          {(r.situacaoTiny === 'Erro' || r.situacaoTiny === 'Rascunho' || (!r.situacaoTiny && r.status === 'Pendente')) && r.status !== 'Cancelada' && (
            <button
              className={styles.btnSecondary}
              style={{ fontSize: '0.72rem', padding: '3px 7px', color: '#7c3aed', borderColor: '#c4b5fd' }}
              disabled={retentando === r._id}
              onClick={e => { e.stopPropagation(); handleRetentar(r) }}
              title="Retentar emissão SEFAZ"
            >
              {retentando === r._id ? '...' : '↺ Retentar'}
            </button>
          )}
          {r.situacaoTiny === 'Erro' && r.erroEmissao && (
            <span
              title={r.erroEmissao}
              style={{ fontSize: '0.7rem', color: '#b91c1c', cursor: 'help', alignSelf: 'center' }}
            >⚠</span>
          )}
          {r.status !== 'Cancelada' && (
            <button
              className={styles.btnDanger}
              style={{ fontSize: '0.72rem', padding: '3px 7px' }}
              onClick={e => { e.stopPropagation(); setCancelNota(r); setShowCancelModal(true) }}
            >Cancelar</button>
          )}
        </div>
      )
    },
  ]

  return (
    <div className={styles.page}>
      <PageHeader
        title="Financeiro"
        subtitle="Notas Fiscais e conciliação"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className={styles.btnPrimary} onClick={() => { setAvulsaError(''); setShowAvulsa(true) }}>
              + NF Avulsa
            </button>
            <button className={styles.btnSecondary} onClick={handleExportar} disabled={exportando}>
              {exportando ? 'Exportando...' : '⬇ Notas CSV'}
            </button>
          </div>
        }
      />

      <div className={fStyles.dateFilters}>
        <label>De<input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} /></label>
        <label>Até<input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} /></label>
        <button className={styles.btnSecondary} onClick={() => { setDataInicio(''); setDataFim('') }}>Limpar</button>
      </div>

      <div className={fStyles.resumoCards}>
        <StatCard label="Notas Emitidas" value={resumo?.notasEmitidas ?? '—'} />
        <StatCard label="Total Faturado" value={resumo ? moeda(resumo.totalFaturado) : '—'} accent />
        <StatCard label="Pedidos Faturados" value={resumo?.pedidosFaturados ?? '—'} />
        <StatCard label="NFs Pendentes" value={resumo?.notasPendentes ?? '—'} sub="aguardando emissão" />
      </div>

      {conciliacao && (
        <div className={fStyles.concilGrid}>
          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>Por Emissor</h3>
            {conciliacao.por_emissor.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Sem dados</p> : (
              <table className={fStyles.concilTable}>
                <thead><tr><th>Emissor</th><th>Qtde</th><th>Total</th></tr></thead>
                <tbody>
                  {conciliacao.por_emissor.map(r => (
                    <tr key={r._id}><td><Badge label={r._id} /></td><td>{r.quantidade}</td><td>{moeda(r.total)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>Por Mês</h3>
            {conciliacao.por_mes.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Sem dados</p> : (
              <table className={fStyles.concilTable}>
                <thead><tr><th>Mês/Ano</th><th>Qtde</th><th>Total</th></tr></thead>
                <tbody>
                  {conciliacao.por_mes.map(r => (
                    <tr key={`${r._id.ano}-${r._id.mes}`}>
                      <td>{String(r._id.mes).padStart(2, '0')}/{r._id.ano}</td>
                      <td>{r.quantidade}</td>
                      <td><strong>{moeda(r.total)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <div className={styles.panel}>
        <h3 className={styles.panelTitle}>Notas Fiscais</h3>
        <div className={styles.filters} style={{ marginBottom: 16 }}>
          <div className={styles.chipRow}>
            <span className={styles.chipLabel}>Status:</span>
            {[{ v: '', l: 'Todos' }, { v: 'Emitida', l: 'Emitida' }, { v: 'Pendente', l: 'Pendente' }, { v: 'Cancelada', l: 'Cancelada' }].map(({ v, l }) => (
              <button key={v} className={`${styles.chip} ${v === '' ? filtroStatus.length === 0 ? styles.chipActive : '' : filtroStatus.includes(v) ? styles.chipActive : ''}`} onClick={() => { setFiltroStatus(toggle(filtroStatus, v)); setPage(1) }}>{l}</button>
            ))}
          </div>
          <div className={styles.chipRow}>
            <span className={styles.chipLabel}>Emissor:</span>
            {[{ v: '', l: 'Todos' }, { v: 'XDigital', l: 'XDigital' }, { v: 'Revendedor', l: 'Revendedor' }].map(({ v, l }) => (
              <button key={v} className={`${styles.chip} ${v === '' ? filtroEmissor.length === 0 ? styles.chipActive : '' : filtroEmissor.includes(v) ? styles.chipActive : ''}`} onClick={() => { setFiltroEmissor(toggle(filtroEmissor, v)); setPage(1) }}>{l}</button>
            ))}
          </div>
          <div className={styles.chipRow}>
            <span className={styles.chipLabel}>Tipo Fat.:</span>
            {[{ v: '', l: 'Todos' }, { v: 'Total', l: 'Total' }, { v: 'Demanda', l: 'Por Demanda' }, { v: 'Fechamento', l: 'Fechamento' }].map(({ v, l }) => (
              <button key={v} className={`${styles.chip} ${v === '' ? filtroTipoFat.length === 0 ? styles.chipActive : '' : filtroTipoFat.includes(v) ? styles.chipActive : ''}`} onClick={() => { setFiltroTipoFat(toggle(filtroTipoFat, v)); setPage(1) }}>{l}</button>
            ))}
          </div>
        </div>
        <Table columns={columns} rows={rows} loading={loading} empty="Nenhuma nota encontrada" />
        <Pagination page={page} total={total} limit={20} onChange={setPage} />
      </div>

      {showAvulsa && (
        <Modal title="Emitir NF Avulsa" onClose={() => setShowAvulsa(false)} size="sm">
          <form onSubmit={handleCriarAvulsa} className={styles.form}>
            <label>Número da NF *
              <input value={avulsaForm.numero} onChange={e => setAvulsaForm(f => ({ ...f, numero: e.target.value }))} placeholder="Ex: 00001234" autoFocus />
            </label>
            <label>Valor (R$) *
              <input type="number" step="0.01" min="0.01" value={avulsaForm.valor} onChange={e => setAvulsaForm(f => ({ ...f, valor: e.target.value }))} placeholder="0,00" />
            </label>
            <label>Emissor *
              <select value={avulsaForm.emissor} onChange={e => setAvulsaForm(f => ({ ...f, emissor: e.target.value as 'XDigital' | 'Revendedor' }))}>
                <option value="XDigital">XDigital</option>
                <option value="Revendedor">Revendedor</option>
              </select>
            </label>
            <label>Tipo de Faturamento
              <select value={avulsaForm.tipoFaturamento} onChange={e => setAvulsaForm(f => ({ ...f, tipoFaturamento: e.target.value as '' | 'Total' | 'Demanda' | 'Fechamento' }))}>
                <option value="">Não classificado</option>
                <option value="Total">Total (faturamento único do contrato)</option>
                <option value="Demanda">Por Demanda (certificados por solicitação)</option>
                <option value="Fechamento">Fechamento (quantitativo mensal)</option>
              </select>
            </label>
            <label>Descrição
              <input value={avulsaForm.descricao} onChange={e => setAvulsaForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Descrição dos serviços (opcional)" />
            </label>
            <label>Observações
              <textarea value={avulsaForm.observacoes} onChange={e => setAvulsaForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} placeholder="Observações internas (opcional)" />
            </label>
            {avulsaError && <p className={styles.error}>{avulsaError}</p>}
            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowAvulsa(false)}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={savingAvulsa}>{savingAvulsa ? 'Emitindo...' : 'Emitir NF'}</button>
            </div>
          </form>
        </Modal>
      )}

      {showCancelModal && cancelNota && (
        <Modal title="Cancelar Nota Fiscal" onClose={() => { setShowCancelModal(false); setCancelNota(null) }} size="sm">
          <form onSubmit={handleCancelar} className={styles.form}>
            <p style={{ color: '#374151', fontSize: '0.875rem', margin: 0 }}>
              Cancelar NF <strong>{cancelNota.numero}</strong> — {moeda(cancelNota.valor)}?
            </p>
            <label>Motivo do cancelamento
              <textarea value={cancelObs} onChange={e => setCancelObs(e.target.value)} rows={3} />
            </label>
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowCancelModal(false)}>Voltar</button>
              <button type="submit" className={styles.btnDanger} disabled={canceling}>{canceling ? 'Cancelando...' : 'Confirmar Cancelamento'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
