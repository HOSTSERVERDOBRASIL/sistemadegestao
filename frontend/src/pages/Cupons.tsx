import { useState, useEffect, useCallback } from 'react'
import { cupons as cuponsApi } from '../api'
import type { Cupom, CupomPayload, TipoDesconto } from '../types'
import styles from './Cupons.module.css'

const EMPTY_FORM: CupomPayload = {
  codigo: '',
  descricao: '',
  tipo: 'percentual',
  valor: 0,
  valorMinimoPedido: undefined,
  valorMaximoDesconto: undefined,
  usosMaximos: undefined,
  validoDe: undefined,
  validoAte: undefined,
  produtoIds: [],
  clienteIds: [],
  ativo: true,
}

function formatDate(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function Cupons() {
  const [data, setData] = useState<Cupom[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState<Cupom | null>(null)
  const [form, setForm] = useState<CupomPayload>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [showDetail, setShowDetail] = useState<Cupom | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await cuponsApi.list({ page, limit: 20, busca: busca || undefined, status: filtroStatus || undefined, tipo: filtroTipo || undefined })
      setData(res.data)
      setTotal(res.total)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [page, busca, filtroStatus, filtroTipo])

  useEffect(() => { void load() }, [load])

  function openCreate() {
    setEditando(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setShowModal(true)
  }

  function openEdit(c: Cupom) {
    setEditando(c)
    setForm({
      codigo: c.codigo,
      descricao: c.descricao || '',
      tipo: c.tipo,
      valor: c.valor,
      valorMinimoPedido: c.valorMinimoPedido,
      valorMaximoDesconto: c.valorMaximoDesconto,
      usosMaximos: c.usosMaximos,
      validoDe: c.validoDe ? c.validoDe.slice(0, 10) : undefined,
      validoAte: c.validoAte ? c.validoAte.slice(0, 10) : undefined,
      produtoIds: c.produtoIds || [],
      clienteIds: c.clienteIds || [],
      ativo: c.ativo,
    })
    setFormError('')
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.codigo.trim()) { setFormError('Código é obrigatório'); return }
    if (!form.tipo) { setFormError('Tipo é obrigatório'); return }
    if (!form.valor || form.valor <= 0) { setFormError('Valor deve ser maior que zero'); return }
    if (form.tipo === 'percentual' && form.valor > 100) { setFormError('Percentual não pode ultrapassar 100%'); return }

    setSaving(true)
    setFormError('')
    try {
      if (editando) {
        await cuponsApi.update(editando._id, form)
      } else {
        await cuponsApi.create(form)
      }
      setShowModal(false)
      void load()
    } catch (e: unknown) {
      setFormError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleAtivo(c: Cupom) {
    try {
      await cuponsApi.setStatus(c._id, !c.ativo)
      void load()
    } catch (e: unknown) {
      alert((e as Error).message)
    }
  }

  async function handleDelete(c: Cupom) {
    if (!confirm(`Remover cupom ${c.codigo}? Esta ação não pode ser desfeita.`)) return
    try {
      await cuponsApi.remove(c._id)
      void load()
    } catch (e: unknown) {
      alert((e as Error).message)
    }
  }

  const totalPages = Math.ceil(total / 20)

  function StatusBadge({ c }: { c: Cupom }) {
    if (!c.ativo) return <span className={`${styles.badge} ${styles.badgeInativo}`}>Inativo</span>
    if (c.validoAte && new Date(c.validoAte) < new Date()) return <span className={`${styles.badge} ${styles.badgeExpirado}`}>Expirado</span>
    if (c.usosMaximos !== undefined && c.usosRealizados >= c.usosMaximos) return <span className={`${styles.badge} ${styles.badgeEsgotado}`}>Esgotado</span>
    return <span className={`${styles.badge} ${styles.badgeAtivo}`}>Ativo</span>
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Cupons de Desconto</h1>
          <p className={styles.subtitle}>{total} cupom{total !== 1 ? 's' : ''} cadastrado{total !== 1 ? 's' : ''}</p>
        </div>
        <button className={styles.btnPrimary} onClick={openCreate}>+ Novo Cupom</button>
      </div>

      <div className={styles.filters}>
        <input
          className={styles.search}
          placeholder="Buscar por código..."
          value={busca}
          onChange={e => { setBusca(e.target.value); setPage(1) }}
        />
        <select className={styles.select} value={filtroStatus} onChange={e => { setFiltroStatus(e.target.value); setPage(1) }}>
          <option value="">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="inativo">Inativo</option>
          <option value="expirado">Expirado</option>
        </select>
        <select className={styles.select} value={filtroTipo} onChange={e => { setFiltroTipo(e.target.value); setPage(1) }}>
          <option value="">Todos os tipos</option>
          <option value="percentual">Percentual (%)</option>
          <option value="fixo">Valor fixo (R$)</option>
        </select>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Código</th>
              <th>Descrição</th>
              <th>Tipo</th>
              <th>Desconto</th>
              <th>Usos</th>
              <th>Validade</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className={styles.empty}>Carregando...</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={8} className={styles.empty}>Nenhum cupom encontrado</td></tr>
            ) : data.map(c => (
              <tr key={c._id} className={styles.row}>
                <td>
                  <span className={styles.codigo}>{c.codigo}</span>
                </td>
                <td className={styles.desc}>{c.descricao || <span className={styles.muted}>—</span>}</td>
                <td>
                  <span className={`${styles.badge} ${c.tipo === 'percentual' ? styles.badgePerc : styles.badgeFixo}`}>
                    {c.tipo === 'percentual' ? '%' : 'R$'}
                  </span>
                </td>
                <td className={styles.valor}>
                  {c.tipo === 'percentual' ? `${c.valor}%` : formatCurrency(c.valor)}
                  {c.valorMaximoDesconto && (
                    <span className={styles.cap}> (máx {formatCurrency(c.valorMaximoDesconto)})</span>
                  )}
                </td>
                <td>
                  {c.usosMaximos !== undefined
                    ? `${c.usosRealizados} / ${c.usosMaximos}`
                    : `${c.usosRealizados} / ∞`}
                </td>
                <td>
                  {c.validoDe || c.validoAte ? (
                    <span className={styles.validade}>
                      {c.validoDe ? formatDate(c.validoDe) : '—'} → {c.validoAte ? formatDate(c.validoAte) : '—'}
                    </span>
                  ) : <span className={styles.muted}>Sem limite</span>}
                </td>
                <td><StatusBadge c={c} /></td>
                <td>
                  <div className={styles.actions}>
                    <button className={styles.btnAction} onClick={() => setShowDetail(c)} title="Detalhes">👁</button>
                    <button className={styles.btnAction} onClick={() => openEdit(c)} title="Editar">✏️</button>
                    <button
                      className={`${styles.btnAction} ${c.ativo ? styles.btnDeactivate : styles.btnActivate}`}
                      onClick={() => toggleAtivo(c)}
                      title={c.ativo ? 'Desativar' : 'Ativar'}
                    >
                      {c.ativo ? '⏸' : '▶'}
                    </button>
                    <button className={`${styles.btnAction} ${styles.btnDelete}`} onClick={() => handleDelete(c)} title="Remover">🗑</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className={styles.pageBtn}>← Anterior</button>
          <span className={styles.pageInfo}>Página {page} de {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className={styles.pageBtn}>Próxima →</button>
        </div>
      )}

      {/* Modal criar/editar */}
      {showModal && (
        <div className={styles.overlay} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>{editando ? `Editar Cupom — ${editando.codigo}` : 'Novo Cupom'}</h2>
              <button className={styles.closeBtn} onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              {formError && <div className={styles.formError}>{formError}</div>}

              <div className={styles.row2}>
                <label className={styles.field}>
                  <span>Código *</span>
                  <input
                    className={styles.input}
                    value={form.codigo}
                    onChange={e => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase() }))}
                    placeholder="EX: NATAL20"
                    disabled={!!editando}
                  />
                </label>
                <label className={styles.field}>
                  <span>Status</span>
                  <select className={styles.input} value={form.ativo ? 'true' : 'false'} onChange={e => setForm(f => ({ ...f, ativo: e.target.value === 'true' }))}>
                    <option value="true">Ativo</option>
                    <option value="false">Inativo</option>
                  </select>
                </label>
              </div>

              <label className={styles.field}>
                <span>Descrição</span>
                <input className={styles.input} value={form.descricao || ''} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Descrição interna do cupom" />
              </label>

              <div className={styles.row2}>
                <label className={styles.field}>
                  <span>Tipo de desconto *</span>
                  <select className={styles.input} value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as TipoDesconto }))}>
                    <option value="percentual">Percentual (%)</option>
                    <option value="fixo">Valor fixo (R$)</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>{form.tipo === 'percentual' ? 'Percentual (%)' : 'Valor (R$)'} *</span>
                  <input
                    className={styles.input}
                    type="number"
                    min={0}
                    max={form.tipo === 'percentual' ? 100 : undefined}
                    step={form.tipo === 'percentual' ? 1 : 0.01}
                    value={form.valor || ''}
                    onChange={e => setForm(f => ({ ...f, valor: Number(e.target.value) }))}
                  />
                </label>
              </div>

              <div className={styles.row2}>
                <label className={styles.field}>
                  <span>Valor mínimo do pedido (R$)</span>
                  <input className={styles.input} type="number" min={0} step={0.01} value={form.valorMinimoPedido || ''} onChange={e => setForm(f => ({ ...f, valorMinimoPedido: e.target.value ? Number(e.target.value) : undefined }))} placeholder="Sem mínimo" />
                </label>
                {form.tipo === 'percentual' && (
                  <label className={styles.field}>
                    <span>Desconto máximo (R$)</span>
                    <input className={styles.input} type="number" min={0} step={0.01} value={form.valorMaximoDesconto || ''} onChange={e => setForm(f => ({ ...f, valorMaximoDesconto: e.target.value ? Number(e.target.value) : undefined }))} placeholder="Sem teto" />
                  </label>
                )}
              </div>

              <label className={styles.field}>
                <span>Limite de usos</span>
                <input className={styles.input} type="number" min={1} step={1} value={form.usosMaximos || ''} onChange={e => setForm(f => ({ ...f, usosMaximos: e.target.value ? Number(e.target.value) : undefined }))} placeholder="Ilimitado" />
              </label>

              <div className={styles.row2}>
                <label className={styles.field}>
                  <span>Válido de</span>
                  <input className={styles.input} type="date" value={form.validoDe || ''} onChange={e => setForm(f => ({ ...f, validoDe: e.target.value || undefined }))} />
                </label>
                <label className={styles.field}>
                  <span>Válido até</span>
                  <input className={styles.input} type="date" value={form.validoAte || ''} onChange={e => setForm(f => ({ ...f, validoAte: e.target.value || undefined }))} />
                </label>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.btnSecondary} onClick={() => setShowModal(false)} disabled={saving}>Cancelar</button>
              <button className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
                {saving ? 'Salvando...' : editando ? 'Salvar alterações' : 'Criar cupom'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal detalhe */}
      {showDetail && (
        <div className={styles.overlay} onClick={e => e.target === e.currentTarget && setShowDetail(null)}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>Cupom: <span className={styles.codigoDetail}>{showDetail.codigo}</span></h2>
              <button className={styles.closeBtn} onClick={() => setShowDetail(null)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Tipo</span>
                  <span>{showDetail.tipo === 'percentual' ? 'Percentual' : 'Valor fixo'}</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Desconto</span>
                  <span>{showDetail.tipo === 'percentual' ? `${showDetail.valor}%` : formatCurrency(showDetail.valor)}</span>
                </div>
                {showDetail.valorMinimoPedido && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Pedido mínimo</span>
                    <span>{formatCurrency(showDetail.valorMinimoPedido)}</span>
                  </div>
                )}
                {showDetail.valorMaximoDesconto && (
                  <div className={styles.detailItem}>
                    <span className={styles.detailLabel}>Desconto máximo</span>
                    <span>{formatCurrency(showDetail.valorMaximoDesconto)}</span>
                  </div>
                )}
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Usos realizados</span>
                  <span>{showDetail.usosRealizados} {showDetail.usosMaximos ? `/ ${showDetail.usosMaximos}` : '(ilimitado)'}</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Validade</span>
                  <span>
                    {showDetail.validoDe ? formatDate(showDetail.validoDe) : 'Sem início'} →{' '}
                    {showDetail.validoAte ? formatDate(showDetail.validoAte) : 'Sem fim'}
                  </span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Status</span>
                  <span className={`${styles.badge} ${showDetail.ativo ? styles.badgeAtivo : styles.badgeInativo}`}>
                    {showDetail.ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Criado em</span>
                  <span>{formatDate(showDetail.createdAt)}</span>
                </div>
                {showDetail.descricao && (
                  <div className={`${styles.detailItem} ${styles.fullWidth}`}>
                    <span className={styles.detailLabel}>Descrição</span>
                    <span>{showDetail.descricao}</span>
                  </div>
                )}
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnSecondary} onClick={() => setShowDetail(null)}>Fechar</button>
              <button className={styles.btnPrimary} onClick={() => { setShowDetail(null); openEdit(showDetail) }}>Editar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
