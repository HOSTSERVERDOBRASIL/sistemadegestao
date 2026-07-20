import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICertificadoICP extends Document {
  // Identificação
  clienteId: mongoose.Types.ObjectId;       // ref: Cliente no AtlasX
  clmCompanyId?: string;                     // ID da empresa no CLM (para sincronização)
  clmCertificadoId?: string;                 // ID do certificado no CLM

  // Titular
  cpfCnpj: string;
  nomeEmitente: string;
  nomeEmpresa?: string;
  companyName: string;

  // Certificado
  numeroCertif: string;
  numeroPedido: string;
  protocolo?: string;
  transacaoId?: string;

  // Fornecedor
  fornecedor?: string;       // 'SERPRO' | 'SafeWeb'
  fornecedorId?: string;
  produtoAlias?: string;

  // Validade
  inicioValidade?: string;
  fimValidade?: string;
  tipoEmissao?: string;
  formaEmissao?: 'presencial' | 'videoconferencia' | 'renovacao' | 'api' | 'manual';

  // Status
  status: string;
  statusRevogacao?: 'ativo' | 'revogado' | 'suspenso' | 'renovado' | 'expirado' | 'solicitado';
  dataRevogacao?: Date;
  motivoRevogacao?: string;
  solicitanteRevogacao?: string;

  // Financeiro
  valorXdb: number;
  valorVenda: number;

  // Download
  baixado: boolean;
  dataPrimeiroDownload?: Date;
  dataUltimoDownload?: Date;
  quantidadeDownloads: number;

  // Renovação
  pedidoRenovacaoId?: string;
  dataRenovacao?: Date;
  certificadoPredecessorId?: string;

  // Dados da solicitação (estrutura simplificada)
  solicitacao?: {
    tipoPessoa: 'FISICA' | 'JURIDICA';
    dadosPessoaFisica?: {
      nome: string;
      cpf: string;
      dataNascimento: string;
      contato: { ddd: string; telefone: string; email: string };
      endereco?: { logradouro: string; numero: string; bairro: string; cidade: string; uf: string; cep: string };
    };
    dadosPessoaJuridica?: {
      razaoSocial: string;
      cnpj: string;
      municipio: string;
      uf: string;
      contato: { ddd: string; telefone: string; email: string };
    };
  };

  // Histórico de eventos
  historicoEventos?: Array<{
    evento: string;
    data: Date;
    responsavel?: string;
    detalhes?: Record<string, unknown>;
  }>;

  // Sincronização
  sincronizadoEm?: Date;
  fonteDados: 'clm' | 'manual' | 'importacao';
}

const CertificadoICPSchema = new Schema<ICertificadoICP>(
  {
    clienteId: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true },
    clmCompanyId: { type: String, index: true },
    clmCertificadoId: { type: String, index: true, sparse: true },
    cpfCnpj: { type: String, required: true },
    nomeEmitente: { type: String, required: true },
    nomeEmpresa: String,
    companyName: { type: String, required: true },
    numeroCertif: { type: String, required: true },
    numeroPedido: { type: String, required: true },
    protocolo: String,
    transacaoId: String,
    fornecedor: String,
    fornecedorId: String,
    produtoAlias: String,
    inicioValidade: String,
    fimValidade: String,
    tipoEmissao: String,
    formaEmissao: { type: String, enum: ['presencial', 'videoconferencia', 'renovacao', 'api', 'manual', null] },
    status: { type: String, required: true, default: 'ativo' },
    statusRevogacao: { type: String, enum: ['ativo', 'revogado', 'suspenso', 'renovado', 'expirado', 'solicitado', null], default: 'ativo' },
    dataRevogacao: Date,
    motivoRevogacao: String,
    solicitanteRevogacao: String,
    valorXdb: { type: Number, default: 0 },
    valorVenda: { type: Number, default: 0 },
    baixado: { type: Boolean, default: false },
    dataPrimeiroDownload: Date,
    dataUltimoDownload: Date,
    quantidadeDownloads: { type: Number, default: 0 },
    pedidoRenovacaoId: String,
    dataRenovacao: Date,
    certificadoPredecessorId: String,
    solicitacao: Schema.Types.Mixed,
    historicoEventos: [{ evento: String, data: Date, responsavel: String, detalhes: Schema.Types.Mixed }],
    sincronizadoEm: Date,
    fonteDados: { type: String, enum: ['clm', 'manual', 'importacao'], default: 'manual' },
  },
  { timestamps: true }
);

CertificadoICPSchema.index({ clienteId: 1, createdAt: -1 });
CertificadoICPSchema.index({ cpfCnpj: 1 });
CertificadoICPSchema.index({ fimValidade: 1 });
CertificadoICPSchema.index({ statusRevogacao: 1 });
CertificadoICPSchema.index({ numeroPedido: 1 });

export const CertificadoICPModel: Model<ICertificadoICP> = mongoose.model<ICertificadoICP>('CertificadoICP', CertificadoICPSchema);
