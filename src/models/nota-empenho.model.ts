import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface INotaEmpenho extends Document {
  numero: string;
  clienteId: Types.ObjectId;
  contratoId?: Types.ObjectId;
  valor: number;
  dataEmissao: Date;
  dataVencimento?: Date;
  descricao?: string;
  arquivoUrl?: string;
  status: 'Aberto' | 'Parcialmente utilizado' | 'Encerrado';
  valorUtilizado: number;
  observacoes?: string;
}

const notaEmpenhoSchema = new Schema<INotaEmpenho>({
  numero: { type: String, required: true, unique: true },
  clienteId: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true },
  contratoId: { type: Schema.Types.ObjectId, ref: 'Contrato' },
  valor: { type: Number, required: true, min: 0 },
  dataEmissao: { type: Date, required: true },
  dataVencimento: Date,
  descricao: String,
  arquivoUrl: String,
  status: {
    type: String,
    enum: ['Aberto', 'Parcialmente utilizado', 'Encerrado'],
    default: 'Aberto',
  },
  valorUtilizado: { type: Number, default: 0, min: 0 },
  observacoes: String,
}, { timestamps: true });

notaEmpenhoSchema.index({ clienteId: 1 });
notaEmpenhoSchema.index({ contratoId: 1 });
notaEmpenhoSchema.index({ status: 1 });

export const NotaEmpenhoModel: Model<INotaEmpenho> = mongoose.model<INotaEmpenho>('NotaEmpenho', notaEmpenhoSchema);
