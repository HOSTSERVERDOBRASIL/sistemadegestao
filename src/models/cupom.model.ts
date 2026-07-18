import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type TipoDesconto = 'percentual' | 'fixo';
export type StatusCupom = 'ativo' | 'inativo' | 'expirado';

export interface ICupom extends Document {
  codigo: string;
  descricao?: string;
  tipo: TipoDesconto;
  valor: number;
  valorMinimoPedido?: number;
  valorMaximoDesconto?: number;
  usosMaximos?: number;
  usosRealizados: number;
  validoDe?: Date;
  validoAte?: Date;
  produtoIds?: Types.ObjectId[];
  clienteIds?: Types.ObjectId[];
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const cupomSchema = new Schema<ICupom>(
  {
    codigo: { type: String, required: true, unique: true, uppercase: true, trim: true },
    descricao: String,
    tipo: { type: String, enum: ['percentual', 'fixo'], required: true },
    valor: { type: Number, required: true, min: 0 },
    valorMinimoPedido: { type: Number, min: 0 },
    valorMaximoDesconto: { type: Number, min: 0 },
    usosMaximos: { type: Number, min: 1 },
    usosRealizados: { type: Number, default: 0, min: 0 },
    validoDe: Date,
    validoAte: Date,
    produtoIds: [{ type: Schema.Types.ObjectId, ref: 'Produto' }],
    clienteIds: [{ type: Schema.Types.ObjectId, ref: 'Cliente' }],
    ativo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

cupomSchema.index({ ativo: 1, validoAte: 1 });

export const CupomModel: Model<ICupom> = mongoose.model<ICupom>('Cupom', cupomSchema);
