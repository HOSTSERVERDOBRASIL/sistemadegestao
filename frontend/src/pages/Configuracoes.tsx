import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import Modal from '../components/Modal'
import { configuracoes as api } from '../api'
import type { ServicoConfig } from '../types'
import styles from './Page.module.css'
import cStyles from './Configuracoes.module.css'

const ICONE: Record<string, string> = {
  revendas: '🤝',
  efi:      '💳',
  tiny:     '🔗',
  olist:    '📦',
  bb:       '🏦',
  bradesco: '🏦',
  serpro:   '🏛️',
  clm:      '🔐',
}

const STATUS_LABEL: Record<string, { label: string; cor: string }> = {
  ok:      { label: 'Configurado',   cor: '#15803d' },
  parcial: { label: 'Incompleto',    cor: '#b45309' },
  vazio:   { label: 'Não configurado', cor: '#b91c1c' },
}

export default function Configuracoes() {
  const [servicos, setServicos] = useState<ServicoConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState<ServicoConfig | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [mostrarSecrets, setMostrarSecrets] = useState<Set<string>>(new Set())
  const [acao, setAcao] = useState('')
  const [certArquivo, setCertArquivo] = useState<File | null>(null)
  const [uploadandoCert, setUploadandoCert] = useState(false)
  const [webhookEfi, setWebhookEfi] = useState<{ configurado: boolean; webhookUrl?: string; criacao?: string } | null>(null)

  function carregar() {
    setLoading(true)
    api.listar()
      .then(setServicos)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    carregar()
    api.consultarWebhookEfi().then(setWebhookEfi).catch(() => null)
  }, [])

  function abrirEdicao(s: ServicoConfig) {
    const inicial: Record<string, string> = {}
    for (const c of s.campos) {
      inicial[c.key] = c.secret ? '' : c.valor
    }
    setForm(inicial)
    setEditando(s)
    setErro('')
    setSucesso('')
    setMostrarSecrets(new Set())
  }

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    if (!editando) return
    const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim() !== ''))
    if (Object.keys(payload).length === 0) {
      setErro('Preencha pelo menos um campo para salvar.')
      return
    }
    setSalvando(true); setErro(''); setSucesso('')
    try {
      await api.atualizar(editando.id, payload)
      setSucesso('Salvo com sucesso.')
      carregar()
      setTimeout(() => { setEditando(null); setSucesso('') }, 1200)
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally { setSalvando(false) }
  }

  function toggleSecret(key: string) {
    setMostrarSecrets(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function verificar(servico: string) {
    setAcao(`status:${servico}`)
    try {
      const status = await api.status(servico)
      const detalhes = Object.entries(status)
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join('\n')
      alert(`Status da integração\n\n${detalhes}`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Não foi possível verificar a integração')
    } finally {
      setAcao('')
    }
  }

  async function handleUploadCert() {
    if (!certArquivo) return
    setUploadandoCert(true); setErro(''); setSucesso('')
    try {
      const r = await api.uploadCertificadoEfi(certArquivo)
      setSucesso(`Certificado ${r.arquivo} salvo com segurança (${(r.tamanho / 1024).toFixed(1)} KB)`)
      setCertArquivo(null)
      carregar()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao enviar certificado')
    } finally { setUploadandoCert(false) }
  }

  async function registrarWebhook() {
    if (!confirm('Registrar na Efí a URL de webhook configurada? A API precisa estar acessível por HTTPS.')) return
    setAcao('webhook:efi')
    try {
      const result = await api.registrarWebhookEfi()
      alert(result.message)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Não foi possível registrar o webhook')
    } finally {
      setAcao('')
    }
  }

  if (loading) return <div className={styles.page} style={{ color: '#64748b' }}>Carregando...</div>

  return (
    <div className={styles.page}>
      <PageHeader
        title="Configurações"
        subtitle="Gerencie integrações, credenciais e regras comerciais"
      />

      <div className={cStyles.grid}>
        {servicos.map(s => {
          const st = STATUS_LABEL[s.status]
          const configurados = s.campos.filter(c => c.configurado).length
          return (
            <div key={s.id} className={cStyles.card}>
              <div className={cStyles.cardHeader}>
                <span className={cStyles.icone}>{ICONE[s.id] ?? '⚙️'}</span>
                <div className={cStyles.cardInfo}>
                  <h3 className={cStyles.cardTitle}>{s.label}</h3>
                  <span className={cStyles.cardStatus} style={{ color: st.cor }}>
                    ● {st.label} — {configurados}/{s.total} campos
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button className={styles.btnSecondary} onClick={() => verificar(s.id)} disabled={acao !== ''}>
                    {acao === `status:${s.id}` ? 'Verificando...' : 'Verificar'}
                  </button>
                  {s.id === 'efi' && (
                    <>
                      <button className={styles.btnSecondary} onClick={registrarWebhook} disabled={acao !== ''}>
                        {acao === 'webhook:efi' ? 'Registrando...' : 'Registrar webhook'}
                      </button>
                      {webhookEfi && (
                        <span style={{ fontSize: '0.72rem', color: webhookEfi.configurado ? '#15803d' : '#94a3b8', alignSelf: 'center' }}>
                          {webhookEfi.configurado ? `✔ webhook ativo` : '○ webhook não registrado'}
                        </span>
                      )}
                    </>
                  )}
                  <button className={styles.btnPrimary} onClick={() => abrirEdicao(s)}>
                    Editar
                  </button>
                </div>
              </div>

              <div className={cStyles.camposList}>
                {s.campos.map(c => (
                  <div key={c.key} className={cStyles.campoRow}>
                    <span className={cStyles.campoLabel}>{c.label}</span>
                    <span className={cStyles.campoValor} style={{ color: c.configurado ? '#374151' : '#94a3b8' }}>
                      {c.configurado
                        ? c.valor
                        : 'não configurado'}
                    </span>
                    <span className={`${cStyles.dot} ${c.configurado ? cStyles.dotOk : cStyles.dotVazio}`} />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {editando && (
        <Modal title={`Editar — ${editando.label}`} onClose={() => setEditando(null)} size="md">
          <form onSubmit={handleSalvar} className={styles.form}>
            <p className={cStyles.hint}>
              Deixe um campo em branco para manter o valor atual. Os valores são aplicados imediatamente.
            </p>

            {editando.campos.map(c => (
              <label key={c.key}>
                <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {c.label}
                  {c.configurado && (
                    <span style={{ fontSize: '0.7rem', color: '#15803d', fontWeight: 600 }}>
                      ✓ já configurado
                    </span>
                  )}
                </span>
                <div className={cStyles.inputWrap}>
                  {c.type === 'select' ? (
                    <select
                      value={form[c.key] ?? ''}
                      onChange={e => setForm(prev => ({ ...prev, [c.key]: e.target.value }))}
                    >
                      <option value="">{c.configurado ? 'Manter valor atual' : 'Selecione...'}</option>
                      {c.options?.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={c.secret && !mostrarSecrets.has(c.key) ? 'password' : (c.type ?? 'text')}
                      placeholder={c.configurado ? '(manter atual)' : (c.placeholder ?? '')}
                      value={form[c.key] ?? ''}
                      onChange={e => setForm(prev => ({ ...prev, [c.key]: e.target.value }))}
                      autoComplete="off"
                    />
                  )}
                  {c.secret && (
                    <button
                      type="button"
                      className={cStyles.eyeBtn}
                      onClick={() => toggleSecret(c.key)}
                      tabIndex={-1}
                    >
                      {mostrarSecrets.has(c.key) ? '🙈' : '👁'}
                    </button>
                  )}
                </div>
              </label>
            ))}

            {/* Upload do certificado .p12 — só aparece no card Efi */}
            {editando.id === 'efi' && (
              <div className={cStyles.certBox}>
                <span className={cStyles.certLabel}>Certificado .p12 (PIX)</span>
                <p className={cStyles.hint} style={{ margin: '2px 0 8px' }}>
                  Baixe o certificado no painel Efi → API → Certificados e faça upload aqui.
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="file"
                    accept=".p12,.pfx"
                    onChange={e => setCertArquivo(e.target.files?.[0] ?? null)}
                  />
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    disabled={!certArquivo || uploadandoCert}
                    onClick={handleUploadCert}
                  >
                    {uploadandoCert ? 'Enviando...' : 'Enviar certificado'}
                  </button>
                </div>
                {certArquivo && (
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>📎 {certArquivo.name}</span>
                )}
              </div>
            )}

            {erro && <p className={styles.error}>{erro}</p>}
            {sucesso && <p style={{ color: '#15803d', fontSize: '0.85rem', margin: 0 }}>{sucesso}</p>}

            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setEditando(null)}>
                Cancelar
              </button>
              <button type="submit" className={styles.btnPrimary} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
