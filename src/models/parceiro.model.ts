import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IParceiro extends Document {
  nome: string;
  documento: string;
  email: string;
  telefone?: string;
  emissorNFPadrao: 'XDigital' | 'Revendedor';
  comissaoPercentual?: number;
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
  observacoes: String,
  ativo: { type: Boolean, default: true }
}, { timestamps: true });

export const ParceiroModel: Model<IParceiro> = mongoose.model<IParceiro>('Parceiro', parceiroSchema);
