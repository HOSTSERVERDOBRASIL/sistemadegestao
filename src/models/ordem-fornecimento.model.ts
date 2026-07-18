import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IOrdemFornecimento extends Document {
  numero: string;
  contratoId: Types.ObjectId;
  valor: number;
  valorFaturado: number;
  status: 'Aberta' | 'Parcial' | 'Fechada';
}

const ordemSchema = new Schema<IOrdemFornecimento>({
  numero: { type: String, required: true, unique: true },
  contratoId: { type: Schema.Types.ObjectId, ref: 'Contrato', required: true },
  valor: { type: Number, required: true, min: 0 },
  valorFaturado: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['Aberta', 'Parcial', 'Fechada'], default: 'Aberta' }
}, { timestamps: true });

export const OrdemFornecimentoModel: Model<IOrdemFornecimento> = mongoose.model<IOrdemFornecimento>('OrdemFornecimento', ordemSchema);
