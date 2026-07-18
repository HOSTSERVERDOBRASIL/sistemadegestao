import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Badge from '../components/Badge'
import Table from '../components/Table'
import Modal from '../components/Modal'
import { contratos as api, uploads, exportar } from '../api'
import type { Contrato, OrdemFornecimento, Pedido } from '../types'
import styles from './ContratoDetalhe.module.css'
import pageStyles from './Page.module.css'

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmt(d: string) {
  return new Date(d).toLocaleDateString('pt-BR')
}

export default function ContratoDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [ordens, setOrdens] = useState<OrdemFornecimento[]>([])
  const [pedidosVinculados, setPedidosVinculados] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [showOrdemModal, setShowOrdemModal] = useState(false)
  const [ordemForm, setOrdemForm] = useState({ numero: '', valor: 0 })
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
    ]).then(([c, o, p]) => {
      setContrato(c)
      setOrdens(o)
      setPedidosVinculados(p)
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
      setOrdemForm({ numero: '', valor: 0 })
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar OF')
    } finally { setSaving(false) }
  }

  if (loading) return <div className={pageStyles.page}><p style={{ color: '#94a3b8', padding: 40 }}>Carregando...</p></div>
  if (!contrato) return <div className={pageStyles.page}><p>Contrato não encontrado.</p></div>

  const cliente = typeof contrato.clienteId === 'object' ? contrato.clienteId : null
  const saldo = contrato.valorTotal - contrato.valorFaturado
  const percFaturado = contrato.valorTotal > 0 ? Math.min(100, (contrato.valorFaturado / contrato.valorTotal) * 100) : 0

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
    { key: 'createdAt', header: 'Criada em', render: (r: OrdemFornecimento) => fmt(r.createdAt) },
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
        subtitle={`${fmt(contrato.dataInicio)} até ${fmt(contrato.dataFim)}`}
        action={
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className={pageStyles.btnSecondary} onClick={() => navigate(-1)}>← Voltar</button>
            <button className={pageStyles.btnSecondary} onClick={handleExportar} disabled={exportando}>
              {exportando ? 'Exportando...' : '⬇ CSV'}
            </button>
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
            {contrato.ativo && saldo > 0 && (
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
            <dt>Valor Total</dt><dd><strong>{moeda(contrato.valorTotal)}</strong></dd>
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
                    <span>{fmt(v.data)}</span>
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
            {error && <p className={pageStyles.error}>{error}</p>}
            <div className={pageStyles.formActions}>
              <button type="button" className={pageStyles.btnSecondary} onClick={() => setShowOrdemModal(false)}>Cancelar</button>
              <button type="submit" className={pageStyles.btnPrimary} disabled={saving}>{saving ? 'Criando...' : 'Criar OF'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
