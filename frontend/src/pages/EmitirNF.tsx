import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/PageHeader'
import { clientes as clientesApi, financeiro } from '../api'
import type { Cliente } from '../types'
import styles from './Page.module.css'

interface ItemCertificado {
  tipo: string
  quantidade: number
}

interface FormState {
  numero: string
  valor: number | ''
  emissor: 'XDigital' | 'Revendedor' | ''
  tipoFaturamento: 'Total' | 'Demanda' | 'Fechamento' | ''
  competencia: string
  dataVencimento: string
  codigoServico: string
  aliquotaISS: number | ''
  municipioPrestacao: string
  descricao: string
  observacoes: string
}

const BLANK_FORM: FormState = {
  numero: '',
  valor: '',
  emissor: '',
  tipoFaturamento: '',
  competencia: '',
  dataVencimento: '',
  codigoServico: '',
  aliquotaISS: '',
  municipioPrestacao: '',
  descricao: '',
  observacoes: '',
}

export default function EmitirNF() {
  const navigate = useNavigate()
  const searchRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState<FormState>(BLANK_FORM)
  const [clienteId, setClienteId] = useState('')
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null)
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<Cliente[]>([])
  const [itensCertificados, setItensCertificados] = useState<ItemCertificado[]>([{ tipo: '', quantidade: 1 }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Debounce client search — 300 ms
  useEffect(() => {
    if (!busca.trim()) {
      setResultados([])
      return
    }
    const timer = setTimeout(() => {
      clientesApi.list({ busca, limit: 10 })
        .then(res => setResultados(res.data))
        .catch(() => setResultados([]))
    }, 300)
    return () => clearTimeout(timer)
  }, [busca])

  function selecionarCliente(c: Cliente) {
    setClienteId(c._id)
    setClienteSelecionado(c)
    setBusca('')
    setResultados([])
  }

  function trocarCliente() {
    setClienteId('')
    setClienteSelecionado(null)
    setBusca('')
    setResultados([])
    setTimeout(() => searchRef.current?.focus(), 50)
  }

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }

  function addItem() {
    setItensCertificados(items => [...items, { tipo: '', quantidade: 1 }])
  }

  function removeItem(idx: number) {
    setItensCertificados(items => items.filter((_, i) => i !== idx))
  }

  function updateItem(idx: number, field: keyof ItemCertificado, value: string | number) {
    setItensCertificados(items =>
      items.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!form.numero.trim()) { setError('Número da NF é obrigatório.'); return }
    if (!clienteId) { setError('Selecione um cliente antes de emitir.'); return }
    if (!form.valor || Number(form.valor) <= 0) { setError('Valor deve ser maior que zero.'); return }
    if (!form.emissor) { setError('Selecione o emissor.'); return }

    setSaving(true)
    try {
      const itensValidos = itensCertificados.filter(i => i.tipo.trim() !== '')
      await financeiro.criarAvulsa({
        numero: form.numero.trim(),
        valor: Number(form.valor),
        emissor: form.emissor as 'XDigital' | 'Revendedor',
        clienteId,
        ...(form.tipoFaturamento
          ? { tipoFaturamento: form.tipoFaturamento as 'Total' | 'Demanda' | 'Fechamento' }
          : {}),
        ...(form.competencia.trim() ? { competencia: form.competencia.trim() } : {}),
        ...(form.dataVencimento ? { dataVencimento: form.dataVencimento } : {}),
        ...(form.codigoServico.trim() ? { codigoServico: form.codigoServico.trim() } : {}),
        ...(form.aliquotaISS !== '' ? { aliquotaISS: Number(form.aliquotaISS) } : {}),
        ...(form.municipioPrestacao.trim()
          ? { municipioPrestacao: form.municipioPrestacao.trim() }
          : {}),
        ...(itensValidos.length > 0 ? { itensCertificados: itensValidos } : {}),
        ...(form.descricao.trim() ? { descricao: form.descricao.trim() } : {}),
        ...(form.observacoes.trim() ? { observacoes: form.observacoes.trim() } : {}),
      })
      navigate('/financeiro', { state: { success: true } })
    } catch (err) {
      setError((err as Error).message || 'Erro ao emitir nota fiscal.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Emitir Nota Fiscal"
        action={
          <button type="button" className={styles.btnSecondary} onClick={() => navigate(-1)}>
            ← Voltar
          </button>
        }
      />

      <form className={styles.form} onSubmit={handleSubmit}>
        {/* ── Seção 1 — Cliente ─────────────────────────────── */}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Cliente</h3>

          {clienteSelecionado ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '10px 14px',
                background: 'var(--surface-2)',
                borderRadius: 8,
                border: '1px solid var(--surface-border)',
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                  {clienteSelecionado.nome}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  {clienteSelecionado.documento}
                </div>
              </div>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={trocarCliente}
                style={{ padding: '5px 12px', fontSize: '0.8rem' }}
              >
                Trocar
              </button>
            </div>
          ) : (
            <div>
              <input
                ref={searchRef}
                className={styles.search}
                style={{ maxWidth: '100%', marginBottom: resultados.length > 0 ? 8 : 0 }}
                placeholder="Buscar cliente por nome ou documento..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
              />
              {resultados.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {resultados.map(c => (
                    <button
                      key={c._id}
                      type="button"
                      onClick={() => selecionarCliente(c)}
                      style={{
                        textAlign: 'left',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--surface-border)',
                        borderRadius: 8,
                        padding: '9px 14px',
                        cursor: 'pointer',
                        color: 'var(--text-primary)',
                        fontSize: '0.875rem',
                        transition: 'background 0.12s',
                      }}
                      onMouseOver={e => {
                        e.currentTarget.style.background = 'var(--accent-muted)'
                      }}
                      onMouseOut={e => {
                        e.currentTarget.style.background = 'var(--surface-2)'
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{c.nome}</span>
                      <span style={{ color: 'var(--text-muted)', marginLeft: 10, fontSize: '0.8rem' }}>
                        {c.documento}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Seção 2 — Dados da Nota ───────────────────────── */}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Dados da Nota</h3>
          <div className={styles.formGrid2}>
            <label>
              Número NF *
              <input
                name="numero"
                value={form.numero}
                onChange={handleChange}
                placeholder="Ex: 000123"
              />
            </label>
            <label>
              Valor R$ *
              <input
                name="valor"
                type="number"
                min="0.01"
                step="0.01"
                value={form.valor}
                onChange={handleChange}
                placeholder="0,00"
              />
            </label>
            <label>
              Emissor *
              <select name="emissor" value={form.emissor} onChange={handleChange}>
                <option value="">Selecionar…</option>
                <option value="XDigital">XDigital</option>
                <option value="Revendedor">Revendedor</option>
              </select>
            </label>
            <label>
              Tipo de Faturamento
              <select name="tipoFaturamento" value={form.tipoFaturamento} onChange={handleChange}>
                <option value="">Não classificado</option>
                <option value="Total">Total</option>
                <option value="Demanda">Por Demanda</option>
                <option value="Fechamento">Fechamento</option>
              </select>
            </label>
            <label>
              Competência
              <input
                name="competencia"
                value={form.competencia}
                onChange={handleChange}
                placeholder="MM/AAAA"
              />
            </label>
            <label>
              Data de Vencimento
              <input
                name="dataVencimento"
                type="date"
                value={form.dataVencimento}
                onChange={handleChange}
              />
            </label>
          </div>
        </div>

        {/* ── Seção 3 — Dados do Serviço (ISS) ─────────────── */}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Dados do Serviço (ISS)</h3>
          <div className={styles.formGrid2}>
            <label>
              Código do Serviço LC 116
              <input
                name="codigoServico"
                value={form.codigoServico}
                onChange={handleChange}
                placeholder="Ex: 01.05"
              />
            </label>
            <label>
              Alíquota ISS %
              <input
                name="aliquotaISS"
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={form.aliquotaISS}
                onChange={handleChange}
                placeholder="Ex: 2.00"
              />
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              Município de Prestação
              <input
                name="municipioPrestacao"
                value={form.municipioPrestacao}
                onChange={handleChange}
                placeholder="Ex: São Paulo / SP"
              />
            </label>
          </div>
        </div>

        {/* ── Seção 4 — Itens de Certificados ──────────────── */}
        <div className={styles.panel}>
          <h3 className={styles.panelTitle}>Certificados emitidos no período</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            {itensCertificados.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className={styles.search}
                  style={{ flex: 2, margin: 0, maxWidth: 'unset' }}
                  value={item.tipo}
                  onChange={e => updateItem(idx, 'tipo', e.target.value)}
                  placeholder="Ex: ICP-Brasil PF A3"
                />
                <input
                  type="number"
                  min={1}
                  style={{
                    flex: '0 0 90px',
                    padding: '8px 12px',
                    border: '1px solid var(--input-border)',
                    borderRadius: 8,
                    fontSize: '0.875rem',
                    color: 'var(--input-text)',
                    background: 'var(--input-bg)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  value={item.quantidade}
                  onChange={e => updateItem(idx, 'quantidade', Number(e.target.value) || 1)}
                />
                <button
                  type="button"
                  className={styles.btnDanger}
                  onClick={() => removeItem(idx)}
                  style={{ padding: '7px 11px', lineHeight: 1, flexShrink: 0 }}
                  disabled={itensCertificados.length === 1}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={addItem}
            style={{ fontSize: '0.82rem' }}
          >
            + Adicionar tipo
          </button>
        </div>

        {/* ── Seção 5 — Observações (inline) ───────────────── */}
        <label>
          Descrição dos serviços
          <input
            name="descricao"
            value={form.descricao}
            onChange={handleChange}
            placeholder="Descrição dos serviços"
          />
        </label>
        <label>
          Observações internas
          <textarea
            name="observacoes"
            value={form.observacoes}
            onChange={handleChange}
            rows={2}
            placeholder="Observações internas"
          />
        </label>

        {error && <p className={styles.error}>{error}</p>}

        {/* ── Rodapé ───────────────────────────────────────── */}
        <div className={styles.formActions}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={() => navigate(-1)}
          >
            Cancelar
          </button>
          <button type="submit" className={styles.btnPrimary} disabled={saving}>
            {saving ? 'Emitindo…' : 'Emitir NF'}
          </button>
        </div>
      </form>
    </div>
  )
}
