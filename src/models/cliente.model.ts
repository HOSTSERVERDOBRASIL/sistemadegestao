import mongoose, { Schema, Document, Model } from 'mongoose';

export type TipoSolicitacaoLgpd = 'Acesso' | 'Correcao' | 'Exclusao' | 'Portabilidade';

export interface ICliente extends Document {
  nome: string;
  email: string;
  documento: string;
  tipo: 'pessoa-fisica' | 'pessoa-juridica';
  telefone?: string;
  esferaPublica: boolean;
  esferaPublicaRevisao: boolean;
  situacaoCadastral?: string;
  naturezaJuridicaCodigo?: string;
  naturezaJuridicaDescricao?: string;
  validadoSerproEm?: Date;
  usuarioMasterId?: mongoose.Types.ObjectId;
  solicitacoesLgpd: Array<{
    tipo: TipoSolicitacaoLgpd;
    status: 'Registrada' | 'Em analise' | 'Atendida' | 'Negada';
    motivo?: string;
    solicitadaEm: Date;
    resolvidaEm?: Date;
    resolvidaPor?: mongoose.Types.ObjectId;
  }>;
  ativo: boolean;

  // Campos fiscais
  cnae?: string;
  cfps?: string;
  cst?: string;
  aliquota?: string;
  codeMunicipio?: string;

  // Endereço completo
  address?: {
    rua?: string;
    numero?: string;
    bairro?: string;
    cidade?: string;
    uf?: string;
    cep?: string;
    codeMunicipio?: string;
    complemento?: string;
  };

  // Dados de pagamento
  paymentMethod?: 'PrePago' | 'PosPago' | 'Credito' | 'Livre';
  formaAPagar?: 'Cartao' | 'Pix' | 'Transferencia' | 'NotaEmpenho' | 'Boleto';
  dataPagamento?: number;
  dataFechamento?: number;
  limiteCredito?: number;

  // Status granular
  statusCadastro?: 'Ativo' | 'Desativado' | 'Recusado' | 'Fraude' | 'Pendente' | 'Analise' | 'Revisao' | 'Cancelado';

  // Flags de serviço
  servicosContratados?: string[];
  permissaoAcme?: boolean;
  validacaoOrg?: boolean;

  // Equipe
  equipe?: Array<{
    userId?: mongoose.Types.ObjectId;
    nome: string;
    primeiroNome?: string;
    ultimoNome?: string;
    cargo?: string;
    email: string;
    telefone?: string;
    cpf?: string;
    permissions: string[];
    role?: string;
  }>;

  // Portfólio SSL/Raiz contratado
  portfolioSSL?: Array<{
    produtoId: string;
    nome: string;
    tipo: string;
    fornecedor?: string;
    quantidade: number;
    quantidadeEmitida: number;
    prazo?: string;
    precoCusto?: number;
    precoVenda?: number;
    numContrato?: string;
    ativo: boolean;
  }>;

  // Portfólio ICP-Brasil contratado
  portfolioICP?: Array<{
    produtoId: string;
    produtoAlias?: string;
    nome: string;
    fornecedor: string;
    tipoCertificado?: string;
    finalidade?: string;
    autoridadeCertificadora?: string;
    quantidade: number;
    quantidadeEmitida: number;
    precoCusto?: number;
    precoVenda?: number;
    numContrato?: string;
  }>;

  // Dados Sectigo para pré-validação OV/EV
  sectigoData?: {
    dept?: string;
    poBox?: string;
    applicantEmail?: string;
    evSubscriberEmail?: string;
    dunsNumber?: string;
    dbaName?: string;
    businessCategory?: string;
    companyRegistrationNumber?: string;
    dateOfIncorporation?: string;
    jurisdictionCity?: string;
    jurisdictionState?: string;
    jurisdictionCountry?: string;
  };

  // Observações internas
  observacoes?: string;
}

