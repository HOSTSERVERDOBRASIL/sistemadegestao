import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import { pedidos as api, uploads, cobrancas as cobrancasApi, tiny as tinyApi } from '../api'
import type { Pedido, EtapaOperacional, Cobranca } from '../types'
import styles from './PedidoDetalhe.module.css'

const ETAPAS: EtapaOperacional[] = ['Pedido', 'Pagamento', 'Validacao', 'Preparacao', 'Processamento', 'Entrega', 'Conclusao']

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmt(d: string) {
  return new Date(d).toLocaleString('pt-BR')
}

export default function PedidoDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [loading, setLoading] = useState(true)
  const [showEtapa, setShowEtapa] = useState(false)
  const [novaEtapa, setNovaEtapa] = useState<EtapaOperacional>('Pedido')
  const [observacao, setObservacao] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [emitindo, setEmitindo] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [cobrancasPedido, setCobrancasPedido] = useState<Cobranca[]>([])
  const [gerandoPix, setGerandoPix] = useState(false)
  const [syncingTiny, setSyncingTiny] = useState(false)

  function load() {
    if (!id) return
    setLoading(true)
    api.get(id).then(p => {
      setPedido(p)
      cobrancasApi.porPedido(id).then(setCobrancasPedido).catch(() => {})
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  async function handleGerarPix() {
    if (!id || !pedido) return
    setGerandoPix(true)
    try {
      const c = await cobrancasApi.criarPix({ pedidoId: id })
      setCobrancasPedido(prev => [c, ...prev])
      alert(`PIX gerado!\nCopia e Cola: ${c.pixCopiaECola ?? 'verifique o painel de Cobranças'}`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao gerar PIX')
    } finally { setGerandoPix(false) }
  }

  async function handleSyncTiny() {
    if (!id) return
    setSyncingTiny(true)
    try {
      const r = await tinyApi.sincronizarPedido(id)
      alert(r.message)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao sincronizar com Tiny')
    } finally { setSyncingTiny(false) }
  }

  async function handleAvancarEtapa(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    setSaving(true); setError('')
    try {
      const updated = await api.avancarEtapa(id, novaEtapa, observacao)
      setPedido(updated); setShowEtapa(false); setObservacao('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro')
    } finally { setSaving(false) }
  }

  async function handleUploadComprovante(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !id) return
    setUploading(true)
    try {
      await uploads.comprovante(id, file)
      load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao enviar comprovante')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleEmitirNF() {
    if (!id || !pedido) return
    if (!confirm('Confirmar emissão da Nota Fiscal?')) return
    setEmitindo(true)
    try {
      await api.emitirNF(id)
      load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao emitir NF')
    } finally { setEmitindo(false) }
  }

  if (loading) return <div className={styles.page}><p className={styles.loading}>Carregando...</p></div>
  if (!pedido) return <div className={styles.page}><p>Pedido não encontrado.</p></div>

  const cliente = typeof pedido.clienteId === 'object' ? pedido.clienteId : null
  const produto = typeof pedido.produtoId === 'object' ? pedido.produtoId : null
  const contrato = typeof pedido.contratoId === 'object' ? pedido.contratoId : null
  const indiceAtual = ETAPAS.indexOf(pedido.etapaOperacional)

  return (
    <div className={styles.page}>
      <PageHeader
        title={`Pedido ${pedido.numero}`}
        subtitle={`Criado em ${fmt(pedido.createdAt)}`}
        action={
          <div className={styles.actions}>
            <button className={styles.btnSecondary} onClick={() => navigate(-1)}>← Voltar</button>
            <label className={styles.btnUpload} title="Enviar comprovante de pagamento">
              {uploading ? 'Enviando...' : '📎 Comprovante'}
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.xlsx,.docx"
                style={{ display: 'none' }}
                onChange={handleUploadComprovante}
                disabled={uploading}
              />
            </label>
            {!pedido.nfEmitida && (
              <button className={styles.btnSuccess} onClick={handleEmitirNF} disabled={emitindo}>
                {emitindo ? 'Emitindo...' : '⚡ Emitir NF'}
              </button>
            )}
            <button className={styles.btnSecondary} onClick={handleGerarPix} disabled={gerandoPix}>
              {gerandoPix ? 'Gerando...' : '⚡ Gerar PIX'}
            </button>
            <button className={styles.btnSecondary} onClick={handleSyncTiny} disabled={syncingTiny} title="Sincronizar com Tiny/Olist">
              {syncingTiny ? 'Sync...' : '🔄 Tiny'}
            </button>
            <button className={styles.btnPrimary} onClick={() => { setNovaEtapa(ETAPAS[indiceAtual + 1] || pedido.etapaOperacional); setShowEtapa(true) }}>
              Avançar Etapa
            </button>
          </div>
        }
      />

      {/* Timeline de etapas */}
      <div className={styles.timeline}>
        {ETAPAS.map((etapa, i) => {
          const done = i < indiceAtual
          const current = i === indiceAtual
          return (
            <div key={etapa} className={`${styles.timelineStep} ${done ? styles.done : ''} ${current ? styles.current : ''}`}>
              <div className={styles.timelineDot}>{done ? '✓' : i + 1}</div>
              <span className={styles.timelineLabel}>{etapa}</span>
              {i < ETAPAS.length - 1 && <div className={styles.timelineLine} />}
            </div>
          )
        })}
      </div>

      <div className={styles.grid}>
        {/* Resumo */}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Resumo</h3>
          <dl className={styles.dl}>
            <dt>Status</dt><dd><Badge label={pedido.status} /></dd>
            <dt>Etapa</dt><dd><Badge label={pedido.etapaOperacional} variant="info" /></dd>
            <dt>Valor Total</dt><dd><strong>{moeda(pedido.valorTotal)}</strong></dd>
            <dt>Valor Tabela</dt><dd>{moeda(pedido.valorTabela)}</dd>
            {pedido.valorRevenda && <><dt>Valor Revenda</dt><dd>{moeda(pedido.valorRevenda)}</dd></>}
            {pedido.cupomCodigo && (
              <>
                <dt>Cupom</dt>
                <dd>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, background: '#fef3c7', color: '#92400e', padding: '2px 7px', borderRadius: 4 }}>
                    {pedido.cupomCodigo}
                  </span>
                </dd>
                <dt>Desconto</dt>
                <dd style={{ color: '#16a34a', fontWeight: 600 }}>
                  {pedido.descontoValor ? `-${moeda(pedido.descontoValor)}` : ''}
                  {pedido.descontoPercentual ? ` (${pedido.descontoPercentual.toFixed(1)}%)` : ''}
                </dd>
              </>
            )}
            <dt>NF</dt><dd><Badge label={pedido.nfEmitida ? 'Emitida' : 'Pendente'} /></dd>
          </dl>
        </div>

        {/* Vínculo */}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Vínculo</h3>
          <dl className={styles.dl}>
            <dt>Tipo</dt><dd><Badge label={pedido.vinculo.tipo} variant="default" /></dd>
            {pedido.vinculo.emissorNF && <><dt>Emissor NF</dt><dd><Badge label={pedido.vinculo.emissorNF} /></dd></>}
            {pedido.vinculo.empenho && <><dt>Empenho</dt><dd>{pedido.vinculo.empenho}</dd></>}
            {pedido.vinculo.sf && <><dt>SF</dt><dd>{pedido.vinculo.sf}</dd></>}
            {contrato && (<><dt>Contrato</dt><dd>{contrato.numero} — {contrato.modalidade}</dd></>)}
          </dl>
        </div>

        {/* Cliente / Produto */}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Cliente & Produto</h3>
          {cliente && (
            <dl className={styles.dl}>
              <dt>Cliente</dt><dd><strong>{cliente.nome}</strong></dd>
              <dt>Documento</dt><dd>{cliente.documento}</dd>
              <dt>E-mail</dt><dd>{cliente.email}</dd>
            </dl>
          )}
          {produto && (
            <dl className={styles.dl} style={{ marginTop: 12 }}>
              <dt>Produto</dt><dd><strong>{produto.nome}</strong></dd>
              <dt>Código</dt><dd>{produto.codigo}</dd>
            </dl>
          )}
        </div>

        {/* Histórico de etapas */}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Histórico de Etapas</h3>
          {pedido.historicoEtapas.length === 0 ? (
            <p className={styles.empty}>Sem registros</p>
          ) : (
            <div className={styles.historico}>
              {[...pedido.historicoEtapas].reverse().map((h, i) => (
                <div key={i} className={styles.historicoItem}>
                  <div className={styles.historicoEtapa}><Badge label={h.etapa} variant="info" /></div>
                  <div className={styles.historicoMeta}>
                    <span className={styles.historicoData}>{fmt(h.data)}</span>
                    {h.observacao && <span className={styles.historicoObs}>{h.observacao}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cobranças Efi */}
      {cobrancasPedido.length > 0 && (
        <div className={styles.panel} style={{ marginTop: 20 }}>
          <h3 className={styles.panelTitle}>Cobranças Efi Bank ({cobrancasPedido.length})</h3>
          <div className={styles.historico}>
            {cobrancasPedido.map(c => (
              <div key={c._id} className={styles.historicoItem}>
                <div className={styles.historicoEtapa}>
                  <Badge label={c.tipo.toUpperCase()} variant="info" />
                </div>
                <div className={styles.historicoMeta}>
                  <span className={styles.historicoData}>{moeda(c.valor)}</span>
                  <span className={styles.historicoObs}>
                    <Badge label={c.status === 'CONCLUIDA' ? 'Pago' : c.status === 'ATIVA' ? 'Aguardando' : 'Cancelado'}
                      variant={c.status === 'CONCLUIDA' ? 'success' : c.status === 'ATIVA' ? 'warning' : 'danger'} />
                  </span>
                  {c.pagoEm && <span className={styles.historicoObs} style={{ color: '#15803d' }}>Pago em {fmt(c.pagoEm)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showEtapa && (
        <Modal title="Avançar Etapa Operacional" onClose={() => setShowEtapa(false)} size="sm">
          <form onSubmit={handleAvancarEtapa} className={styles.form}>
            <label>Nova Etapa *
              <select value={novaEtapa} onChange={e => setNovaEtapa(e.target.value as EtapaOperacional)}>
                {ETAPAS.slice(indiceAtual + 1).map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </label>
            <label>Observação
              <textarea value={observacao} onChange={e => setObservacao(e.target.value)} rows={3} />
            </label>
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowEtapa(false)}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving ? 'Salvando...' : 'Confirmar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
