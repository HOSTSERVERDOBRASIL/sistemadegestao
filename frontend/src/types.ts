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
  pages?: number
}

// Cliente
export interface Cliente {
  _id: string
  nome: string
  email: string
  documento: string
  tipo: 'pessoa-fisica' | 'pessoa-juridica'
  telefone?: string
  esferaPublica: boolean
  esferaPublicaRevisao?: boolean
  situacaoCadastral?: string
  naturezaJuridicaCodigo?: string
  naturezaJuridicaDescricao?: string
  validadoSerproEm?: string
  solicitacoesLgpd?: Array<{
    _id: string
    tipo: 'Acesso' | 'Correcao' | 'Exclusao' | 'Portabilidade'
    status: 'Registrada' | 'Em analise' | 'Atendida' | 'Negada'
    motivo?: string
    solicitadaEm: string
    resolvidaEm?: string
  }>
  ativo: boolean
  createdAt: string
}

export type ClientePayload = Omit<Cliente, '_id' | 'createdAt' | 'solicitacoesLgpd' | 'situacaoCadastral' | 'naturezaJuridicaCodigo' | 'naturezaJuridicaDescricao' | 'validadoSerproEm' | 'esferaPublicaRevisao'>

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
  telefone?: string
  emissorNFPadrao: 'XDigital' | 'Revendedor'
  comissaoPercentual?: number
  observacoes?: string
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
  gatilhoFaturamento?: 'marco_agendado' | 'sob_demanda'
  ativo: boolean
  dataInicio: string
  dataFim: string
  assinantes: string[]
  versoes: { numeroVersao: number; arquivoUrl?: string; data: string }[]
  aditivos: { numero: string; valor: number; vigenciaAte?: string; motivo: string; dataAssinatura: string }[]
  createdAt: string
}

export type ContratoPayload = {
  numero: string
  clienteId: string
  valorTotal: number
  modalidade: ModalidadeContrato
  gatilhoFaturamento?: 'marco_agendado' | 'sob_demanda'
  dataInicio: string
  dataFim: string
  assinantes?: string[]
}

export interface ResumoFinanceiroContrato {
  valorOriginal: number
  valorAditivos: number
  valorTotalComDireito: number
  reservado: number
  confirmado: number
  faturado: number
  disponivel: number
}

// Ordem de Fornecimento
export interface OrdemFornecimento {
  _id: string
  numero: string
  contratoId: string
  valor: number
  valorFaturado: number
  status: 'Aberta' | 'Parcial' | 'Fechada'
  dataEmissao: string
  dataFim?: string
  observacoes?: string
  createdAt: string
}

// Pedido
export type EtapaOperacional =
  | 'Pedido' | 'Pagamento' | 'Validacao' | 'Preparacao'
  | 'Processamento' | 'Entrega' | 'Conclusao'

export type StatusPedido = 'Rascunho' | 'Aprovado' | 'Em processo' | 'Faturado' | 'Concluido' | 'Cancelado'

export interface HistoricoEtapa {
  etapa: EtapaOperacional
  data: string
  usuarioId?: string | { _id: string; nome: string; email: string }
  observacao?: string
}

