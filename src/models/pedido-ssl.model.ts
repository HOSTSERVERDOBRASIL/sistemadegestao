import mongoose, { Schema, Document, Model } from 'mongoose';

export type TipoCertificadoSSL = 'DV' | 'OV' | 'EV' | 'Wildcard' | 'MultiDominio' | 'EV-MultiDominio';
export type StatusPedidoSSL = 'Rascunho' | 'Aguardando DCV' | 'Em Validacao' | 'Processando' | 'Emitido' | 'Renovado' | 'Cancelado' | 'Expirado';
export type MetodoDCV = 'HTTP-01' | 'DNS-01' | 'Email';

export interface IPedidoSSL extends Document {
  numero: string;                        // gerado: SSL-YYYY-NNNN
  clienteId: mongoose.Types.ObjectId;
  parceiroId?: mongoose.Types.ObjectId;

  // Certificado
  tipo: TipoCertificadoSSL;
  fornecedor: string;                    // 'Sectigo' | 'DigiCert' | 'GlobalSign' | 'Outros'
  prazoAnos: 1 | 2 | 3 | 4 | 5;

  // Domínios
  dominioPrincipal: string;
  dominiosAdicionais?: string[];         // SANs
  wildcard?: boolean;

  // Validação
  metodoDCV?: MetodoDCV;
  dcvStatus?: 'Pendente' | 'Verificado' | 'Falhou';
  dcvToken?: string;
  dcvVerificadoEm?: Date;

  // Emissão
  status: StatusPedidoSSL;
  sectigoIdOrder?: string;
  chaveAcesso?: string;
  linkAcesso?: string;                   // URL DANFE/download cert

  // Validade
  inicioValidade?: Date;
  fimValidade?: Date;

  // Financeiro
  valorCusto: number;
  valorVenda: number;

  // Renovação
  pedidoOriginalId?: mongoose.Types.ObjectId;

  // Dados da empresa (para OV/EV)
  dadosValidacao?: {
    razaoSocial?: string;
    cnpj?: string;
    enderecoValidado?: string;
    telefoneValidado?: string;
    responsavel?: string;
    cargoResponsavel?: string;
  };

  observacoes?: string;
  historicoEventos?: Array<{
    evento: string;
    data: Date;
    responsavel?: string;
    detalhes?: Record<string, unknown>;
  }>;
}

const PedidoSSLSchema = new Schema<IPedidoSSL>({
  numero: { type: String, required: true, unique: true },
  clienteId: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true },
  parceiroId: { type: Schema.Types.ObjectId, ref: 'Parceiro' },
  tipo: { type: String, enum: ['DV', 'OV', 'EV', 'Wildcard', 'MultiDominio', 'EV-MultiDominio'], required: true },
  fornecedor: { type: String, required: true, default: 'Sectigo' },
  prazoAnos: { type: Number, enum: [1, 2, 3, 4, 5], required: true, default: 1 },
  dominioPrincipal: { type: String, required: true, trim: true, lowercase: true },
  dominiosAdicionais: [{ type: String, trim: true, lowercase: true }],
  wildcard: { type: Boolean, default: false },
  metodoDCV: { type: String, enum: ['HTTP-01', 'DNS-01', 'Email'] },
  dcvStatus: { type: String, enum: ['Pendente', 'Verificado', 'Falhou'] },
  dcvToken: String,
  dcvVerificadoEm: Date,
  status: { type: String, enum: ['Rascunho', 'Aguardando DCV', 'Em Validacao', 'Processando', 'Emitido', 'Renovado', 'Cancelado', 'Expirado'], default: 'Rascunho' },
  sectigoIdOrder: { type: String, sparse: true },
  chaveAcesso: String,
  linkAcesso: String,
  inicioValidade: Date,
  fimValidade: Date,
  valorCusto: { type: Number, required: true, min: 0, default: 0 },
  valorVenda: { type: Number, required: true, min: 0, default: 0 },
  pedidoOriginalId: { type: Schema.Types.ObjectId, ref: 'PedidoSSL' },
  dadosValidacao: {
    razaoSocial: String,
    cnpj: String,
    enderecoValidado: String,
    telefoneValidado: String,
    responsavel: String,
    cargoResponsavel: String,
  },
  observacoes: String,
  historicoEventos: [{ evento: String, data: Date, responsavel: String, detalhes: Schema.Types.Mixed }],
}, { timestamps: true });

PedidoSSLSchema.index({ clienteId: 1, createdAt: -1 });
PedidoSSLSchema.index({ status: 1 });
PedidoSSLSchema.index({ dominioPrincipal: 1 });
PedidoSSLSchema.index({ fimValidade: 1 });
PedidoSSLSchema.index({ numero: 1 });

export const PedidoSSLModel: Model<IPedidoSSL> = mongoose.model<IPedidoSSL>('PedidoSSL', PedidoSSLSchema);
