// Auth
export type Role = 'admin' | 'operador' | 'financeiro' | 'cliente' | 'revenda'

export interface User {
  _id: string
  nome: string
  email: string
  role: Role
  clienteId?: string
  parceiroId?: string
  isMasterCliente?: boolean
  primeiroAcesso?: boolean
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
  user: { id: string; email: string; role: Role; parceiroId?: string }
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
  usuarioMasterId?: string | Pick<User, '_id' | 'nome' | 'email' | 'role' | 'ativo' | 'primeiroAcesso'>
  solicitacoesLgpd?: Array<{
    _id: string
    tipo: 'Acesso' | 'Correcao' | 'Exclusao' | 'Portabilidade'
    status: 'Registrada' | 'Em analise' | 'Atendida' | 'Negada'
    motivo?: string
    solicitadaEm: string
    resolvidaEm?: string
  }>
  ativo: boolean
  cnae?: string
  cfps?: string
  cst?: string
  aliquota?: string
  codeMunicipio?: string
  address?: {
    rua?: string
    numero?: string
    bairro?: string
    cidade?: string
    uf?: string
    cep?: string
    codeMunicipio?: string
    complemento?: string
  }
  paymentMethod?: 'PrePago' | 'PosPago' | 'Credito' | 'Livre'
  formaAPagar?: 'Cartao' | 'Pix' | 'Transferencia' | 'NotaEmpenho' | 'Boleto'
  dataPagamento?: number
  dataFechamento?: number
  limiteCredito?: number
  statusCadastro?: 'Ativo' | 'Desativado' | 'Recusado' | 'Fraude' | 'Pendente' | 'Analise' | 'Revisao' | 'Cancelado'
  servicosContratados?: string[]
  permissaoAcme?: boolean
  validacaoOrg?: boolean
  observacoes?: string
  equipe?: Array<{
    _id?: string
    userId?: string
    nome: string
    primeiroNome?: string
    ultimoNome?: string
    cargo?: string
    email: string
    telefone?: string
    cpf?: string
    permissions: string[]
    role?: string
  }>
  portfolioSSL?: Array<{
    _id?: string
    produtoId: string
    nome: string
    tipo: string
    fornecedor?: string
    quantidade: number
    quantidadeEmitida: number
    prazo?: string
    precoCusto?: number
    precoVenda?: number
    numContrato?: string
    ativo: boolean
  }>
  portfolioICP?: Array<{
    _id?: string
    produtoId: string
    produtoAlias?: string
    nome: string
    fornecedor: string
    tipoCertificado?: string
    finalidade?: string
    autoridadeCertificadora?: string
    quantidade: number
    quantidadeEmitida: number
    precoCusto?: number
    precoVenda?: number
    numContrato?: string
  }>
  sectigoData?: {
    dept?: string
    poBox?: string
    applicantEmail?: string
    evSubscriberEmail?: string
    dunsNumber?: string
    dbaName?: string
    businessCategory?: string
    companyRegistrationNumber?: string
    dateOfIncorporation?: string
    jurisdictionCity?: string
    jurisdictionState?: string
    jurisdictionCountry?: string
  }
  licitacoes?: Licitacao[]
  financeiroClm?: {
    entrada?: MovimentoFinanceiro[]
    saida?: MovimentoFinanceiro[]
  }
  createdAt: string
}

export type ClientePayload = Omit<Cliente, '_id' | 'createdAt' | 'solicitacoesLgpd' | 'situacaoCadastral' | 'naturezaJuridicaCodigo' | 'naturezaJuridicaDescricao' | 'validadoSerproEm' | 'esferaPublicaRevisao' | 'usuarioMasterId' | 'equipe' | 'portfolioSSL' | 'portfolioICP' | 'sectigoData'>

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
export type FormaPagamentoRevenda = 'Pre-pago' | 'Pos-pago' | 'Por pedido'
export type ModeloCobrancaCertificado = 'Por emissao' | 'Por pedido' | 'Fatura mensal'

export interface RegraCobrancaRevenda {
  formaPagamento: FormaPagamentoRevenda
  certificadosInternacionais: ModeloCobrancaCertificado
  certificadosIcpBrasil: ModeloCobrancaCertificado
  diaVencimento: number
  limiteCredito: number
}

export interface Parceiro {
  _id: string
  nome: string
  documento: string
  email: string
  telefone?: string
  emissorNFPadrao: 'XDigital' | 'Revendedor'
  comissaoPercentual?: number
  usarRegraCobrancaPadrao: boolean
  regrasCobranca: RegraCobrancaRevenda
  saldoCreditos: number
  observacoes?: string
  ativo: boolean
  createdAt: string
}

export type ParceiroPayload = Omit<Parceiro, '_id' | 'createdAt' | 'saldoCreditos'>

export interface MovimentoCreditoRevenda {
  _id: string
  tipo: 'Aporte' | 'Consumo' | 'Estorno' | 'Ajuste'
  valor: number
  saldoAnterior: number
  saldoPosterior: number
  descricao: string
  createdAt: string
}