export interface PedidoItem {
  _id?: string
  produtoId: string | Produto
  codigo: string
  nome: string
  quantidade: number
  precoUnitario: number
  valorTabelaUnitario: number
  subtotal: number
  quantidadeExecutada?: number
  quantidadeFaturada?: number
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

export type EvidenciaTipo = 'email' | 'imagem' | 'documento' | 'outro'

export interface Evidencia {
  _id?: string
  tipo: EvidenciaTipo
  origem?: string
  dataRegistro: string
  observacao?: string
  arquivoUrl?: string
  arquivoNome?: string
  arquivoMime?: string
}

export interface NotaEmpenho {
  _id: string
  numero: string
  clienteId: string | Cliente
  contratoId?: string | Contrato
  valor: number
  dataEmissao: string
  dataVencimento?: string
  descricao?: string
  arquivoUrl?: string
  status: 'Aberto' | 'Parcialmente utilizado' | 'Encerrado'
  valorUtilizado: number
  observacoes?: string
  createdAt: string
}

export type NotaEmpenhoPayload = {
  numero: string
  clienteId: string
  contratoId?: string
  valor: number
  dataEmissao: string
  dataVencimento?: string
  descricao?: string
  observacoes?: string
}

export interface Pedido {
  _id: string
  numero: string
  clienteId: string | Cliente
  produtoId: string | Produto
  contratoId?: string | Contrato
  ordemFornecimentoId?: string | OrdemFornecimento
  parceiroId?: string | Parceiro
  notaEmpenhoId?: string | NotaEmpenho
  numeroEmpenhoNoContrato?: string
  ordemFornecimento?: { numero: string; dataEmissao?: string; arquivoUrl?: string }
  solicitacaoFornecimento?: { numero: string; dataEmissao?: string; arquivoUrl?: string }
  origemCompra?: 'site' | 'manual' | 'atendimento'
  protocolo?: string
  protocoloConfirmadoEm?: string
  saldoStatus: 'Reservado' | 'Confirmado' | 'Estornado'
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
    comprovantePagamentoAprovado?: boolean
    contratoModalidade?: string
  }
  status: StatusPedido
  etapaOperacional: EtapaOperacional
  historicoEtapas: HistoricoEtapa[]
  nfEmitida: boolean
  itens: PedidoItem[]
  evidencias: Evidencia[]
  clm?: {
    requestId?: string
    status?: string
    enviadoEm?: string
    atualizadoEm?: string
    quantidadeExecutada: number
    quantidadeFaturavel: number
    ultimoEvento?: string
  }
  observacoes?: string
  createdAt: string
  updatedAt?: string
}

export type PedidoPayload = {
  numero: string
  clienteId: string
  produtoId: string
  contratoId?: string
  ordemFornecimentoId?: string
  parceiroId?: string
  notaEmpenhoId?: string
  numeroEmpenhoNoContrato?: string
  valorTotal: number
  valorTabela: number
  valorRevenda?: number
  cupomCodigo?: string
  itens?: Array<{
    produtoId: string
    quantidade: number
    precoUnitario: number
    valorTabelaUnitario?: number
  }>
  observacoes?: string
  vinculo: Pedido['vinculo']
}

// Nota Fiscal
export interface NotaFiscal {
  _id: string
  numero: string
  pedidoId: string | Pedido
  valor: number
  tipo?: 'Fiscal' | 'Credito'
  notaOriginalId?: string
  aprovacaoEstornoSaldo?: 'Pendente' | 'Aprovado' | 'Negado'
  emissor: 'XDigital' | 'Revendedor'
  status: 'Emitida' | 'Pendente' | 'Cancelada'
  observacoes?: string
  tinyNfeId?: string
  chaveAcesso?: string
  linkAcesso?: string
  situacaoTiny?: 'Rascunho' | 'Autorizada' | 'Cancelada' | 'Erro'
  erroEmissao?: string
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

// Log de sistema
export interface LogEntry {
  _id: string
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  levelNum: number
  message: string
  service: string
  err?: { message: string; stack?: string; type?: string }
  req?: { method: string; url: string; remoteAddress?: string }
  res?: { statusCode: number }
  extra?: Record<string, unknown>
  createdAt: string
}

export interface AuditoriaEntry {
  _id: string
  entidade: string
  entidadeId: string
  acao: string
  usuarioId?: string | { _id: string; nome: string; email: string }
  origem: 'Painel' | 'Loja' | 'CLM' | 'Sistema'
  detalhes?: Record<string, unknown>
  createdAt: string
}

export interface ClmEvent {
  _id: string
  type: string
  status: 'pending' | 'sent' | 'processed' | 'failed' | 'retrying'
  retries: number
  error?: string
  createdAt: string
  updatedAt: string
}

export interface LogStats {
  horas: number
  desde: string
  stats: { warn: number; error: number; fatal: number }
  total: number
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
  totalConciliados?: number
  totalIgnorados?: number
  createdAt: string
}

export interface ConciliacaoResumo {
  porStatus: Record<string, { count: number; valor: number }>
  porBanco: { _id: string; count: number; valor: number }[]
  totalConciliado: number
  lotes: ConciliacaoLote[]
}
