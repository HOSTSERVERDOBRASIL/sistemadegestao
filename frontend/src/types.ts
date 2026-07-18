// Auth
export type Role = 'admin' | 'operador' | 'financeiro' | 'cliente'

export interface User {
  _id: string
  nome: string
  email: string
  role: Role
  ativo: boolean
  createdAt: string
  updatedAt: string
}

export interface LoginPayload {
  email: string
  password: string
}

export interface LoginResponse {
  token: string
  user: { id: string; email: string; role: Role }
}

// Paginação
export interface Page<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

// Cliente
export interface Cliente {
  _id: string
  nome: string
  email: string
  documento: string
  tipo: 'pessoa-fisica' | 'pessoa-juridica'
  telefone?: string
  ativo: boolean
  createdAt: string
}

export type ClientePayload = Omit<Cliente, '_id' | 'createdAt'>

// Produto
export interface Produto {
  _id: string
  codigo: string
  nome: string
  descricao?: string
  categoria?: string
  fornecedor?: string
  preco: number
  precoTabela?: number
  estoque: number
  ativo: boolean
  createdAt: string
}

export type ProdutoPayload = Omit<Produto, '_id' | 'createdAt'>

// Parceiro
export interface Parceiro {
  _id: string
  nome: string
  documento: string
  email: string
  emissorNFPadrao: 'XDigital' | 'Revendedor'
  ativo: boolean
  createdAt: string
}

export type ParceiroPayload = Omit<Parceiro, '_id' | 'createdAt'>

// Contrato
export type ModalidadeContrato = 'Total' | 'Parcial' | 'Por Ordem de Fornecimento'
export type VinculoTipo = 'Contrato' | 'EmpenhoSF' | 'CompraDireta' | 'Revenda'

export interface Contrato {
  _id: string
  numero: string
  clienteId: string | Cliente
  valorTotal: number
  valorFaturado: number
  modalidade: ModalidadeContrato
  ativo: boolean
  dataInicio: string
  dataFim: string
  assinantes: string[]
  versoes: { numeroVersao: number; arquivoUrl?: string; data: string }[]
  createdAt: string
}

export type ContratoPayload = {
  numero: string
  clienteId: string
  valorTotal: number
  modalidade: ModalidadeContrato
  dataInicio: string
  dataFim: string
  assinantes?: string[]
}

// Ordem de Fornecimento
export interface OrdemFornecimento {
  _id: string
  numero: string
  contratoId: string
  valor: number
  valorFaturado: number
  status: 'Aberta' | 'Parcial' | 'Fechada'
  createdAt: string
}

// Pedido
export type EtapaOperacional =
  | 'Pedido' | 'Pagamento' | 'Validacao' | 'Preparacao'
  | 'Processamento' | 'Entrega' | 'Conclusao'

export type StatusPedido = 'Rascunho' | 'Aprovado' | 'Em processo' | 'Faturado' | 'Concluido'

export interface HistoricoEtapa {
  etapa: EtapaOperacional
  data: string
  usuarioId?: string | User
  observacao?: string
}

// Cupom de Desconto
export type TipoDesconto = 'percentual' | 'fixo'

export interface Cupom {
  _id: string
  codigo: string
  descricao?: string
  tipo: TipoDesconto
  valor: number
  valorMinimoPedido?: number
  valorMaximoDesconto?: number
  usosMaximos?: number
  usosRealizados: number
  validoDe?: string
  validoAte?: string
  produtoIds?: string[]
  clienteIds?: string[]
  ativo: boolean
  createdAt: string
  updatedAt: string
}

export type CupomPayload = Omit<Cupom, '_id' | 'createdAt' | 'updatedAt' | 'usosRealizados'>

export interface ValidacaoCupom {
  valido: boolean
  message?: string
  cupomId?: string
  codigo?: string
  descricao?: string
  tipo?: TipoDesconto
  descontoValor?: number
  descontoPercentual?: number
  valorFinal?: number
}

export interface Pedido {
  _id: string
  numero: string
  clienteId: string | Cliente
  produtoId: string | Produto
  contratoId?: string | Contrato
  parceiroId?: string | Parceiro
  valorTotal: number
  valorTabela: number
  valorRevenda?: number
  cupomId?: string
  cupomCodigo?: string
  descontoValor?: number
  descontoPercentual?: number
  vinculo: {
    tipo: VinculoTipo
    emissorNF?: 'XDigital' | 'Revendedor'
    empenho?: string
    sf?: string
    comprovantePagamentoAprovado?: boolean
    contratoModalidade?: string
  }
  status: StatusPedido
  etapaOperacional: EtapaOperacional
  historicoEtapas: HistoricoEtapa[]
  nfEmitida: boolean
  createdAt: string
}

