import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IParceiro extends Document {
  nome: string;
  documento: string;
  email: string;
  emissorNFPadrao: 'XDigital' | 'Revendedor';
  ativo: boolean;
}

const parceiroSchema = new Schema<IParceiro>({
  nome: { type: String, required: true },
  documento: { type: String, required: true, unique: true },
  email: { type: String, required: true, lowercase: true },
  emissorNFPadrao: { type: String, enum: ['XDigital', 'Revendedor'], default: 'XDigital' },
  ativo: { type: Boolean, default: true }
}, { timestamps: true });

export const ParceiroModel: Model<IParceiro> = mongoose.model<IParceiro>('Parceiro', parceiroSchema);
