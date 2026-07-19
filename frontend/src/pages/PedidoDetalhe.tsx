import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import { pedidos as api, uploads, cobrancas as cobrancasApi, tiny as tinyApi } from '../api'
import type { Pedido, EtapaOperacional, Cobranca, EvidenciaTipo } from '../types'
import { useAuth } from '../context/AuthContext'
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
  const { user } = useAuth()
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
  const [enviandoClm, setEnviandoClm] = useState(false)
  const [uploadingEvidencia, setUploadingEvidencia] = useState(false)
  const [tipoEvidencia, setTipoEvidencia] = useState<EvidenciaTipo>('documento')
  const [origemEvidencia, setOrigemEvidencia] = useState('')
  const evidenciaFileRef = React.useRef<HTMLInputElement>(null)

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

  async function handleUploadEvidencia(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !id) return
    setUploadingEvidencia(true)
    try {
      await uploads.evidencia(id, tipoEvidencia, file, { origem: origemEvidencia || undefined })
      setOrigemEvidencia('')
      load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao enviar evidência')
    } finally {
      setUploadingEvidencia(false)
      if (evidenciaFileRef.current) evidenciaFileRef.current.value = ''
    }
  }

  async function handleRemoverEvidencia(evidenciaId: string) {
    if (!id || !confirm('Remover esta evidência?')) return
    try {
      await uploads.removerEvidencia(id, evidenciaId)
      load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao remover evidência')
    }
  }

  async function handleCancelarPedido() {
    if (!id || !pedido) return
    try {
      const confirmado = pedido.nfEmitida || pedido.saldoStatus === 'Confirmado'
      if (!confirm(confirmado
        ? `Solicitar cancelamento do pedido ${pedido.numero}? O saldo só voltará após aprovação manual.`
        : `Cancelar o pedido ${pedido.numero}?`)) return
      const motivo = confirmado ? prompt('Motivo do cancelamento:', '')?.trim() : ''
      if (confirmado && !motivo) return
      const r = confirmado
        ? await api.solicitarCancelamento(id, motivo!)
        : await api.cancelar(id)
      setPedido(r.pedido)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao cancelar pedido')
    }
  }

  async function handleAprovarEstorno() {
    if (!id || !confirm('Aprovar a devolução do saldo deste pedido?')) return
    try { setPedido((await api.aprovarEstorno(id)).pedido) }
    catch (err) { alert(err instanceof Error ? err.message : 'Erro ao aprovar estorno') }
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

  async function handleConfirmarProtocolo() {
    if (!id) return
    const protocolo = prompt('Informe o protocolo devolvido pelo CLM:', pedido?.protocolo ?? '')?.trim()
    if (!protocolo) return
    try { setPedido(await api.confirmarProtocolo(id, protocolo)) }
    catch (err) { alert(err instanceof Error ? err.message : 'Erro ao confirmar protocolo') }
  }

  async function handleEnviarClm() {
    if (!id || !pedido || !confirm(`Enviar o pedido ${pedido.numero} para execução técnica no CLM?`)) return
    setEnviandoClm(true)
    try {
      const result = await api.enviarClm(id)
      alert(`Pedido entregue ao CLM${result.requestId ? ` — solicitação ${result.requestId}` : ''}.`)
      load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Não foi possível enviar ao CLM')
    } finally { setEnviandoClm(false) }
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
  const ordem = typeof pedido.ordemFornecimentoId === 'object' ? pedido.ordemFornecimentoId : null
  const parceiro = typeof pedido.parceiroId === 'object' ? pedido.parceiroId : null
  const notaEmpenho = typeof pedido.notaEmpenhoId === 'object' ? pedido.notaEmpenhoId : null
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
            {!pedido.nfEmitida && pedido.status !== 'Cancelado' && (
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
            {pedido.status !== 'Cancelado' && <button className={styles.btnSecondary} onClick={handleEnviarClm} disabled={enviandoClm}>{enviandoClm ? 'Enviando...' : pedido.clm?.requestId ? 'Reenviar CLM' : 'Enviar ao CLM'}</button>}
            {pedido.status !== 'Cancelado' && <button className={styles.btnSecondary} onClick={handleConfirmarProtocolo}>✓ Protocolo CLM</button>}
            {pedido.status !== 'Cancelado' && indiceAtual < ETAPAS.length - 1 && <button className={styles.btnPrimary} onClick={() => { setNovaEtapa(ETAPAS[indiceAtual + 1]); setShowEtapa(true) }}>Avançar Etapa</button>}
            {user?.role === 'admin' && pedido.status !== 'Cancelado' && (
              <button className={styles.btnDanger} onClick={handleCancelarPedido}>Cancelar Pedido</button>
            )}
            {user?.role === 'admin' && pedido.status === 'Cancelado' && pedido.saldoStatus === 'Confirmado' && <button className={styles.btnDanger} onClick={handleAprovarEstorno}>Aprovar Estorno de Saldo</button>}
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
            <dt>Saldo</dt><dd><Badge label={pedido.saldoStatus ?? 'Reservado'} variant={pedido.saldoStatus === 'Confirmado' ? 'success' : pedido.saldoStatus === 'Estornado' ? 'danger' : 'warning'} /></dd>
            {pedido.protocolo && <><dt>Protocolo CLM</dt><dd><strong>{pedido.protocolo}</strong>{pedido.protocoloConfirmadoEm && <><br /><small>{fmt(pedido.protocoloConfirmadoEm)}</small></>}</dd></>}
          </dl>
        </div>

        {/* Vínculo */}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Vínculo</h3>
          <dl className={styles.dl}>
            <dt>Tipo</dt><dd><Badge label={pedido.vinculo.tipo} variant="default" /></dd>
            {pedido.vinculo.emissorNF && <><dt>Emissor NF</dt><dd><Badge label={pedido.vinculo.emissorNF} /></dd></>}
            {pedido.vinculo.empenho && <><dt>Empenho</dt><dd>{pedido.vinculo.empenho}</dd></>}
            {notaEmpenho && (
              <><dt>Nota de Empenho</dt><dd><strong>{notaEmpenho.numero}</strong> — {moeda((notaEmpenho as { valor?: number }).valor ?? 0)}</dd></>
            )}
            {pedido.vinculo.comprovantePagamentoAprovado && (
              <><dt>Comprovante</dt><dd><Badge label="Aprovado" variant="success" /></dd></>
            )}
            {contrato && (<><dt>Contrato</dt><dd>{contrato.numero} — {contrato.modalidade}</dd></>)}
            {ordem && (<><dt>Ordem de Fornecimento</dt><dd>{ordem.numero} — {ordem.status}</dd></>)}
          </dl>
        </div>

        {/* Execução técnica integrada ao pedido, sem abrir um módulo paralelo */}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Execução no CLM</h3>
          {pedido.clm ? <>
            <dl className={styles.dl}>
              <dt>Solicitação</dt><dd><strong>{pedido.clm.requestId || 'Aguardando confirmação'}</strong></dd>
              <dt>Status técnico</dt><dd><Badge label={pedido.clm.status || 'Enviado'} variant="info" /></dd>
              <dt>Executado</dt><dd>{pedido.clm.quantidadeExecutada ?? 0} unidade(s)</dd>
              <dt>Elegível para faturar</dt><dd>{pedido.clm.quantidadeFaturavel ?? 0} unidade(s)</dd>
              {pedido.clm.ultimoEvento && <><dt>Último evento</dt><dd>{pedido.clm.ultimoEvento}</dd></>}
              {pedido.clm.atualizadoEm && <><dt>Atualizado</dt><dd>{fmt(pedido.clm.atualizadoEm)}</dd></>}
            </dl>
            {pedido.itens.some(item => (item.quantidadeExecutada ?? 0) > 0) && <div style={{ marginTop: 14 }}>
              {pedido.itens.map(item => <div key={item._id ?? item.codigo} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid #e2e8f0', fontSize: '0.82rem' }}>
                <span>{item.codigo} — {item.nome}</span><strong>{item.quantidadeExecutada ?? 0} / {item.quantidade}</strong>
              </div>)}
            </div>}
          </> : <div>
            <p className={styles.empty}>Ainda não enviado para execução técnica.</p>
            <button className={styles.btnPrimary} onClick={handleEnviarClm} disabled={enviandoClm}>{enviandoClm ? 'Enviando...' : 'Enviar pedido ao CLM'}</button>
          </div>}
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
          {pedido.itens?.length > 0 ? (
            <div style={{ marginTop: 14 }}>
              <strong>Itens ({pedido.itens.length})</strong>
              {pedido.itens.map((item, index) => <div key={item._id ?? index} style={{ padding: '9px 0', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span>{item.codigo} — {item.nome}<br /><small>{item.quantidade} × {moeda(item.precoUnitario)}</small></span>
                <strong>{moeda(item.subtotal)}</strong>
              </div>)}
            </div>
          ) : produto && (
            <dl className={styles.dl} style={{ marginTop: 12 }}>
              <dt>Produto</dt><dd><strong>{produto.nome}</strong></dd>
              <dt>Código</dt><dd>{produto.codigo}</dd>
            </dl>
          )}
          {pedido.observacoes && <p style={{ marginTop: 14 }}><strong>Observações:</strong><br />{pedido.observacoes}</p>}
        </div>

        {/* Painel do Parceiro (só para Revenda) */}
        {parceiro && (
          <div className={styles.panel}>
            <h3 className={styles.panelTitle}>Parceiro Revendedor</h3>
            <dl className={styles.dl}>
              <dt>Nome</dt><dd><strong>{parceiro.nome}</strong></dd>
              <dt>Documento</dt><dd>{parceiro.documento}</dd>
              <dt>E-mail</dt><dd>{parceiro.email}</dd>
              {parceiro.telefone && <><dt>Telefone</dt><dd>{parceiro.telefone}</dd></>}
              <dt>Emissor NF padrão</dt>
              <dd><Badge label={parceiro.emissorNFPadrao} variant={parceiro.emissorNFPadrao === 'Revendedor' ? 'purple' : 'default'} /></dd>
              {parceiro.comissaoPercentual != null && (
                <><dt>Comissão</dt><dd style={{ color: '#6d28d9', fontWeight: 600 }}>{parceiro.comissaoPercentual}%</dd></>
              )}
              {pedido.valorRevenda && (
                <><dt>Valor Revenda</dt><dd style={{ fontWeight: 600 }}>{moeda(pedido.valorRevenda)}</dd></>
              )}
            </dl>
          </div>
        )}

        {/* Histórico de etapas */}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Histórico de Etapas</h3>
          {pedido.historicoEtapas.length === 0 ? (
            <p className={styles.empty}>Sem registros</p>
          ) : (
            <div className={styles.historico}>
              {[...pedido.historicoEtapas].reverse().map((h, i) => {
                const usuario = typeof h.usuarioId === 'object' && h.usuarioId ? (h.usuarioId as { nome?: string }).nome : null
                return (
                  <div key={i} className={styles.historicoItem}>
                    <div className={styles.historicoEtapa}><Badge label={h.etapa} variant="info" /></div>
                    <div className={styles.historicoMeta}>
                      <span className={styles.historicoData}>{fmt(h.data)}</span>
                      {usuario && <span className={styles.historicoObs} style={{ color: '#64748b' }}>por {usuario}</span>}
                      {h.observacao && <span className={styles.historicoObs}>{h.observacao}</span>}
                    </div>
                  </div>
                )
              })}
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

      {/* Evidências */}
      <div className={styles.panel} style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 className={styles.panelTitle} style={{ margin: 0 }}>
            Evidências {pedido.evidencias?.length > 0 && `(${pedido.evidencias.length})`}
          </h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={tipoEvidencia}
              onChange={e => setTipoEvidencia(e.target.value as EvidenciaTipo)}
              style={{ fontSize: '0.8rem', padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db' }}
            >
              <option value="documento">Documento</option>
              <option value="email">E-mail</option>
              <option value="imagem">Imagem</option>
              <option value="outro">Outro</option>
            </select>
            <input
              value={origemEvidencia}
              onChange={e => setOrigemEvidencia(e.target.value)}
              placeholder="Origem (ex: email atendente)"
              style={{ fontSize: '0.8rem', padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db', width: 180 }}
            />
            <label className={styles.btnUpload} style={{ fontSize: '0.8rem', padding: '5px 12px' }}>
              {uploadingEvidencia ? 'Enviando...' : '+ Evidência'}
              <input
                ref={evidenciaFileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.eml,.msg"
                style={{ display: 'none' }}
                onChange={handleUploadEvidencia}
                disabled={uploadingEvidencia}
              />
            </label>
          </div>
        </div>

        {!pedido.evidencias?.length ? (
          <p className={styles.empty}>Nenhuma evidência anexada</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pedido.evidencias.map((ev, i) => {
              const isImagem = ev.arquivoMime?.startsWith('image/')
              const isPdf = ev.arquivoMime === 'application/pdf'
              const BASE_URL = (import.meta as { env: Record<string, string> }).env.VITE_API_BASE_URL ?? ''
              const fileUrl = ev.arquivoUrl ? `${BASE_URL}${ev.arquivoUrl}` : null
              return (
                <div key={ev._id ?? i} style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#f8fafc' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <Badge label={ev.tipo} variant="info" />
                      <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>{ev.arquivoNome ?? 'Sem arquivo'}</span>
                      {ev.origem && <span style={{ fontSize: '0.75rem', color: '#64748b' }}>via {ev.origem}</span>}
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{new Date(ev.dataRegistro).toLocaleString('pt-BR')}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {fileUrl && (
                        <a href={fileUrl} target="_blank" rel="noreferrer" className={styles.btnSecondary} style={{ fontSize: '0.72rem', padding: '3px 8px', textDecoration: 'none' }}>
                          Baixar
                        </a>
                      )}
                      {user?.role === 'admin' && ev._id && (
                        <button
                          className={styles.btnDanger}
                          style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                          onClick={() => handleRemoverEvidencia(ev._id!)}
                        >✕</button>
                      )}
                    </div>
                  </div>
                  {fileUrl && isImagem && (
                    <div style={{ padding: 12, background: '#fff', textAlign: 'center' }}>
                      <img src={fileUrl} alt={ev.arquivoNome} style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 4, objectFit: 'contain' }} />
                    </div>
                  )}
                  {fileUrl && isPdf && (
                    <div style={{ padding: 0, height: 400 }}>
                      <iframe src={fileUrl} title={ev.arquivoNome} style={{ width: '100%', height: '100%', border: 'none' }} />
                    </div>
                  )}
                  {ev.observacao && (
                    <div style={{ padding: '6px 12px', fontSize: '0.8rem', color: '#475569', borderTop: '1px solid #f1f5f9' }}>
                      {ev.observacao}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

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
