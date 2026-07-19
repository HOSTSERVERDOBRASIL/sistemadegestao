import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type TipoMovimentoCreditoRevenda = 'Aporte' | 'Consumo' | 'Estorno' | 'Ajuste';

export interface IMovimentoCreditoRevenda extends Document {
  parceiroId: Types.ObjectId;
  pedidoId?: Types.ObjectId;
  tipo: TipoMovimentoCreditoRevenda;
  valor: number;
  saldoAnterior: number;
  saldoPosterior: number;
  descricao: string;
  usuarioId?: Types.ObjectId;
}

const schema = new Schema<IMovimentoCreditoRevenda>({
  parceiroId: { type: Schema.Types.ObjectId, ref: 'Parceiro', required: true, index: true },
  pedidoId: { type: Schema.Types.ObjectId, ref: 'Pedido', index: true },
  tipo: { type: String, enum: ['Aporte', 'Consumo', 'Estorno', 'Ajuste'], required: true },
  valor: { type: Number, required: true },
  saldoAnterior: { type: Number, required: true, min: 0 },
  saldoPosterior: { type: Number, required: true, min: 0 },
  descricao: { type: String, required: true, trim: true },
  usuarioId: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

schema.index({ parceiroId: 1, createdAt: -1 });

export const MovimentoCreditoRevendaModel: Model<IMovimentoCreditoRevenda> =
  mongoose.model<IMovimentoCreditoRevenda>('MovimentoCreditoRevenda', schema);
