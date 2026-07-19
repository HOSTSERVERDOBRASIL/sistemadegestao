import mongoose, { Schema, Document, Model } from 'mongoose';

export type FormaPagamentoRevenda = 'Pre-pago' | 'Pos-pago' | 'Por pedido';
export type ModeloCobrancaCertificado = 'Por emissao' | 'Por pedido' | 'Fatura mensal';

export interface IRegraCobrancaRevenda {
  formaPagamento: FormaPagamentoRevenda;
  certificadosInternacionais: ModeloCobrancaCertificado;
  certificadosIcpBrasil: ModeloCobrancaCertificado;
  diaVencimento: number;
  limiteCredito: number;
}

export interface IParceiro extends Document {
  nome: string;
  documento: string;
  email: string;
  telefone?: string;
  emissorNFPadrao: 'XDigital' | 'Revendedor';
  comissaoPercentual?: number;
  usarRegraCobrancaPadrao: boolean;
  regrasCobranca: IRegraCobrancaRevenda;
  saldoCreditos: number;
  observacoes?: string;
  ativo: boolean;
}

const parceiroSchema = new Schema<IParceiro>({
  nome: { type: String, required: true },
  documento: { type: String, required: true, unique: true },
  email: { type: String, required: true, lowercase: true },
  telefone: String,
  emissorNFPadrao: { type: String, enum: ['XDigital', 'Revendedor'], default: 'XDigital' },
  comissaoPercentual: { type: Number, min: 0, max: 100 },
  usarRegraCobrancaPadrao: { type: Boolean, default: true },
  regrasCobranca: {
    formaPagamento: { type: String, enum: ['Pre-pago', 'Pos-pago', 'Por pedido'], default: 'Pre-pago' },
    certificadosInternacionais: { type: String, enum: ['Por emissao', 'Por pedido', 'Fatura mensal'], default: 'Por emissao' },
    certificadosIcpBrasil: { type: String, enum: ['Por emissao', 'Por pedido', 'Fatura mensal'], default: 'Por emissao' },
    diaVencimento: { type: Number, min: 1, max: 28, default: 10 },
    limiteCredito: { type: Number, min: 0, default: 0 },
  },
  saldoCreditos: { type: Number, min: 0, default: 0 },
  observacoes: String,
  ativo: { type: Boolean, default: true }
}, { timestamps: true });

export const ParceiroModel: Model<IParceiro> = mongoose.model<IParceiro>('Parceiro', parceiroSchema);
