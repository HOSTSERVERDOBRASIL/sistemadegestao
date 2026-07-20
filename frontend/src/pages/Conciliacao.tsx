import { useEffect, useState, useCallback } from 'react'
import { fmtDate } from '../utils/fmt'
import PageHeader from '../components/PageHeader'
import Table from '../components/Table'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import { conciliacao as api, pedidos as pedidosApi } from '../api'
import type { LancamentoBancario, ConciliacaoResumo, Pedido } from '../types'
import styles from './Page.module.css'
import cStyles from './Conciliacao.module.css'

function moeda(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

const STATUS_BADGE: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'default' | 'info' }> = {
  pendente:    { label: 'Pendente',    variant: 'warning' },
  conciliado:  { label: 'Conciliado',  variant: 'success' },
  ignorado:    { label: 'Ignorado',    variant: 'default' },
}
const BANCO_COR: Record<string, string> = {
  BB: '#f8e71c', Bradesco: '#cc0000', Manual: '#64748b', Efi: '#7c3aed',
}

type Aba = 'lancamentos' | 'resumo'

export default function Conciliacao() {
  const [aba, setAba]       = useState<Aba>('lancamentos')
  const [lancamentos, setLancamentos] = useState<LancamentoBancario[]>([])
  const [total, setTotal]   = useState(0)
  const [page, setPage]     = useState(1)
  const [loading, setLoading] = useState(false)
  const [resumo, setResumo] = useState<ConciliacaoResumo | null>(null)

  // Filtros
  const [fBanco, setFBanco]   = useState<string[]>([])
  const [fStatus, setFStatus] = useState<string[]>(['pendente'])
  const [fTipo, setFTipo]     = useState<string[]>([])
  const [fDataInicio, setFDataInicio] = useState('')
  const [fDataFim, setFDataFim]       = useState('')

  // Modais
  const [modalManual, setModalManual]   = useState(false)
  const [modalOfx, setModalOfx]         = useState(false)
  const [modalBB, setModalBB]           = useState(false)
  const [modalBradesco, setModalBradesco] = useState(false)
  const [modalConciliar, setModalConciliar] = useState<LancamentoBancario | null>(null)

  // Form manual
  const [fmBanco, setFmBanco]       = useState('Manual')
  const [fmTipo, setFmTipo]         = useState('credito')
  const [fmValor, setFmValor]       = useState('')
  const [fmData, setFmData]         = useState('')
  const [fmDesc, setFmDesc]         = useState('')
  const [fmDoc, setFmDoc]           = useState('')
  const [fmTxid, setFmTxid]         = useState('')
  const [fmObs, setFmObs]           = useState('')
  const [fmArquivo, setFmArquivo]   = useState<File | null>(null)
  const [saving, setSaving]         = useState(false)
  const [erro, setErro]             = useState('')
  const [sucesso, setSucesso]       = useState('')

  // Form OFX
  const [ofxBanco, setOfxBanco]     = useState('BB')
  const [ofxArquivo, setOfxArquivo] = useState<File | null>(null)

  // Form BB/Bradesco
  const [bbInicio, setBbInicio]     = useState('')
  const [bbFim, setBbFim]           = useState('')
  const [brInicio, setBrInicio]     = useState('')
  const [brFim, setBrFim]           = useState('')

  // Conciliar
  const [conciliarBusca, setConciliarBusca] = useState('')
  const [conciliarPedidos, setConciliarPedidos] = useState<Pedido[]>([])
  const [conciliarComprovante, setConciliarComprovante] = useState<File | null>(null)

  function toggle(arr: string[], val: string): string[] {
    if (!val) return []
    return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
  }

  const carregar = useCallback(() => {
    setLoading(true)
    api.lancamentos({
      banco: fBanco.length > 0 ? fBanco.join(',') : undefined,
      status: fStatus.length > 0 ? fStatus.join(',') : undefined,
      tipo: fTipo.length > 0 ? fTipo.join(',') : undefined,
      dataInicio: fDataInicio, dataFim: fDataFim, page, limit: 30,
    })
      .then(r => { setLancamentos(r.data); setTotal(r.total) })
      .finally(() => setLoading(false))
  }, [fBanco, fStatus, fTipo, fDataInicio, fDataFim, page])

  useEffect(() => { if (aba === 'lancamentos') carregar() }, [carregar, aba])
  useEffect(() => {
    if (aba === 'resumo') api.resumo({ dataInicio: fDataInicio, dataFim: fDataFim }).then(setResumo).catch(() => {})
  }, [aba, fDataInicio, fDataFim])

  async function handleManual(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setErro(''); setSucesso('')
    try {
      const fd = new FormData()
      fd.append('banco', fmBanco)
      fd.append('tipo', fmTipo)
      fd.append('valor', fmValor)
      fd.append('data', fmData)
      fd.append('descricao', fmDesc)
      if (fmDoc) fd.append('documento', fmDoc)
      if (fmTxid) fd.append('txid', fmTxid)
      if (fmObs) fd.append('observacoes', fmObs)
      if (fmArquivo) fd.append('comprovante', fmArquivo)
      await api.criarManual(fd)
      setSucesso('Lançamento criado.')
      carregar()
      setTimeout(() => { setModalManual(false); setSucesso('') }, 900)
    } catch (err) { setErro(err instanceof Error ? err.message : 'Erro') }
    finally { setSaving(false) }
  }

  async function handleOfx(e: React.FormEvent) {
    e.preventDefault()
    if (!ofxArquivo) return
    setSaving(true); setErro(''); setSucesso('')
    try {
      const r = await api.importarOfx(ofxBanco, ofxArquivo)
      setSucesso(`✓ ${r.inseridos} inseridos, ${r.duplicatas} duplicatas ignoradas de ${r.total} total.`)
      carregar()
    } catch (err) { setErro(err instanceof Error ? err.message : 'Erro') }
    finally { setSaving(false) }
  }

  async function handleBB(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setErro(''); setSucesso('')
    try {
      const r = await api.importarBB({ dataInicio: bbInicio, dataFim: bbFim })
      setSucesso(`✓ ${r.inseridos} lançamentos importados do BB.`)
      setModalBB(false); carregar()
    } catch (err) { setErro(err instanceof Error ? err.message : 'Erro') }
    finally { setSaving(false) }
  }

  async function handleBradesco(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setErro(''); setSucesso('')
    try {
      const r = await api.importarBradesco({ dataInicio: brInicio, dataFim: brFim })
      setSucesso(`✓ ${r.inseridos} lançamentos importados do Bradesco.`)
      setModalBradesco(false); carregar()
    } catch (err) { setErro(err instanceof Error ? err.message : 'Erro') }
    finally { setSaving(false) }
  }

  async function handleAuto() {
    setSucesso(''); setErro('')
    try {
      const r = await api.auto()
      setSucesso(`✓ ${r.conciliados} de ${r.total} conciliados automaticamente.`)
      carregar()
    } catch (err) { setErro(err instanceof Error ? err.message : 'Erro') }
  }

  async function handleIgnorar(id: string) {
    if (!confirm('Ignorar este lançamento?')) return
    await api.ignorar(id).catch(() => {})
    carregar()
  }

  async function handleReabrir(id: string) {
    await api.reabrir(id).catch(() => {})
    carregar()
  }

  async function buscarParaConciliar() {
    if (!conciliarBusca.trim()) return
    const ped = await pedidosApi.list({ busca: conciliarBusca, limit: 8 }).then(r => r.data).catch(() => [])
    setConciliarPedidos(ped)
  }

  async function handleConciliar(pedidoId?: string, cobrancaId?: string) {
    if (!modalConciliar) return
    await api.conciliar(modalConciliar._id, { pedidoId, cobrancaId, comprovante: conciliarComprovante })
    setModalConciliar(null); setConciliarBusca(''); setConciliarPedidos([]); setConciliarComprovante(null)
    carregar()
  }

  const colunas = [
    {
      key: 'banco', header: 'Banco',
      render: (r: LancamentoBancario) => (
        <span className={cStyles.bancoBadge} style={{ borderColor: BANCO_COR[r.banco] ?? '#94a3b8' }}>
          {r.banco}
        </span>
      ),
    },
    {
      key: 'tipo', header: 'Tipo',
      render: (r: LancamentoBancario) => (
        <Badge label={r.tipo === 'credito' ? '↓ Crédito' : '↑ Débito'}
          variant={r.tipo === 'credito' ? 'success' : 'danger'} />
      ),
    },
    { key: 'data',     header: 'Data',      render: (r: LancamentoBancario) => fmtDate(r.data) },
    { key: 'descricao',header: 'Descrição', render: (r: LancamentoBancario) => (
        <span title={r.descricao} className={cStyles.descCell}>{r.descricao}</span>
      )
    },
    { key: 'valor',    header: 'Valor',     render: (r: LancamentoBancario) => (
        <strong style={{ color: r.tipo === 'credito' ? '#15803d' : '#b91c1c' }}>{moeda(r.valor)}</strong>
      )
    },
    {
      key: 'status', header: 'Status',
      render: (r: LancamentoBancario) => {
        const s = STATUS_BADGE[r.status] ?? { label: r.status, variant: 'default' as const }
        return <Badge label={s.label} variant={s.variant} />
      },
    },
    {
      key: 'vinculo', header: 'Vínculo',
      render: (r: LancamentoBancario) => {
        if (r.pedidoId && typeof r.pedidoId === 'object') return <code style={{ fontSize: '0.75rem' }}>{r.pedidoId.numero}</code>
        if (r.cobrancaId && typeof r.cobrancaId === 'object') return <code style={{ fontSize: '0.75rem' }}>Cob {r.cobrancaId.tipo}</code>
        return <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>—</span>
      },
    },
    {
      key: '_actions', header: '',
      render: (r: LancamentoBancario) => (
        <div style={{ display: 'flex', gap: 4 }}>
          {r.status === 'pendente' && (
            <>
              <button className={styles.btnPrimary} style={{ padding: '3px 10px', fontSize: '0.75rem' }}
                onClick={e => { e.stopPropagation(); setModalConciliar(r); setConciliarBusca(''); setConciliarPedidos([]) }}>
                Conciliar
              </button>
              <button className={styles.btnSecondary} style={{ padding: '3px 10px', fontSize: '0.75rem' }}
                onClick={e => { e.stopPropagation(); handleIgnorar(r._id) }}>
                Ignorar
              </button>
            </>
          )}
          {(r.status === 'conciliado' || r.status === 'ignorado') && (
            <button className={styles.btnSecondary} style={{ padding: '3px 10px', fontSize: '0.75rem' }}
              onClick={e => { e.stopPropagation(); handleReabrir(r._id) }}>
              Reabrir
            </button>
          )}
          {r.comprovanteUrl && (
            <a href={r.comprovanteUrl} target="_blank" rel="noreferrer"
              className={styles.btnSecondary} style={{ padding: '3px 10px', fontSize: '0.75rem', textDecoration: 'none' }}>
              📎
            </a>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className={styles.page}>
      <PageHeader
        title="Conciliação Bancária"
        subtitle="Lançamentos manuais, extrato OFX, BB e Bradesco"
        action={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className={styles.btnSecondary} onClick={handleAuto}>⚡ Conciliar Auto</button>
            <button className={styles.btnSecondary} onClick={() => setModalOfx(true)}>📂 Importar OFX</button>
            <button className={styles.btnSecondary} onClick={() => setModalBB(true)}>🏦 BB</button>
            <button className={styles.btnSecondary} onClick={() => setModalBradesco(true)}>🏦 Bradesco</button>
            <button className={styles.btnPrimary}   onClick={() => setModalManual(true)}>+ Lançamento</button>
          </div>
        }
      />

      {/* Mensagens globais */}
      {sucesso && <div className={cStyles.alerta} style={{ background: '#f0fdf4', borderColor: '#86efac', color: '#15803d' }}>{sucesso}<button onClick={() => setSucesso('')} className={cStyles.fechar}>✕</button></div>}
      {erro    && <div className={cStyles.alerta} style={{ background: '#fef2f2', borderColor: '#fca5a5', color: '#b91c1c' }}>{erro}<button onClick={() => setErro('')} className={cStyles.fechar}>✕</button></div>}

      {/* Abas */}
      <div className={cStyles.abas}>
        {(['lancamentos', 'resumo'] as Aba[]).map(a => (
          <button key={a} className={`${cStyles.aba} ${aba === a ? cStyles.abaAtiva : ''}`} onClick={() => setAba(a)}>
            {a === 'lancamentos' ? 'Lançamentos' : 'Resumo'}
          </button>
        ))}
      </div>

      {aba === 'lancamentos' && (
        <>
          <div className={styles.filters}>
            <div className={styles.chipRow}>
              <span className={styles.chipLabel}>Banco</span>
              {[{ v: '', l: 'Todos' }, { v: 'BB', l: 'BB' }, { v: 'Bradesco', l: 'Bradesco' }, { v: 'Efi', l: 'Efi' }, { v: 'Manual', l: 'Manual' }].map(o => (
                <button key={o.v} className={`${styles.chip} ${o.v === '' ? fBanco.length === 0 ? styles.chipActive : '' : fBanco.includes(o.v) ? styles.chipActive : ''}`}
                  onClick={() => { setFBanco(toggle(fBanco, o.v)); setPage(1) }}>{o.l}</button>
              ))}
            </div>
            <div className={styles.chipRow}>
              <span className={styles.chipLabel}>Status</span>
              {[{ v: '', l: 'Todos' }, { v: 'pendente', l: 'Pendente' }, { v: 'conciliado', l: 'Conciliado' }, { v: 'ignorado', l: 'Ignorado' }].map(o => (
                <button key={o.v} className={`${styles.chip} ${o.v === '' ? fStatus.length === 0 ? styles.chipActive : '' : fStatus.includes(o.v) ? styles.chipActive : ''}`}
                  onClick={() => { setFStatus(toggle(fStatus, o.v)); setPage(1) }}>{o.l}</button>
              ))}
            </div>
            <div className={styles.chipRow}>
              <span className={styles.chipLabel}>Tipo</span>
              {[{ v: '', l: 'Todos' }, { v: 'credito', l: 'Crédito' }, { v: 'debito', l: 'Débito' }].map(o => (
                <button key={o.v} className={`${styles.chip} ${o.v === '' ? fTipo.length === 0 ? styles.chipActive : '' : fTipo.includes(o.v) ? styles.chipActive : ''}`}
                  onClick={() => { setFTipo(toggle(fTipo, o.v)); setPage(1) }}>{o.l}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap' }}>
              <span className={styles.chipLabel}>Período</span>
              <input type="date" value={fDataInicio} onChange={e => { setFDataInicio(e.target.value); setPage(1) }} title="Data início"
                style={{ padding: '5px 8px', border: '1px solid var(--input-border)', borderRadius: 8, fontSize: '0.85rem', background: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none' }} />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>até</span>
              <input type="date" value={fDataFim} onChange={e => { setFDataFim(e.target.value); setPage(1) }} title="Data fim"
                style={{ padding: '5px 8px', border: '1px solid var(--input-border)', borderRadius: 8, fontSize: '0.85rem', background: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none' }} />
              <button className={styles.btnSecondary} onClick={carregar} style={{ padding: '5px 12px' }}>↻</button>
            </div>
          </div>
          <div className={styles.panel}>
            <Table columns={colunas} rows={lancamentos} loading={loading} empty="Nenhum lançamento encontrado" />
            <Pagination page={page} total={total} limit={30} onChange={setPage} />
          </div>
        </>
      )}

      {aba === 'resumo' && resumo && (
        <div className={cStyles.resumoGrid}>
          <div className={cStyles.resumoCard}>
            <h4>Por Status (créditos)</h4>
            {Object.entries(resumo.porStatus).map(([s, v]) => (
              <div key={s} className={cStyles.resumoRow}>
                <Badge label={STATUS_BADGE[s]?.label ?? s} variant={STATUS_BADGE[s]?.variant ?? 'default'} />
                <span>{v.count} lançamentos</span>
                <strong>{moeda(v.valor)}</strong>
              </div>
            ))}
          </div>
          <div className={cStyles.resumoCard}>
            <h4>Por Banco</h4>
            {resumo.porBanco.map(b => (
              <div key={b._id} className={cStyles.resumoRow}>
                <span className={cStyles.bancoBadge} style={{ borderColor: BANCO_COR[b._id] ?? '#94a3b8' }}>{b._id}</span>
                <span>{b.count} lançamentos</span>
                <strong>{moeda(b.valor)}</strong>
              </div>
            ))}
          </div>
          <div className={cStyles.resumoCard}>
            <h4>Total Conciliado</h4>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#15803d' }}>{moeda(resumo.totalConciliado)}</div>
          </div>
          <div className={cStyles.resumoCard} style={{ gridColumn: 'span 2' }}>
            <h4>Últimas Importações</h4>
            {resumo.lotes.map(l => (
              <div key={l._id} className={cStyles.resumoRow}>
                <span className={cStyles.bancoBadge} style={{ borderColor: BANCO_COR[l.banco] ?? '#94a3b8' }}>{l.banco}</span>
                <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{fmtDate(l.createdAt)}</span>
                <span>{l.totalLancamentos} lançamentos</span>
                {l.arquivoNome && <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{l.arquivoNome}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: lançamento manual */}
      {modalManual && (
        <Modal title="Novo Lançamento Manual" onClose={() => setModalManual(false)} size="md">
          <form onSubmit={handleManual} className={styles.form} noValidate>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>Banco *
                <select value={fmBanco} onChange={e => setFmBanco(e.target.value)}>
                  <option value="Manual">Manual</option>
                  <option value="BB">Banco do Brasil</option>
                  <option value="Bradesco">Bradesco</option>
                  <option value="Efi">Efi Bank</option>
                </select>
              </label>
              <label>Tipo *
                <select value={fmTipo} onChange={e => setFmTipo(e.target.value)}>
                  <option value="credito">Crédito (entrada)</option>
                  <option value="debito">Débito (saída)</option>
                </select>
              </label>
              <label>Valor (R$) *
                <input type="number" min="0.01" step="0.01" value={fmValor} onChange={e => setFmValor(e.target.value)} required />
              </label>
              <label>Data *
                <input type="date" value={fmData} onChange={e => setFmData(e.target.value)} required />
              </label>
            </div>
            <label>Descrição *
              <input value={fmDesc} onChange={e => setFmDesc(e.target.value)} required placeholder="Ex: Pagamento PIX pedido P-001" />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>CPF/CNPJ Pagador
                <input value={fmDoc} onChange={e => setFmDoc(e.target.value)} placeholder="Somente dígitos" />
              </label>
              <label>TxID PIX
                <input value={fmTxid} onChange={e => setFmTxid(e.target.value)} placeholder="E00000..." style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
              </label>
            </div>
            <label>Observações
              <input value={fmObs} onChange={e => setFmObs(e.target.value)} placeholder="Opcional" />
            </label>
            <label>Comprovante (PDF, JPG, PNG)
              <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                onChange={e => setFmArquivo(e.target.files?.[0] ?? null)} />
              {fmArquivo && <span style={{ fontSize: '0.75rem', color: '#64748b' }}>📎 {fmArquivo.name}</span>}
            </label>
            {erro    && <p className={styles.error}>{erro}</p>}
            {sucesso && <p style={{ color: '#15803d', fontSize: '0.85rem', margin: 0 }}>{sucesso}</p>}
            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setModalManual(false)}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving ? 'Salvando...' : 'Criar Lançamento'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: importar OFX */}
      {modalOfx && (
        <Modal title="Importar Extrato OFX" onClose={() => setModalOfx(false)} size="sm">
          <form onSubmit={handleOfx} className={styles.form} noValidate>
            <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>
              Exporte o extrato no internet banking do seu banco no formato <strong>.ofx</strong> e importe aqui.
            </p>
            <label>Banco *
              <select value={ofxBanco} onChange={e => setOfxBanco(e.target.value)}>
                <option value="BB">Banco do Brasil</option>
                <option value="Bradesco">Bradesco</option>
                <option value="Manual">Outro banco</option>
              </select>
            </label>
            <label>Arquivo OFX *
              <input type="file" accept=".ofx,.ofc,.qfx" required
                onChange={e => setOfxArquivo(e.target.files?.[0] ?? null)} />
            </label>
            {erro    && <p className={styles.error}>{erro}</p>}
            {sucesso && <p style={{ color: '#15803d', fontSize: '0.85rem', margin: 0 }}>{sucesso}</p>}
            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setModalOfx(false)}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={saving || !ofxArquivo}>{saving ? 'Importando...' : 'Importar'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: importar BB */}
      {modalBB && (
        <Modal title="Importar Extrato — Banco do Brasil" onClose={() => setModalBB(false)} size="sm">
          <form onSubmit={handleBB} className={styles.form} noValidate>
            <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>Requer BB_CLIENT_ID e BB_CLIENT_SECRET configurados em Configurações.</p>
            <label>Data início * <input type="date" required value={bbInicio} onChange={e => setBbInicio(e.target.value)} /></label>
            <label>Data fim *    <input type="date" required value={bbFim}    onChange={e => setBbFim(e.target.value)} /></label>
            {erro && <p className={styles.error}>{erro}</p>}
            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setModalBB(false)}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving ? 'Importando...' : 'Importar do BB'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: importar Bradesco */}
      {modalBradesco && (
        <Modal title="Importar Extrato — Bradesco" onClose={() => setModalBradesco(false)} size="sm">
          <form onSubmit={handleBradesco} className={styles.form} noValidate>
            <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>Requer BRADESCO_CLIENT_ID e BRADESCO_CLIENT_SECRET configurados em Configurações.</p>
            <label>Data início * <input type="date" required value={brInicio} onChange={e => setBrInicio(e.target.value)} /></label>
            <label>Data fim *    <input type="date" required value={brFim}    onChange={e => setBrFim(e.target.value)} /></label>
            {erro && <p className={styles.error}>{erro}</p>}
            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => setModalBradesco(false)}>Cancelar</button>
              <button type="submit" className={styles.btnPrimary} disabled={saving}>{saving ? 'Importando...' : 'Importar do Bradesco'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: conciliar */}
      {modalConciliar && (
        <Modal title="Conciliar Lançamento" onClose={() => { setModalConciliar(null); setConciliarPedidos([]); setConciliarComprovante(null) }} size="md">
          <div className={styles.form}>
            <div className={cStyles.conciliarInfo}>
              <div><span>Banco</span><strong>{modalConciliar.banco}</strong></div>
              <div><span>Valor</span><strong style={{ color: '#15803d' }}>{moeda(modalConciliar.valor)}</strong></div>
              <div><span>Data</span><strong>{fmtDate(modalConciliar.data)}</strong></div>
              <div><span>Descrição</span><span style={{ fontSize: '0.85rem' }}>{modalConciliar.descricao}</span></div>
            </div>
            <label>Comprovante de pagamento (PDF, JPG, PNG)
              <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                onChange={e => setConciliarComprovante(e.target.files?.[0] ?? null)} />
              {conciliarComprovante && (
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>📎 {conciliarComprovante.name}</span>
              )}
            </label>
            <label>Buscar pedido por número
              <div style={{ display: 'flex', gap: 8 }}>
                <input className={styles.search} value={conciliarBusca}
                  onChange={e => setConciliarBusca(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), buscarParaConciliar())}
                  placeholder="Ex: P-001" />
                <button type="button" className={styles.btnSecondary} onClick={buscarParaConciliar}>Buscar</button>
              </div>
            </label>
            {conciliarPedidos.length > 0 && (
              <div className={cStyles.matchList}>
                {conciliarPedidos.map(p => (
                  <div key={p._id} className={cStyles.matchItem} onClick={() => handleConciliar(p._id)}>
                    <strong>{p.numero}</strong>
                    <span style={{ color: '#64748b', fontSize: '0.8rem' }}>{p.status} — {moeda(p.valorTotal)}</span>
                    <button type="button" className={styles.btnPrimary} style={{ padding: '4px 12px', fontSize: '0.75rem' }}>Vincular</button>
                  </div>
                ))}
              </div>
            )}
            <div className={styles.formActions}>
              <button type="button" className={styles.btnSecondary} onClick={() => { setModalConciliar(null); setConciliarPedidos([]); setConciliarComprovante(null) }}>Fechar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
