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
  solicitacoesLgpd: Array<{
    tipo: TipoSolicitacaoLgpd;
    status: 'Registrada' | 'Em analise' | 'Atendida' | 'Negada';
    motivo?: string;
    solicitadaEm: Date;
    resolvidaEm?: Date;
    resolvidaPor?: mongoose.Types.ObjectId;
  }>;
  ativo: boolean;
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
  solicitacoesLgpd: [{
    tipo: { type: String, enum: ['Acesso', 'Correcao', 'Exclusao', 'Portabilidade'], required: true },
    status: { type: String, enum: ['Registrada', 'Em analise', 'Atendida', 'Negada'], default: 'Registrada' },
    motivo: String,
    solicitadaEm: { type: Date, default: Date.now },
    resolvidaEm: Date,
    resolvidaPor: { type: Schema.Types.ObjectId, ref: 'User' },
  }],
  ativo: { type: Boolean, default: true }
}, { timestamps: true });

clienteSchema.index({ nome: 1 });
clienteSchema.index({ ativo: 1 });

export const ClienteModel: Model<ICliente> = mongoose.model<ICliente>('Cliente', clienteSchema);
