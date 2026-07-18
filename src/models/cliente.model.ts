import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ICliente extends Document {
  nome: string;
  email: string;
  documento: string;
  tipo: 'pessoa-fisica' | 'pessoa-juridica';
  telefone?: string;
  ativo: boolean;
}

const clienteSchema = new Schema<ICliente>({
  nome: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  documento: { type: String, required: true, unique: true },
  tipo: { type: String, enum: ['pessoa-fisica', 'pessoa-juridica'], default: 'pessoa-juridica' },
  telefone: String,
  ativo: { type: Boolean, default: true }
}, { timestamps: true });

clienteSchema.index({ nome: 1 });
clienteSchema.index({ ativo: 1 });

export const ClienteModel: Model<ICliente> = mongoose.model<ICliente>('Cliente', clienteSchema);