const clienteSchema = new Schema<ICliente>({
  nome: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  documento: { type: String, required: true, unique: true },
  tipo: { type: String, enum: ['pessoa-fisica', 'pessoa-juridica'], default: 'pessoa-juridica' },
  telefone: String,
  esferaPublica: { type: Boolean, default: false },
  esferaPublicaRevisao: { type: Boolean, default: false },
  situacaoCadastral: String,
  naturezaJuridicaCodigo: String,
  naturezaJuridicaDescricao: String,
  validadoSerproEm: Date,
  usuarioMasterId: { type: Schema.Types.ObjectId, ref: 'User' },
  solicitacoesLgpd: [{
    tipo: { type: String, enum: ['Acesso', 'Correcao', 'Exclusao', 'Portabilidade'], required: true },
    status: { type: String, enum: ['Registrada', 'Em analise', 'Atendida', 'Negada'], default: 'Registrada' },
    motivo: String,
    solicitadaEm: { type: Date, default: Date.now },
    resolvidaEm: Date,
    resolvidaPor: { type: Schema.Types.ObjectId, ref: 'User' },
  }],
  ativo: { type: Boolean, default: true },

  // Campos fiscais
  cnae: { type: String },
  cfps: { type: String },
  cst: { type: String },
  aliquota: { type: String },
  codeMunicipio: { type: String },

  // Endereço completo
  address: {
    rua: { type: String },
    numero: { type: String },
    bairro: { type: String },
    cidade: { type: String },
    uf: { type: String },
    cep: { type: String },
    codeMunicipio: { type: String },
    complemento: { type: String },
  },

  // Dados de pagamento
  paymentMethod: { type: String, enum: ['PrePago', 'PosPago', 'Credito', 'Livre'] },
  formaAPagar: { type: String, enum: ['Cartao', 'Pix', 'Transferencia', 'NotaEmpenho', 'Boleto'] },
  dataPagamento: { type: Number },
  dataFechamento: { type: Number },
  limiteCredito: { type: Number },

  // Status granular
  statusCadastro: {
    type: String,
    enum: ['Ativo', 'Desativado', 'Recusado', 'Fraude', 'Pendente', 'Analise', 'Revisao', 'Cancelado'],
  },

  // Flags de serviço
  servicosContratados: [{ type: String }],
  permissaoAcme: { type: Boolean },
  validacaoOrg: { type: Boolean },

  // Equipe
  equipe: [{
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    nome: { type: String, required: true },
    primeiroNome: { type: String },
    ultimoNome: { type: String },
    cargo: { type: String },
    email: { type: String, required: true },
    telefone: { type: String },
    cpf: { type: String },
    permissions: [{ type: String }],
    role: { type: String },
  }],

  // Portfólio SSL/Raiz contratado
  portfolioSSL: [{
    produtoId: { type: String, required: true },
    nome: { type: String, required: true },
    tipo: { type: String, required: true },
    fornecedor: { type: String },
    quantidade: { type: Number, required: true },
    quantidadeEmitida: { type: Number, required: true },
    prazo: { type: String },
    precoCusto: { type: Number },
    precoVenda: { type: Number },
    numContrato: { type: String },
    ativo: { type: Boolean, required: true },
  }],

  // Portfólio ICP-Brasil contratado
  portfolioICP: [{
    produtoId: { type: String, required: true },
    produtoAlias: { type: String },
    nome: { type: String, required: true },
    fornecedor: { type: String, required: true },
    tipoCertificado: { type: String },
    finalidade: { type: String },
    autoridadeCertificadora: { type: String },
    quantidade: { type: Number, required: true },
    quantidadeEmitida: { type: Number, required: true },
    precoCusto: { type: Number },
    precoVenda: { type: Number },
    numContrato: { type: String },
  }],

  // Dados Sectigo para pré-validação OV/EV
  sectigoData: {
    dept: { type: String },
    poBox: { type: String },
    applicantEmail: { type: String },
    evSubscriberEmail: { type: String },
    dunsNumber: { type: String },
    dbaName: { type: String },
    businessCategory: { type: String },
    companyRegistrationNumber: { type: String },
    dateOfIncorporation: { type: String },
    jurisdictionCity: { type: String },
    jurisdictionState: { type: String },
    jurisdictionCountry: { type: String },
  },

  // Observações internas
  observacoes: { type: String },
}, { timestamps: true });

clienteSchema.index({ nome: 1 });
clienteSchema.index({ ativo: 1 });
clienteSchema.index({ 'address.uf': 1 });
clienteSchema.index({ statusCadastro: 1 });
clienteSchema.index({ servicosContratados: 1 });

export const ClienteModel: Model<ICliente> = mongoose.model<ICliente>('Cliente', clienteSchema);