export interface RelatorioRevenda {
  saldoCreditos: number
  totalPedidos: number
  pedidosAtivos: number
  pedidosConcluidos: number
  pedidosCancelados: number
  valorTotalPedidos: number
  valorAFaturar: number
  nfsEmitidas: number
  certificados: { categoria: string; quantidade: number; valor: number }[]
  volumeMensal: { mes: string; pedidos: number; valor: number }[]
  topClientes: { nome: string; pedidos: number; valor: number }[]
  cobrancaSituacao: Record<string, number>
}

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
  aditivos: { numero: string; valor: number; vigenciaAte?: string; motivo: string; dataAssinatura: string; tipo?: 'Reequilíbrio Econômico' | 'Acréscimo' | 'Supressão' | 'Prorrogação' }[]
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
  dominioPrincipal?: string
  dominiosAdicionais?: { dominio: string; adicionadoEm: string }[]
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
  cobrancaRevenda?: {
    formaPagamento: FormaPagamentoRevenda
    modeloCertificado: ModeloCobrancaCertificado | 'Misto'
    valorCobrado: number
    situacao: 'Pago com creditos' | 'A faturar' | 'Aguardando pagamento' | 'Estornado'
  }
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
  prazoAnos?: 1 | 2 | 3 | 4 | 5
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
  prazoAnos?: 1 | 2 | 3 | 4 | 5
  observacoes?: string
  vinculo: Pedido['vinculo']
}

// Nota Fiscal
export interface NotaFiscal {
  _id: string
  numero: string
  clienteId?: string | { _id: string; nome: string; documento: string }
  pedidoId: string | Pedido
  valor: number
  tipo?: 'Fiscal' | 'Credito'
  tipoFaturamento?: 'Total' | 'Demanda' | 'Fechamento'
  competencia?: string
  dataVencimento?: string
  codigoServico?: string
  aliquotaISS?: number
  municipioPrestacao?: string
  itensCertificados?: { tipo: string; quantidade: number }[]
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
  type?: 'text' | 'number' | 'select'
  options?: Array<{ value: string; label: string }>
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

export interface CertificadoICP {
  _id: string
  clienteId: string
  companyName: string
  cpfCnpj: string
  nomeEmitente: string
  nomeEmpresa?: string
  numeroCertif: string
  numeroPedido: string
  protocolo?: string
  fornecedor?: string
  fornecedorId?: string
  status: string
  statusRevogacao?: 'ativo' | 'revogado' | 'suspenso' | 'renovado' | 'expirado' | 'solicitado'
  inicioValidade?: string
  fimValidade?: string
  tipoEmissao?: string
  formaEmissao?: 'presencial' | 'videoconferencia' | 'renovacao' | 'api' | 'manual'
  valorXdb: number
  valorVenda: number
  baixado?: boolean
  dataPrimeiroDownload?: string
  dataUltimoDownload?: string
  motivoRevogacao?: string
  solicitacao?: {
    tipoPessoa: 'FISICA' | 'JURIDICA'
    dadosPessoaFisica?: {
      nome: string
      cpf: string
      dataNascimento: string
      contato: { ddd: string; telefone: string; email: string }
    }
    dadosPessoaJuridica?: {
      razaoSocial: string
      cnpj: string
      municipio: string
      uf: string
    }
  }
  createdAt: string
  updatedAt?: string
}

export interface CertificadoSSL {
  _id: string
  clienteId?: string
  companyId?: string
  domain: string
  extraDomain?: string
  nameCert: string
  sectigoIdOrder?: string
  status: string
  dateEmission?: string
  dateUntil?: string
  price?: string
  user?: { email: string; name: string; doc: string }
  createdAt: string
}

export interface Licitacao {
  _id?: string
  contrato: string
  contratoNum?: string
  descricao?: string
  dataInit: string
  dataFin: string
  valorTotal?: number
  produtos?: Array<{ produtoId?: string; nome: string; quantidade: number; valorUnitario?: number }>
  status?: 'Ativo' | 'Encerrado' | 'Suspenso'
}

export interface MovimentoFinanceiro {
  _id?: string
  tipo: string
  valor: number
  data: string
  descricao?: string
  numeroPedido?: string
  nomeUser?: string
  arquivo?: string
}

// Pedidos SSL
export interface PedidoSSL {
  _id: string
  numero: string
  clienteId: string | { _id: string; nome: string; documento: string }
  parceiroId?: string | { _id: string; nome: string }
  tipo: 'DV' | 'OV' | 'EV' | 'Wildcard' | 'MultiDominio' | 'EV-MultiDominio'
  fornecedor: string
  prazoAnos: 1 | 2 | 3 | 4 | 5
  dominioPrincipal: string
  dominiosAdicionais?: string[]
  wildcard?: boolean
  metodoDCV?: 'HTTP-01' | 'DNS-01' | 'Email'
  dcvStatus?: 'Pendente' | 'Verificado' | 'Falhou'
  dcvToken?: string
  dcvVerificadoEm?: string
  status: 'Rascunho' | 'Aguardando DCV' | 'Em Validacao' | 'Processando' | 'Emitido' | 'Renovado' | 'Cancelado' | 'Expirado'
  sectigoIdOrder?: string
  chaveAcesso?: string
  linkAcesso?: string
  inicioValidade?: string
  fimValidade?: string
  valorCusto: number
  valorVenda: number
  pedidoOriginalId?: string
  dadosValidacao?: {
    razaoSocial?: string
    cnpj?: string
    enderecoValidado?: string
    telefoneValidado?: string
    responsavel?: string
    cargoResponsavel?: string
  }
  observacoes?: string
  createdAt: string
  updatedAt?: string
}