export type PedidoPayload = {
  numero: string
  clienteId: string
  produtoId: string
  contratoId?: string
  parceiroId?: string
  valorTotal: number
  valorTabela: number
  valorRevenda?: number
  cupomCodigo?: string
  vinculo: Pedido['vinculo']
}

// Nota Fiscal
export interface NotaFiscal {
  _id: string
  numero: string
  pedidoId: string | Pedido
  valor: number
  emissor: 'XDigital' | 'Revendedor'
  status: 'Emitida' | 'Pendente' | 'Cancelada'
  observacoes?: string
  createdAt: string
}

// Relatórios
export interface ResumoGeral {
  pedidos: number
  notasEmitidas: number
  pedidosFaturados: number
  totalFaturado: number
}

export interface FaturamentoPorCliente {
  clienteId: string
  nomeCliente: string
  documentoCliente: string
  totalFaturado: number
  pedidos: number
}

export interface FaturamentoPorModalidade {
  _id: VinculoTipo
  totalFaturado: number
  pedidos: number
}

export interface PedidosPorStatus {
  _id: StatusPedido
  total: number
  valor: number
}

export interface FaturamentoPorMes {
  _id: { ano: number; mes: number }
  total: number
  quantidade: number
}

export interface ClientesAtivos {
  total: number
  ativos: number
  inativos: number
  pessoaFisica: number
  pessoaJuridica: number
}

// Cobrança Efi Bank
export type TipoCobranca = 'pix' | 'boleto' | 'pix_vencimento'
export type StatusCobranca =
  | 'ATIVA'
  | 'CONCLUIDA'
  | 'REMOVIDA_PELO_USUARIO_RECEBEDOR'
  | 'REMOVIDA_PELO_PSP'
  | 'EXPIRADA'

export interface Cobranca {
  _id: string
  pedidoId: string | Pedido
  tipo: TipoCobranca
  valor: number
  status: StatusCobranca
  txid?: string
  qrCode?: string
  qrCodeBase64?: string
  pixCopiaECola?: string
  boletoUrl?: string
  boletoBarcode?: string
  nossoNumero?: string
  vencimento?: string
  pagoEm?: string
  createdAt: string
}

// Tiny/Olist Sync
export type TipoSyncTiny = 'produto' | 'pedido' | 'cliente'
export type StatusSyncTiny = 'pendente' | 'sincronizado' | 'erro'

export interface TinySync {
  _id: string
  tipo: TipoSyncTiny
  localId: string
  tinyId?: string
  tinyNumero?: string
  status: StatusSyncTiny
  erro?: string
  ultimaSync?: string
  createdAt: string
}

export interface TinyStatus {
  configurado: boolean
  stats: { total: number; sincronizados: number; erros: number; pendentes: number }
}

// Configurações de integrações
export interface CampoConfig {
  key: string
  label: string
  secret: boolean
  placeholder: string
  configurado: boolean
  valor: string
}

export interface ServicoConfig {
  id: string
  label: string
  campos: CampoConfig[]
  configurado: number
  total: number
  status: 'ok' | 'parcial' | 'vazio'
}

// Conciliação Bancária
export type BancoOrigem = 'BB' | 'Bradesco' | 'Manual' | 'Efi'
export type TipoLancamento = 'credito' | 'debito'
export type StatusConciliacao = 'pendente' | 'conciliado' | 'ignorado'
export type OrigemLancamento = 'manual' | 'ofx' | 'api_bb' | 'api_bradesco'

export interface LancamentoBancario {
  _id: string
  banco: BancoOrigem
  origem: OrigemLancamento
  tipo: TipoLancamento
  valor: number
  data: string
  descricao: string
  documento?: string
  txid?: string
  nossoNumero?: string
  comprovanteUrl?: string
  status: StatusConciliacao
  pedidoId?: string | { _id: string; numero: string; valorTotal: number; status: string }
  cobrancaId?: string | { _id: string; tipo: string; valor: number; status: string }
  loteId?: string
  observacoes?: string
  conciliadoEm?: string
  createdAt: string
}

export interface ConciliacaoLote {
  _id: string
  banco: BancoOrigem
  origem: OrigemLancamento
  arquivoNome?: string
  periodoInicio?: string
  periodoFim?: string
  totalLancamentos: number
  totalConciliados: number
  totalIgnorados: number
  createdAt: string
}

export interface ConciliacaoResumo {
  porStatus: Record<string, { count: number; valor: number }>
  porBanco: { _id: string; count: number; valor: number }[]
  totalConciliado: number
  lotes: ConciliacaoLote[]
}
