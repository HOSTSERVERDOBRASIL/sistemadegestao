import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import { pedidos as api, uploads, cobrancas as cobrancasApi, tiny as tinyApi } from '../api'
import type { Pedido, EtapaOperacional, Cobranca, EvidenciaTipo } from '../types'
import { useAuth } from '../context/AuthContext'
import styles from './PedidoDetalhe.module.css'
import { fmtDateTime } from '../utils/fmt'

const ETAPAS: EtapaOperacional[] = ['Pedido', 'Pagamento', 'Validacao', 'Preparacao', 'Processamento', 'Entrega', 'Conclusao']

interface PortalToken {
  _id: string
  escopo: string
  status: string
  expiresAt: string
  acessos: number
  clienteNome: string
  clienteEmail: string
  emailEnviado: boolean
  emailEnviadoEm?: string
  geradoPorNome: string
  createdAt: string
}

interface NovoTokenForm {
  clienteEmail: string
  escopo: 'acompanhamento' | 'envio_documentos' | 'aceite' | 'formulario_icp' | 'completo'
  expiracaoHoras: number
  maxAcessos: string
  observacoes: string
  enviarEmail: boolean
}

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
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

  // ── Portal do Cliente ────────────────────────────────────────
  const [tokens, setTokens] = useState<PortalToken[]>([])
  const [tokensLoading, setTokensLoading] = useState(false)
  const [showPortalModal, setShowPortalModal] = useState(false)
  const [tokenForm, setTokenForm] = useState<NovoTokenForm>({
    clienteEmail: '',
    escopo: 'acompanhamento',
    expiracaoHoras: 72,
    maxAcessos: '',
    observacoes: '',
    enviarEmail: true,
  })
  const [tokenSaving, setTokenSaving] = useState(false)
  const [tokenErro, setTokenErro] = useState('')
  const [tokenCriado, setTokenCriado] = useState<{ url: string; expiresAt: string } | null>(null)

  // ── Domínios e Prazo ─────────────────────────────────────────
  const [salvandoPrazo, setSalvandoPrazo] = useState(false)
  const [novoDominio, setNovoDominio] = useState<Record<string, string>>({})
  const [salvandoDominio, setSalvandoDominio] = useState<Record<string, boolean>>({})

  // ── Wizard de Liberação de Cadastro ──────────────────────────
  const [showLiberacao, setShowLiberacao] = useState(false)
  const [wizardStep, setWizardStep] = useState(1)
  const [wizardEmissorNF, setWizardEmissorNF] = useState<'XDigital' | 'Revendedor'>('XDigital')
  const [wizardObs, setWizardObs] = useState('')
  const [wizardUploading, setWizardUploading] = useState<Record<string, boolean>>({})
  const [wizardUploaded, setWizardUploaded] = useState<Record<string, boolean>>({})
  const [liberando, setLiberando] = useState(false)
  const [wizardError, setWizardError] = useState('')
  const ofFileRef = React.useRef<HTMLInputElement>(null)
  const sfFileRef = React.useRef<HTMLInputElement>(null)
  const comprovanteWizardRef = React.useRef<HTMLInputElement>(null)

  async function handleWizardUpload(tipo: 'of' | 'sf' | 'comprovante', file: File) {
    if (!id) return
    setWizardUploading(p => ({ ...p, [tipo]: true }))
    try {
      if (tipo === 'comprovante') {
        await uploads.comprovante(id, file)
      } else {
        await uploads.evidencia(id, 'documento', file, { origem: tipo === 'of' ? 'Ordem de Fornecimento' : 'Solicitação de Fornecimento' })
      }
      setWizardUploaded(p => ({ ...p, [tipo]: true }))
    } catch (err) {
      setWizardError(err instanceof Error ? err.message : 'Erro no upload')
    } finally {
      setWizardUploading(p => ({ ...p, [tipo]: false }))
    }
  }

  async function handleLiberar() {
    if (!id || !pedido) return
    setLiberando(true); setWizardError('')
    try {
      await api.update(id, { vinculo: { ...pedido.vinculo, emissorNF: wizardEmissorNF } })
      await api.avancarEtapa(id, 'Pagamento', wizardObs || `Cadastro liberado — faturamento: ${wizardEmissorNF}`)
      load()
      setShowLiberacao(false)
      setWizardStep(1)
    } catch (err) {
      setWizardError(err instanceof Error ? err.message : 'Erro ao liberar pedido')
    } finally { setLiberando(false) }
  }

  function load() {
    if (!id) return
    setLoading(true)
    api.get(id).then(p => {
      setPedido(p)
      cobrancasApi.porPedido(id).then(setCobrancasPedido).catch(() => {})
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  const loadTokens = useCallback(async () => {
    if (!pedido?._id) return
    setTokensLoading(true)
    try {
      const res = await fetch(`/api/portal-admin/tokens/pedido/${pedido._id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      const json = await res.json()
      setTokens(Array.isArray(json) ? json : [])
    } finally { setTokensLoading(false) }
  }, [pedido?._id])

  useEffect(() => { loadTokens() }, [loadTokens])

  const handleCriarToken = async (e: React.FormEvent) => {
    e.preventDefault()
    setTokenSaving(true); setTokenErro(''); setTokenCriado(null)
    try {
      const res = await fetch('/api/portal-admin/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({
          pedidoId: pedido?._id,
          pedidoNumero: pedido?.numero,
          clienteId: pedido?.clienteId,
          clienteNome: (pedido?.clienteId as { nome?: string } | null)?.nome ?? '',
          clienteEmail: tokenForm.clienteEmail,
          escopo: tokenForm.escopo,
          expiracaoHoras: tokenForm.expiracaoHoras,
          maxAcessos: tokenForm.maxAcessos ? Number(tokenForm.maxAcessos) : undefined,
          observacoes: tokenForm.observacoes || undefined,
          enviarEmail: tokenForm.enviarEmail,
        })
      })
      const json = await res.json()
      if (!res.ok) { setTokenErro(json.message ?? 'Erro ao gerar token'); return }
      setTokenCriado({ url: json.url, expiresAt: json.expiresAt })
      loadTokens()
    } catch (err) {
      setTokenErro(err instanceof Error ? err.message : 'Erro ao gerar token')
    } finally { setTokenSaving(false) }
  }

  const handleRevogarToken = async (tokenId: string) => {
    if (!confirm('Revogar este link? O cliente não conseguirá mais acessar.')) return
    await fetch(`/api/portal-admin/tokens/${tokenId}/revogar`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
      body: JSON.stringify({ motivo: 'Revogado pelo operador' }),
    })
    loadTokens()
  }

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

  async function handleAtualizarPrazo(prazo: 1 | 2 | 3 | 4 | 5) {
    if (!id) return
    setSalvandoPrazo(true)
    try {
      const updated = await api.atualizarPrazo(id, prazo)
      setPedido(updated)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar prazo')
    } finally { setSalvandoPrazo(false) }
  }

  async function handleAdicionarDominio(itemId: string, tipo: 'principal' | 'adicional') {
    if (!id) return
    const val = novoDominio[`${itemId}-${tipo}`]?.trim()
    if (!val) return
    setSalvandoDominio(p => ({ ...p, [`${itemId}-${tipo}`]: true }))
    try {
      const body = tipo === 'principal'
        ? { dominioPrincipal: val }
        : { adicionar: val }
      const updated = await api.atualizarDominios(id, itemId, body)
      setPedido(updated)
      setNovoDominio(p => ({ ...p, [`${itemId}-${tipo}`]: '' }))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar domínio')
    } finally { setSalvandoDominio(p => ({ ...p, [`${itemId}-${tipo}`]: false })) }
  }

  async function handleRemoverDominio(itemId: string, dominio: string) {
    if (!id || !confirm(`Remover domínio "${dominio}"?`)) return
    setSalvandoDominio(p => ({ ...p, [`${itemId}-rem-${dominio}`]: true }))
    try {
      const updated = await api.atualizarDominios(id, itemId, { remover: dominio })
      setPedido(updated)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao remover domínio')
    } finally { setSalvandoDominio(p => ({ ...p, [`${itemId}-rem-${dominio}`]: false })) }
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

  const codigoProduto = typeof pedido.produtoId === 'object' ? (pedido.produtoId as { codigo?: string }).codigo ?? '' : ''
  const isICP = /^(ICP-|BANC-|INFOCONV-|EQUIP-)/i.test(codigoProduto)
  const maxAnos = isICP ? 3 : 5
  const prazoOpcoes = [1, 2, 3, 4, 5].filter(a => a <= maxAnos) as (1|2|3|4|5)[]

  return (
    <div className={styles.page}>
      <PageHeader
        title={`Pedido ${pedido.numero}`}
        subtitle={`Criado em ${fmtDateTime(pedido.createdAt)}`}
        action={
          <div className={styles.actions}>
            <button className={styles.btnSecondary} onClick={() => navigate(-1)}>← Voltar</button>
            {pedido.status === 'Rascunho' && (
              <button className={styles.btnSuccess} onClick={() => { setShowLiberacao(true); setWizardStep(1); setWizardError(''); setWizardUploaded({}) }}>
                ✓ Liberar Cadastro
              </button>
            )}
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
              <button
                className={styles.btnSuccess}
                onClick={handleEmitirNF}
                disabled={emitindo}
                style={
                  (pedido.etapaOperacional === 'Entrega' || pedido.etapaOperacional === 'Conclusao')
                    ? { outline: '2px solid #16a34a', outlineOffset: 2, fontWeight: 700 }
                    : undefined
                }
                title={
                  (pedido.etapaOperacional === 'Entrega' || pedido.etapaOperacional === 'Conclusao')
                    ? 'Pedido entregue — pronto para emitir NF'
                    : 'Emitir Nota Fiscal'
                }
              >
                {emitindo ? 'Emitindo...' : (pedido.etapaOperacional === 'Entrega' || pedido.etapaOperacional === 'Conclusao') ? '⚡ Emitir NF ✓' : '⚡ Emitir NF'}
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
            {pedido.protocolo && <><dt>Protocolo CLM</dt><dd><strong>{pedido.protocolo}</strong>{pedido.protocoloConfirmadoEm && <><br /><small>{fmtDateTime(pedido.protocoloConfirmadoEm)}</small></>}</dd></>}
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
              {pedido.clm.atualizadoEm && <><dt>Atualizado</dt><dd>{fmtDateTime(pedido.clm.atualizadoEm)}</dd></>}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <h3 className={styles.panelTitle} style={{ margin: 0 }}>Parceiro Revendedor</h3>
              <button className={styles.btnLink} onClick={() => navigate(`/parceiros/${typeof pedido.parceiroId === 'object' ? (pedido.parceiroId as { _id: string })._id : pedido.parceiroId}`)}>
                Ver carteira →
              </button>
            </div>
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
            {pedido.cobrancaRevenda && (() => {
              const cb = pedido.cobrancaRevenda!
              const situacaoColor: Record<string, string> = {
                'Pago com creditos': '#15803d',
                'A faturar': '#b45309',
                'Aguardando pagamento': '#1d4ed8',
                'Estornado': '#94a3b8',
              }
              const situacaoBg: Record<string, string> = {
                'Pago com creditos': '#dcfce7',
                'A faturar': '#fef3c7',
                'Aguardando pagamento': '#dbeafe',
                'Estornado': '#f1f5f9',
              }
              return (
                <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, background: situacaoBg[cb.situacao] ?? '#f8fafc', border: `1px solid ${situacaoColor[cb.situacao] ?? '#e2e8f0'}22` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Cobrança de Revenda</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: situacaoBg[cb.situacao], color: situacaoColor[cb.situacao] ?? '#64748b' }}>
                          {cb.situacao}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                          {cb.formaPagamento === 'Pre-pago' ? 'Pré-pago' : cb.formaPagamento === 'Pos-pago' ? 'Pós-pago' : 'Por pedido'}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>· {cb.modeloCertificado}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: 2 }}>Valor cobrado</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: situacaoColor[cb.situacao] ?? '#1e293b' }}>{moeda(cb.valorCobrado)}</div>
                    </div>
                  </div>
                </div>
              )
            })()}
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
                      <span className={styles.historicoData}>{fmtDateTime(h.data)}</span>
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
                  {c.pagoEm && <span className={styles.historicoObs} style={{ color: '#15803d' }}>Pago em {fmtDateTime(c.pagoEm)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Prazo de Validade ───────────────────────────────────── */}
      <div className={styles.panel} style={{ marginTop: 20 }}>
        <h3 className={styles.panelTitle}>Prazo de Validade</h3>
        <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 14px' }}>
          Período de validade contratado para os certificados deste pedido.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {prazoOpcoes.map(anos => (
            <button
              key={anos}
              disabled={salvandoPrazo || pedido.status === 'Cancelado'}
              onClick={() => handleAtualizarPrazo(anos)}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                border: pedido.prazoAnos === anos ? '2px solid #1d4ed8' : '1px solid #d1d5db',
                background: pedido.prazoAnos === anos ? '#dbeafe' : '#f8fafc',
                color: pedido.prazoAnos === anos ? '#1d4ed8' : '#374151',
                fontWeight: pedido.prazoAnos === anos ? 700 : 500,
                fontSize: '0.875rem',
                cursor: pedido.status === 'Cancelado' ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {anos} {anos === 1 ? 'ano' : 'anos'}
            </button>
          ))}
          {salvandoPrazo && <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Salvando...</span>}
          {pedido.prazoAnos && (
            <span style={{ marginLeft: 8, fontSize: '0.82rem', color: '#15803d', fontWeight: 600 }}>
              ✓ {pedido.prazoAnos} {pedido.prazoAnos === 1 ? 'ano' : 'anos'} selecionado
            </span>
          )}
        </div>
        <p style={{ fontSize: '0.73rem', color: '#94a3b8', margin: '8px 0 0' }}>
          {isICP
            ? 'Certificados ICP-Brasil, Bancários, InfoConv e Equipamento: prazo máximo de 3 anos.'
            : 'Certificados SSL: prazo de 1 a 5 anos.'}
        </p>
      </div>

      {/* ── Domínios por Item ───────────────────────────────────── */}
      {pedido.itens?.length > 0 && (
        <div className={styles.panel} style={{ marginTop: 20 }}>
          <h3 className={styles.panelTitle}>Domínios dos Certificados</h3>
          <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 18px' }}>
            Configure o domínio principal e os domínios adicionais (SAN/multidomínio) por item.
          </p>
          {pedido.itens.map(item => {
            const itemId = item._id ?? ''
            const totalDominios = (item.dominiosAdicionais?.length ?? 0) + (item.dominioPrincipal ? 1 : 0)
            return (
              <div key={itemId} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <strong style={{ fontSize: '0.9rem' }}>{item.codigo} — {item.nome}</strong>
                    <span style={{ marginLeft: 10, fontSize: '0.75rem', color: '#64748b' }}>
                      {totalDominios} domínio(s) · {item.quantidade} unidade(s)
                    </span>
                  </div>
                </div>

                {/* Domínio principal */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>
                    Domínio Principal (CN)
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      placeholder="ex: empresa.com.br"
                      value={novoDominio[`${itemId}-principal`] ?? item.dominioPrincipal ?? ''}
                      onChange={e => setNovoDominio(p => ({ ...p, [`${itemId}-principal`]: e.target.value }))}
                      disabled={pedido.status === 'Cancelado'}
                      style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: '0.85rem', fontFamily: 'monospace' }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdicionarDominio(itemId, 'principal') } }}
                    />
                    <button
                      className={styles.btnPrimary}
                      style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                      disabled={salvandoDominio[`${itemId}-principal`] || pedido.status === 'Cancelado'}
                      onClick={() => handleAdicionarDominio(itemId, 'principal')}
                    >
                      {salvandoDominio[`${itemId}-principal`] ? '...' : 'Salvar'}
                    </button>
                  </div>
                  {item.dominioPrincipal && !(novoDominio[`${itemId}-principal`]) && (
                    <div style={{ marginTop: 6, padding: '5px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, fontFamily: 'monospace', fontSize: '0.83rem', color: '#15803d' }}>
                      ✓ {item.dominioPrincipal}
                    </div>
                  )}
                </div>

                {/* Domínios adicionais */}
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>
                    Domínios Adicionais (SAN)
                  </label>
                  {(item.dominiosAdicionais?.length ?? 0) > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                      {item.dominiosAdicionais!.map(d => (
                        <span
                          key={d.dominio}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '4px 10px', borderRadius: 20,
                            background: '#eff6ff', border: '1px solid #bfdbfe',
                            fontFamily: 'monospace', fontSize: '0.8rem', color: '#1d4ed8',
                          }}
                        >
                          {d.dominio}
                          {pedido.status !== 'Cancelado' && (
                            <button
                              onClick={() => handleRemoverDominio(itemId, d.dominio)}
                              disabled={salvandoDominio[`${itemId}-rem-${d.dominio}`]}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '0.85rem', lineHeight: 1, padding: 0 }}
                              title={`Remover ${d.dominio}`}
                            >×</button>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="text"
                      placeholder="ex: www.empresa.com.br"
                      value={novoDominio[`${itemId}-adicional`] ?? ''}
                      onChange={e => setNovoDominio(p => ({ ...p, [`${itemId}-adicional`]: e.target.value }))}
                      disabled={pedido.status === 'Cancelado'}
                      style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: '0.85rem', fontFamily: 'monospace' }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdicionarDominio(itemId, 'adicional') } }}
                    />
                    <button
                      className={styles.btnSecondary}
                      style={{ fontSize: '0.8rem', padding: '6px 14px' }}
                      disabled={salvandoDominio[`${itemId}-adicional`] || pedido.status === 'Cancelado'}
                      onClick={() => handleAdicionarDominio(itemId, 'adicional')}
                    >
                      {salvandoDominio[`${itemId}-adicional`] ? '...' : '+ Adicionar'}
                    </button>
                  </div>
                  <p style={{ fontSize: '0.73rem', color: '#94a3b8', margin: '6px 0 0' }}>
                    Pressione Enter ou clique "+ Adicionar". Domínios são normalizados para minúsculas automaticamente.
                  </p>
                </div>
              </div>
            )
          })}
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
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{fmtDateTime(ev.dataRegistro)}</span>
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

      {/* ── Portal do Cliente ── */}
      <div style={{ marginTop: 24, border: '1px solid var(--surface-border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--surface-border)' }}>
          <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>🔗 Portal do Cliente</span>
          <button className={styles.btnPrimary} style={{ fontSize: '0.8rem', padding: '5px 14px' }} onClick={() => { setShowPortalModal(true); setTokenCriado(null); setTokenErro('') }}>
            + Gerar Link
          </button>
        </div>

        {tokensLoading ? (
          <p style={{ padding: '16px', color: '#64748b', fontSize: '0.85rem' }}>Carregando...</p>
        ) : tokens.length === 0 ? (
          <p style={{ padding: '16px', color: '#94a3b8', fontSize: '0.85rem' }}>Nenhum link gerado ainda.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--surface-border)' }}>
                {['Escopo', 'Status', 'Cliente / E-mail', 'Expiração', 'Acessos', 'E-mail', ''].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tokens.map(t => (
                <tr key={t._id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 12 }}>{t.escopo}</span>
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{
                      fontSize: '0.78rem', fontWeight: 600, padding: '2px 8px', borderRadius: 12,
                      background: t.status === 'ativo' ? '#f0fdf4' : '#fef2f2',
                      color: t.status === 'ativo' ? '#16a34a' : '#dc2626',
                    }}>{t.status}</span>
                  </td>
                  <td style={{ padding: '8px 12px', color: '#475569' }}>
                    <div style={{ fontSize: '0.82rem' }}>{t.clienteNome}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{t.clienteEmail}</div>
                  </td>
                  <td style={{ padding: '8px 12px', color: '#64748b', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                    {fmtDateTime(t.expiresAt)}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', color: '#64748b' }}>{t.acessos}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                    {t.emailEnviado
                      ? <span title={`Enviado em ${t.emailEnviadoEm ? fmtDateTime(t.emailEnviadoEm) : ''}`} style={{ color: '#16a34a' }}>✓</span>
                      : <span style={{ color: '#94a3b8' }}>—</span>}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    {t.status === 'ativo' && (
                      <button
                        onClick={() => handleRevogarToken(t._id)}
                        style={{ fontSize: '0.75rem', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        Revogar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modal: Gerar Link de Portal ── */}
      {showPortalModal && (
        <Modal title="Gerar Link de Portal" onClose={() => setShowPortalModal(false)}>
          {tokenCriado ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <p style={{ color: '#16a34a', fontWeight: 700, marginBottom: 8 }}>✓ Link gerado com sucesso!</p>
              <p style={{ fontSize: '0.83rem', color: '#475569', marginBottom: 16 }}>
                Copie e envie ao cliente. Este link só é exibido uma vez.
              </p>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
                <code style={{ fontSize: '0.78rem', wordBreak: 'break-all', color: '#1e40af' }}>{tokenCriado.url}</code>
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(tokenCriado.url)}
                style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '9px 20px', borderRadius: 7, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', marginBottom: 8 }}
              >
                Copiar Link
              </button>
              <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 8 }}>
                Expira em {fmtDateTime(tokenCriado.expiresAt)}
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                <button className={styles.btnSecondary} onClick={() => setShowPortalModal(false)}>Fechar</button>
                <button className={styles.btnPrimary} onClick={() => setTokenCriado(null)}>Gerar outro</button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCriarToken} className={styles.form}>
              <div className={styles.formGrid2}>
                <label style={{ gridColumn: 'span 2' }}>E-mail do cliente *
                  <input
                    type="email"
                    value={tokenForm.clienteEmail}
                    onChange={e => setTokenForm(f => ({ ...f, clienteEmail: e.target.value }))}
                    placeholder="email@cliente.com.br"
                    required
                  />
                </label>
                <label>Escopo de acesso
                  <select value={tokenForm.escopo} onChange={e => setTokenForm(f => ({ ...f, escopo: e.target.value as NovoTokenForm['escopo'] }))}>
                    <option value="acompanhamento">Acompanhamento (só visualizar)</option>
                    <option value="envio_documentos">Envio de documentos</option>
                    <option value="aceite">Aceite de proposta</option>
                    <option value="formulario_icp">Formulário ICP-Brasil</option>
                    <option value="completo">Completo (todos)</option>
                  </select>
                </label>
                <label>Expiração
                  <select value={tokenForm.expiracaoHoras} onChange={e => setTokenForm(f => ({ ...f, expiracaoHoras: Number(e.target.value) }))}>
                    <option value={24}>24 horas</option>
                    <option value={48}>48 horas</option>
                    <option value={72}>72 horas (padrão)</option>
                    <option value={168}>7 dias</option>
                    <option value={720}>30 dias</option>
                  </select>
                </label>
                <label>Máx. de acessos
                  <input type="number" min="1" value={tokenForm.maxAcessos} onChange={e => setTokenForm(f => ({ ...f, maxAcessos: e.target.value }))} placeholder="Sem limite" />
                </label>
                <label>Observações
                  <input value={tokenForm.observacoes} onChange={e => setTokenForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="Opcional" />
                </label>
                <label style={{ gridColumn: 'span 2', flexDirection: 'row', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={tokenForm.enviarEmail} onChange={e => setTokenForm(f => ({ ...f, enviarEmail: e.target.checked }))} style={{ width: 16, height: 16, accentColor: '#2563eb' }} />
                  <span style={{ fontSize: '0.85rem' }}>Enviar link por e-mail automaticamente</span>
                </label>
              </div>
              {tokenErro && <p className={styles.error}>{tokenErro}</p>}
              <div className={styles.formActions}>
                <button type="button" className={styles.btnSecondary} onClick={() => setShowPortalModal(false)}>Cancelar</button>
                <button type="submit" className={styles.btnPrimary} disabled={tokenSaving}>{tokenSaving ? 'Gerando...' : 'Gerar Link'}</button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {/* ── Wizard de Liberação de Cadastro ────────────────────── */}
      {showLiberacao && (
        <Modal title="Liberar Cadastro do Pedido" onClose={() => setShowLiberacao(false)}>
          {/* Indicador de passos */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 28, borderBottom: '1px solid var(--surface-border)' }}>
            {['Documentos', 'Faturamento', 'Confirmação'].map((label, i) => {
              const step = i + 1
              const done = wizardStep > step
              const active = wizardStep === step
              return (
                <div key={step} style={{ flex: 1, textAlign: 'center', paddingBottom: 12, borderBottom: `2px solid ${active ? 'var(--accent)' : done ? 'var(--success)' : 'transparent'}`, color: active ? 'var(--accent)' : done ? 'var(--success)' : 'var(--text-muted)', fontSize: '0.78rem', fontWeight: active ? 700 : 500 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: active ? 'var(--accent)' : done ? 'var(--success)' : 'var(--surface-2)', color: active || done ? (active ? 'var(--btn-primary-bg)' : '#fff') : 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.75rem', marginBottom: 6 }}>
                    {done ? '✓' : step}
                  </div>
                  <div>{label}</div>
                </div>
              )
            })}
          </div>

          {/* Passo 1 — Upload de documentos */}
          {wizardStep === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
                Anexe os documentos necessários para liberar o pedido. Os campos são opcionais — pule caso não se apliquem.
              </p>

              {/* Ordem de Fornecimento */}
              <div style={{ border: '1px solid var(--surface-border)', borderRadius: 10, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <strong style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>Ordem de Fornecimento (OF)</strong>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>PDF, DOCX, XLSX</div>
                  </div>
                  {wizardUploaded['of']
                    ? <span style={{ color: 'var(--success)', fontSize: '0.8rem', fontWeight: 600 }}>✓ Enviado</span>
                    : <label style={{ background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)', color: 'var(--btn-secondary-text)', padding: '6px 14px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                        {wizardUploading['of'] ? 'Enviando...' : '📎 Selecionar'}
                        <input ref={ofFileRef} type="file" accept=".pdf,.docx,.xlsx" style={{ display: 'none' }}
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleWizardUpload('of', f) }}
                          disabled={!!wizardUploading['of']} />
                      </label>
                  }
                </div>
              </div>

              {/* Solicitação de Fornecimento */}
              <div style={{ border: '1px solid var(--surface-border)', borderRadius: 10, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <strong style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>Solicitação de Fornecimento</strong>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>PDF, DOCX, XLSX</div>
                  </div>
                  {wizardUploaded['sf']
                    ? <span style={{ color: 'var(--success)', fontSize: '0.8rem', fontWeight: 600 }}>✓ Enviado</span>
                    : <label style={{ background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)', color: 'var(--btn-secondary-text)', padding: '6px 14px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                        {wizardUploading['sf'] ? 'Enviando...' : '📎 Selecionar'}
                        <input ref={sfFileRef} type="file" accept=".pdf,.docx,.xlsx" style={{ display: 'none' }}
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleWizardUpload('sf', f) }}
                          disabled={!!wizardUploading['sf']} />
                      </label>
                  }
                </div>
              </div>

              {/* Comprovante de pagamento */}
              <div style={{ border: '1px solid var(--surface-border)', borderRadius: 10, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <strong style={{ color: 'var(--text-primary)', fontSize: '0.875rem' }}>Comprovante de Pagamento</strong>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>PDF, JPG, PNG</div>
                  </div>
                  {wizardUploaded['comprovante'] || pedido.vinculo.comprovantePagamentoAprovado
                    ? <span style={{ color: 'var(--success)', fontSize: '0.8rem', fontWeight: 600 }}>✓ {pedido.vinculo.comprovantePagamentoAprovado ? 'Já aprovado' : 'Enviado'}</span>
                    : <label style={{ background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)', color: 'var(--btn-secondary-text)', padding: '6px 14px', borderRadius: 7, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                        {wizardUploading['comprovante'] ? 'Enviando...' : '📎 Selecionar'}
                        <input ref={comprovanteWizardRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleWizardUpload('comprovante', f) }}
                          disabled={!!wizardUploading['comprovante']} />
                      </label>
                  }
                </div>
              </div>

              {wizardError && <p style={{ color: 'var(--danger)', fontSize: '0.82rem', margin: 0 }}>{wizardError}</p>}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                <button style={{ background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)', color: 'var(--btn-secondary-text)', padding: '9px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' }} onClick={() => setShowLiberacao(false)}>Cancelar</button>
                <button style={{ background: 'var(--btn-primary-bg)', color: 'var(--accent)', border: 'none', padding: '9px 24px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem' }} onClick={() => { setWizardError(''); setWizardStep(2) }}>
                  Próximo →
                </button>
              </div>
            </div>
          )}

          {/* Passo 2 — Como será faturado */}
          {wizardStep === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
                Selecione quem irá emitir a Nota Fiscal para este pedido.
              </p>

              {(['XDigital', 'Revendedor'] as const).map(opt => (
                <label key={opt} onClick={() => setWizardEmissorNF(opt)} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: 18, border: `2px solid ${wizardEmissorNF === opt ? 'var(--accent)' : 'var(--surface-border)'}`, borderRadius: 12, cursor: 'pointer', background: wizardEmissorNF === opt ? 'var(--accent-muted)' : 'var(--surface-2)', transition: 'all 0.15s' }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${wizardEmissorNF === opt ? 'var(--accent)' : 'var(--text-muted)'}`, background: wizardEmissorNF === opt ? 'var(--accent)' : 'transparent', flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{opt === 'XDigital' ? 'XDigital Brasil' : 'Revendedor / Parceiro'}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                      {opt === 'XDigital'
                        ? 'A nota fiscal será emitida diretamente pela XDigital Brasil para o cliente final.'
                        : 'O parceiro revendedor emitirá a nota fiscal para o cliente. A XDigital emite para o parceiro.'}
                    </div>
                  </div>
                </label>
              ))}

              {wizardError && <p style={{ color: 'var(--danger)', fontSize: '0.82rem', margin: 0 }}>{wizardError}</p>}

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 4 }}>
                <button style={{ background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)', color: 'var(--btn-secondary-text)', padding: '9px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' }} onClick={() => setWizardStep(1)}>← Voltar</button>
                <button style={{ background: 'var(--btn-primary-bg)', color: 'var(--accent)', border: 'none', padding: '9px 24px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem' }} onClick={() => { setWizardError(''); setWizardStep(3) }}>
                  Próximo →
                </button>
              </div>
            </div>
          )}

          {/* Passo 3 — Confirmação */}
          {wizardStep === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
                Revise o resumo abaixo antes de liberar o pedido. Após a liberação, o status mudará para <strong>Aprovado</strong> e a etapa avançará para <strong>Pagamento</strong>.
              </p>

              <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Pedido</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{pedido.numero}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Cliente</span>
                  <span style={{ color: 'var(--text-primary)' }}>{typeof pedido.clienteId === 'object' ? pedido.clienteId.nome : '—'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Valor</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{moeda(pedido.valorTotal)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Emissor NF</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{wizardEmissorNF}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Documentos</span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {Object.values(wizardUploaded).filter(Boolean).length} arquivo(s) anexado(s)
                  </span>
                </div>
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Observação (opcional)
                <textarea
                  rows={3}
                  value={wizardObs}
                  onChange={e => setWizardObs(e.target.value)}
                  placeholder="Ex: Documentação verificada, cliente aprovado..."
                  style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, padding: '8px 10px', color: 'var(--input-text)', fontSize: '0.875rem', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </label>

              {wizardError && <p style={{ color: 'var(--danger)', fontSize: '0.82rem', margin: 0 }}>{wizardError}</p>}

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <button style={{ background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)', color: 'var(--btn-secondary-text)', padding: '9px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '0.875rem' }} onClick={() => setWizardStep(2)}>← Voltar</button>
                <button
                  style={{ background: liberando ? 'var(--surface-2)' : 'var(--success)', color: '#fff', border: 'none', padding: '9px 28px', borderRadius: 8, fontWeight: 700, cursor: liberando ? 'default' : 'pointer', fontSize: '0.875rem', opacity: liberando ? 0.7 : 1 }}
                  onClick={handleLiberar}
                  disabled={liberando}
                >
                  {liberando ? 'Liberando...' : '✓ Liberar Pedido'}
                </button>
              </div>
            </div>
          )}
        </Modal>
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
