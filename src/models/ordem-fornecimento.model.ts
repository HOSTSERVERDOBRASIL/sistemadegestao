import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface IOrdemFornecimento extends Document {
  numero: string;
  contratoId: Types.ObjectId;
  valor: number;
  valorFaturado: number;
  status: 'Aberta' | 'Parcial' | 'Fechada';
  dataEmissao: Date;
  dataFim?: Date;
  observacoes?: string;
}

const ordemSchema = new Schema<IOrdemFornecimento>({
  numero: { type: String, required: true, unique: true },
  contratoId: { type: Schema.Types.ObjectId, ref: 'Contrato', required: true },
  valor: { type: Number, required: true, min: 0 },
  valorFaturado: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['Aberta', 'Parcial', 'Fechada'], default: 'Aberta' },
  dataEmissao: { type: Date, default: Date.now },
  dataFim: Date,
  observacoes: { type: String, maxlength: 1000 },
}, { timestamps: true });

ordemSchema.index({ contratoId: 1, status: 1 });

export const OrdemFornecimentoModel: Model<IOrdemFornecimento> = mongoose.model<IOrdemFornecimento>('OrdemFornecimento', ordemSchema);
