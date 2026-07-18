import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type TipoCobranca = 'pix' | 'boleto' | 'pix_vencimento';
export type StatusCobranca =
  | 'ATIVA'
  | 'CONCLUIDA'
  | 'REMOVIDA_PELO_USUARIO_RECEBEDOR'
  | 'REMOVIDA_PELO_PSP'
  | 'EXPIRADA';

export interface ICobranca extends Document {
  pedidoId: Types.ObjectId;
  tipo: TipoCobranca;
  valor: number;
  status: StatusCobranca;
  txid?: string;
  loc?: string;
  qrCode?: string;
  qrCodeBase64?: string;
  pixCopiaECola?: string;
  boletoUrl?: string;
  boletoBarcode?: string;
  nossoNumero?: string;
  vencimento?: Date;
  pagoEm?: Date;
  efiResponse?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const cobrancaSchema = new Schema<ICobranca>(
  {
    pedidoId: { type: Schema.Types.ObjectId, ref: 'Pedido', required: true },
    tipo: { type: String, enum: ['pix', 'boleto', 'pix_vencimento'], required: true },
    valor: { type: Number, required: true, min: 0.01 },
    status: {
      type: String,
      enum: ['ATIVA', 'CONCLUIDA', 'REMOVIDA_PELO_USUARIO_RECEBEDOR', 'REMOVIDA_PELO_PSP', 'EXPIRADA'],
      default: 'ATIVA',
    },
    txid: { type: String, index: true, sparse: true },
    loc: String,
    qrCode: String,
    qrCodeBase64: String,
    pixCopiaECola: String,
    boletoUrl: String,
    boletoBarcode: String,
    nossoNumero: String,
    vencimento: Date,
    pagoEm: Date,
    efiResponse: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

cobrancaSchema.index({ pedidoId: 1 });

export const CobrancaModel: Model<ICobranca> = mongoose.model<ICobranca>('Cobranca', cobrancaSchema);
