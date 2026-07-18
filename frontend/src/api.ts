// Em produção, define VITE_API_BASE_URL=https://api.seudominio.com.br
// Em desenvolvimento, usa proxy do Vite (/api → localhost:3000)
const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api'

import { notifyError } from './context/ToastContext'

function token() {
  return localStorage.getItem('token') || ''
}

function headers(extra?: Record<string, string>) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token()}`,
    ...extra,
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: headers() })
  if (res.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const message = (body as { message?: string }).message || `Erro ${res.status}`
    if (res.status >= 500) notifyError(message)
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

function get<T>(path: string) {
  return request<T>(path)
}

function post<T>(path: string, body: unknown) {
  return request<T>(path, { method: 'POST', body: JSON.stringify(body) })
}

function put<T>(path: string, body: unknown) {
  return request<T>(path, { method: 'PUT', body: JSON.stringify(body) })
}

function patch<T>(path: string, body: unknown) {
  return request<T>(path, { method: 'PATCH', body: JSON.stringify(body) })
}

function del<T>(path: string) {
  return request<T>(path, { method: 'DELETE' })
}

function qs(params: Record<string, string | number | boolean | undefined>) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') p.set(k, String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}

// Auth
import type { LoginPayload, LoginResponse, User } from './types'
export const auth = {
  login: (body: LoginPayload) => post<LoginResponse>('/auth/login', body),
  me: () => get<User>('/auth/me'),
  logout: () => post<{ message: string }>('/auth/logout', {}),
}

// Clientes
import type { Cliente, ClientePayload, Page } from './types'
export const clientes = {
  list: (p?: { page?: number; limit?: number; busca?: string; tipo?: string; ativo?: string }) =>
    get<Page<Cliente>>(`/clientes${qs({ page: 1, limit: 20, ...p })}`),
  get: (id: string) => get<Cliente>(`/clientes/${id}`),
  create: (body: ClientePayload) => post<Cliente>('/clientes', body),
  update: (id: string, body: Partial<ClientePayload>) => put<Cliente>(`/clientes/${id}`, body),
  remove: (id: string) => del<{ message: string; cliente: Cliente }>(`/clientes/${id}`),
  pedidos: (id: string) => get<import('./types').Pedido[]>(`/clientes/${id}/pedidos`),
}

// Produtos
import type { Produto, ProdutoPayload } from './types'
export const produtos = {
  list: (p?: { page?: number; limit?: number; busca?: string; ativo?: string }) =>
    get<Page<Produto>>(`/produtos${qs({ page: 1, limit: 20, ...p })}`),
  get: (id: string) => get<Produto>(`/produtos/${id}`),
  create: (body: ProdutoPayload) => post<Produto>('/produtos', body),
  update: (id: string, body: Partial<ProdutoPayload>) => put<Produto>(`/produtos/${id}`, body),
  remove: (id: string) => del<{ message: string; produto: Produto }>(`/produtos/${id}`),
}

// Parceiros
import type { Parceiro, ParceiroPayload } from './types'
export const parceiros = {
  list: (p?: { page?: number; limit?: number; busca?: string; ativo?: string }) =>
    get<Page<Parceiro>>(`/parceiros${qs({ page: 1, limit: 20, ...p })}`),
  get: (id: string) => get<Parceiro>(`/parceiros/${id}`),
  create: (body: ParceiroPayload) => post<Parceiro>('/parceiros', body),
  update: (id: string, body: Partial<ParceiroPayload>) => put<Parceiro>(`/parceiros/${id}`, body),
  remove: (id: string) => del<{ message: string; parceiro: Parceiro }>(`/parceiros/${id}`),
}

// Contratos
import type { Contrato, ContratoPayload, OrdemFornecimento } from './types'
export const contratos = {
  list: (p?: { page?: number; limit?: number; clienteId?: string; ativo?: string; modalidade?: string; busca?: string }) =>
    get<Page<Contrato>>(`/contratos${qs({ page: 1, limit: 20, ...p })}`),
  get: (id: string) => get<Contrato>(`/contratos/${id}`),
  create: (body: ContratoPayload) => post<Contrato>('/contratos', body),
  update: (id: string, body: Partial<ContratoPayload>) => put<Contrato>(`/contratos/${id}`, body),
  remove: (id: string) => del<{ message: string; contrato: Contrato }>(`/contratos/${id}`),
  faturarTotal: (id: string) => post<Contrato>(`/contratos/${id}/faturar-total`, {}),
  ordens: (id: string) => get<OrdemFornecimento[]>(`/contratos/${id}/ordens-fornecimento`),
  criarOrdem: (id: string, body: { numero: string; valor: number }) =>
    post<OrdemFornecimento>(`/contratos/${id}/ordens-fornecimento`, body),
  pedidos: (id: string) => get<import('./types').Pedido[]>(`/contratos/${id}/pedidos`),
}

// Pedidos
import type { Pedido, PedidoPayload, EtapaOperacional } from './types'
export const pedidos = {
  list: (p?: {
    page?: number; limit?: number; clienteId?: string; contratoId?: string;
    status?: string; etapa?: string; nfEmitida?: string; busca?: string
  }) => get<Page<Pedido>>(`/pedidos${qs({ page: 1, limit: 20, ...p })}`),
  get: (id: string) => get<Pedido>(`/pedidos/${id}`),
  create: (body: PedidoPayload) => post<Pedido>('/pedidos', body),
  update: (id: string, body: Partial<PedidoPayload>) => put<Pedido>(`/pedidos/${id}`, body),
  avancarEtapa: (id: string, etapa: EtapaOperacional, observacao?: string) =>
    patch<Pedido>(`/pedidos/${id}/etapa`, { etapa, observacao }),
  emitirNF: (id: string) => post<import('./types').NotaFiscal>(`/pedidos/${id}/emitir-nf`, {}),
}

// Financeiro
import type { NotaFiscal } from './types'
export const financeiro = {
  notas: (p?: { page?: number; limit?: number; status?: string; emissor?: string }) =>
    get<Page<NotaFiscal>>(`/financeiro/notas${qs({ page: 1, limit: 20, ...p })}`),
  nota: (id: string) => get<NotaFiscal>(`/financeiro/notas/${id}`),
  cancelarNota: (id: string, observacoes?: string) =>
    patch<NotaFiscal>(`/financeiro/notas/${id}/cancelar`, { observacoes }),
  conciliacao: (p?: { dataInicio?: string; dataFim?: string }) =>
    get<{
      por_emissor: { _id: string; total: number; quantidade: number }[]
      por_mes: { _id: { ano: number; mes: number }; total: number; quantidade: number }[]
    }>(`/financeiro/conciliacao${qs(p || {})}`),
  resumo: (p?: { dataInicio?: string; dataFim?: string }) =>
    get<{ notasEmitidas: number; totalFaturado: number; pedidosFaturados: number; notasPendentes: number }>(
      `/financeiro/resumo${qs(p || {})}`
    ),
}

// Relatórios
import type {
  ResumoGeral, FaturamentoPorCliente, FaturamentoPorModalidade,
  PedidosPorStatus, FaturamentoPorMes, ClientesAtivos
} from './types'
export const relatorios = {
  resumo: (p?: { dataInicio?: string; dataFim?: string }) =>
    get<ResumoGeral>(`/relatorios/resumo${qs(p || {})}`),
  porCliente: () => get<FaturamentoPorCliente[]>('/relatorios/faturamento-por-cliente'),
  porModalidade: () => get<FaturamentoPorModalidade[]>('/relatorios/faturamento-por-modalidade'),
  porStatus: () => get<PedidosPorStatus[]>('/relatorios/pedidos-por-status'),
  contratosComSaldo: () => get<Contrato[]>('/relatorios/contratos-com-saldo'),
  porMes: (meses?: number) =>
    get<FaturamentoPorMes[]>(`/relatorios/faturamento-por-mes${qs({ meses: meses || 12 })}`),
  clientesAtivos: () => get<ClientesAtivos>('/relatorios/clientes-ativos'),
}

// Usuários
export const usuarios = {
  list: (p?: { page?: number; limit?: number; busca?: string; role?: string; ativo?: string }) =>
    get<Page<User>>(`/usuarios${qs({ page: 1, limit: 20, ...p })}`),
  get: (id: string) => get<User>(`/usuarios/${id}`),
  create: (body: { nome: string; email: string; password: string; role: Role }) =>
    post<User>('/usuarios', body),
  update: (id: string, body: { nome?: string; email?: string; password?: string; role?: Role; ativo?: boolean }) =>
    put<User>(`/usuarios/${id}`, body),
  remove: (id: string) => del<{ message: string; user: User }>(`/usuarios/${id}`),
}

import type { Role } from './types'

// Cobranças Efi Bank
import type { Cobranca } from './types'
export const cobrancas = {
  criarPix: (body: { pedidoId: string; valor?: number; expiracaoSegundos?: number }) =>
    post<Cobranca>('/cobrancas/pix', body),
  criarPixVencimento: (body: { pedidoId: string; valor?: number; vencimento: string }) =>
    post<Cobranca>('/cobrancas/pix-vencimento', body),
  criarBoleto: (body: { pedidoId: string; valor?: number; vencimento: string }) =>
    post<Cobranca>('/cobrancas/boleto', body),
  porPedido: (pedidoId: string) => get<Cobranca[]>(`/cobrancas/pedido/${pedidoId}`),
  get: (id: string) => get<Cobranca>(`/cobrancas/${id}`),
  cancelar: (id: string) => del<{ message: string }>(`/cobrancas/${id}`),
}

// Integração Tiny/Olist
import type { TinySync, TinyStatus } from './types'
export const tiny = {
  status: () => get<TinyStatus>('/tiny/status'),
  syncs: (p?: { tipo?: string; status?: string; page?: number; limit?: number }) =>
    get<import('./types').Page<TinySync>>(`/tiny/syncs${qs({ page: 1, limit: 20, ...p })}`),
  sincronizarProduto: (id: string) =>
    post<{ message: string; sync: TinySync }>(`/tiny/produtos/${id}/sincronizar`, {}),
  sincronizarTodosProdutos: () =>
    post<{ sincronizados: number; erros: number }>('/tiny/produtos/sincronizar-todos', {}),
  sincronizarPedido: (id: string) =>
    post<{ message: string; sync: TinySync }>(`/tiny/pedidos/${id}/sincronizar`, {}),
  sincronizarCliente: (id: string) =>
    post<{ message: string; sync: TinySync }>(`/tiny/clientes/${id}/sincronizar`, {}),
  importarProdutos: (pagina?: number) =>
    post<{ importados: string[]; existentes: string[] }>('/tiny/produtos/importar', { pagina }),
}

// Export CSV (download via fetch to pass auth header)
async function downloadCsv(path: string, filename: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token()}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export const exportar = {
  pedidos: (params?: Record<string, string>) => {
    const p = new URLSearchParams(params || {}).toString()
    return downloadCsv(`/exportar/pedidos${p ? `?${p}` : ''}`, 'pedidos.csv')
  },
  notas: (params?: Record<string, string>) => {
    const p = new URLSearchParams(params || {}).toString()
    return downloadCsv(`/exportar/notas${p ? `?${p}` : ''}`, 'notas-fiscais.csv')
  },
  contratos: () => downloadCsv('/exportar/contratos', 'contratos.csv'),
}

// File upload (multipart/form-data)
async function uploadFile(path: string, file: File, fieldName = 'arquivo'): Promise<{ url: string; [k: string]: unknown }> {
  const fd = new FormData()
  fd.append(fieldName, file)
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}` },
    body: fd,
  })
  if (res.status === 401) { localStorage.removeItem('token'); window.location.href = '/login' }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { message?: string }).message || `HTTP ${res.status}`)
  }
  return res.json()
}

