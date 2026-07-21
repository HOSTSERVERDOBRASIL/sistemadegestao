import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { nextSeq } from './counter.model.js';

export type StatusProposta =
  | 'Rascunho'
  | 'Enviada'
  | 'Em Negociação'
  | 'Aceita'
  | 'Recusada'
  | 'Expirada'
  | 'Cancelada';

export interface IItemProposta {
  produtoId: Types.ObjectId;
  codigo: string;
  nome: string;
  quantidade: number;
  precoUnitario: number;
  desconto: number;
  subtotal: number;
}

export interface IProposta extends Document {
  numero: string;
  clienteId: Types.ObjectId;
  oportunidadeId?: Types.ObjectId;
  titulo: string;
  itens: IItemProposta[];
  valorTotal: number;
  validade: Date;
  status: StatusProposta;
  observacoes?: string;
  condicoesPagamento?: string;
  responsavelNome?: string;
  tokenAceite?: string;
  tokenAceiteExpira?: Date;
  aceiteEm?: Date;
  aceiteIp?: string;
  aceitePor?: string;
}

const itemPropostaSchema = new Schema<IItemProposta>(
  {
    produtoId: { type: Schema.Types.ObjectId, ref: 'Produto', required: true },
    codigo: { type: String, required: true },
    nome: { type: String, required: true },
    quantidade: { type: Number, required: true, min: 1 },
    precoUnitario: { type: Number, required: true, min: 0 },
    desconto: { type: Number, required: true, min: 0, max: 100, default: 0 },
    subtotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const propostaSchema = new Schema<IProposta>(
  {
    numero: { type: String, required: true, unique: true },
    clienteId: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true },
    oportunidadeId: { type: Schema.Types.ObjectId, ref: 'Oportunidade' },
    titulo: { type: String, required: true, trim: true },
    itens: { type: [itemPropostaSchema], default: [] },
    valorTotal: { type: Number, required: true, min: 0, default: 0 },
    validade: { type: Date, required: true },
    status: {
      type: String,
      enum: ['Rascunho', 'Enviada', 'Em Negociação', 'Aceita', 'Recusada', 'Expirada', 'Cancelada'],
      required: true,
      default: 'Rascunho',
    },
    observacoes: { type: String, maxlength: 2000 },
    condicoesPagamento: { type: String, trim: true },
    responsavelNome: { type: String, trim: true },
    tokenAceite: { type: String, select: false },
    tokenAceiteExpira: Date,
    aceiteEm: Date,
    aceiteIp: { type: String, trim: true },
    aceitePor: { type: String, trim: true },
  },
  { timestamps: true }
);

propostaSchema.index({ clienteId: 1 });
propostaSchema.index({ status: 1 });
propostaSchema.index({ numero: 1 });

/** Gera próximo número no formato PROP-YYYY-NNNN */
export async function nextNumeroProposta(): Promise<string> {
  const ano = new Date().getFullYear();
  const key = `proposta_${ano}`;
  const seq = await nextSeq(key);
  return `PROP-${ano}-${String(seq).padStart(4, '0')}`;
}

export const PropostaModel: Model<IProposta> =
  mongoose.model<IProposta>('Proposta', propostaSchema);