export const uploads = {
  comprovante: (pedidoId: string, file: File) => uploadFile(`/uploads/files/pedidos/${pedidoId}/comprovante`, file),
  versaoContrato: (contratoId: string, file: File) => uploadFile(`/uploads/files/contratos/${contratoId}/versao`, file),
}

// Configurações de integrações
import type { ServicoConfig } from './types'
export const configuracoes = {
  listar: () => get<ServicoConfig[]>('/configuracoes'),
  atualizar: (servico: string, campos: Record<string, string>) =>
    patch<{ ok: boolean; servico: string; campos: string[] }>(`/configuracoes/${servico}`, campos),
  status: (servico: string) =>
    get<{ configurado: boolean; [k: string]: unknown }>(`/configuracoes/${servico}/status`),
  registrarWebhookEfi: () =>
    post<{ ok: boolean; message: string }>('/configuracoes/efi/webhook', {}),
  consultarWebhookEfi: () =>
    get<{ configurado: boolean; webhookUrl?: string; criacao?: string }>('/configuracoes/efi/webhook'),
  uploadCertificadoEfi: (arquivo: File) => {
    const fd = new FormData()
    fd.append('certificado', arquivo)
    return fetch(`${BASE}/configuracoes/efi/certificado`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}` },
      body: fd,
    }).then(async r => {
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error((b as { message?: string }).message || `HTTP ${r.status}`) }
      return r.json() as Promise<{ ok: boolean; arquivo: string; tamanho: number }>
    })
  },
}

// Cupons de Desconto
import type { Cupom, CupomPayload, ValidacaoCupom } from './types'
export const cupons = {
  list: (p?: { page?: number; limit?: number; busca?: string; status?: string; tipo?: string }) =>
    get<Page<Cupom>>(`/cupons${qs({ page: 1, limit: 20, ...p })}`),
  get: (id: string) => get<Cupom>(`/cupons/${id}`),
  create: (body: CupomPayload) => post<Cupom>('/cupons', body),
  update: (id: string, body: Partial<CupomPayload>) => put<Cupom>(`/cupons/${id}`, body),
  setStatus: (id: string, ativo: boolean) => patch<Cupom>(`/cupons/${id}/status`, { ativo }),
  remove: (id: string) => del<{ message: string }>(`/cupons/${id}`),
  validar: (body: { codigo: string; valorPedido: number; produtoId?: string; clienteId?: string }) =>
    post<ValidacaoCupom>('/cupons/validar', body),
  pedidos: (id: string) => get<import('./types').Pedido[]>(`/cupons/${id}/pedidos`),
}

// Conciliação Bancária
import type { LancamentoBancario, ConciliacaoResumo, ConciliacaoLote } from './types'
export const conciliacao = {
  lancamentos: (p?: { banco?: string; status?: string; tipo?: string; dataInicio?: string; dataFim?: string; page?: number; limit?: number }) =>
    get<import('./types').Page<LancamentoBancario>>(`/conciliacao/lancamentos${qs({ page: 1, limit: 30, ...p })}`),
  resumo: (p?: { dataInicio?: string; dataFim?: string }) =>
    get<ConciliacaoResumo>(`/conciliacao/resumo${qs(p || {})}`),
  lotes: () => get<ConciliacaoLote[]>('/conciliacao/lotes'),
  auto: () => post<{ ok: boolean; conciliados: number; total: number }>('/conciliacao/auto', {}),
  conciliar: (id: string, body: { pedidoId?: string; cobrancaId?: string }) =>
    patch<LancamentoBancario>(`/conciliacao/lancamentos/${id}/conciliar`, body),
  ignorar: (id: string, observacoes?: string) =>
    patch<{ ok: boolean }>(`/conciliacao/lancamentos/${id}/ignorar`, { observacoes }),
  reabrir: (id: string) =>
    patch<{ ok: boolean }>(`/conciliacao/lancamentos/${id}/reabrir`, {}),
  importarBB: (body: { dataInicio: string; dataFim: string }) =>
    post<{ ok: boolean; inseridos: number; total: number }>('/conciliacao/importar-bb', body),
  importarBradesco: (body: { dataInicio: string; dataFim: string }) =>
    post<{ ok: boolean; inseridos: number; total: number }>('/conciliacao/importar-bradesco', body),
  criarManual: (fd: FormData) => {
    return fetch(`${BASE}/conciliacao/lancamentos`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}` },
      body: fd,
    }).then(async r => {
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error((b as { message?: string }).message || `HTTP ${r.status}`) }
      return r.json() as Promise<LancamentoBancario>
    })
  },
  importarOfx: (banco: string, arquivo: File) => {
    const fd = new FormData()
    fd.append('arquivo', arquivo)
    fd.append('banco', banco)
    return fetch(`${BASE}/conciliacao/importar-ofx`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}` },
      body: fd,
    }).then(async r => {
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error((b as { message?: string }).message || `HTTP ${r.status}`) }
      return r.json() as Promise<{ ok: boolean; inseridos: number; duplicatas: number; total: number }>
    })
  },
}
