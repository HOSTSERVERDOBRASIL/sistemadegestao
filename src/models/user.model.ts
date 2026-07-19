import mongoose, { Schema, Document, Model } from 'mongoose';

export type Role = 'admin' | 'operador' | 'financeiro' | 'cliente' | 'revenda';

export interface IUser extends Document {
  nome: string;
  email: string;
  passwordHash: string;
  role: Role;
  clienteId?: mongoose.Types.ObjectId;
  parceiroId?: mongoose.Types.ObjectId;
  isMasterCliente: boolean;
  primeiroAcesso: boolean;
  ativo: boolean;
}

const userSchema = new Schema<IUser>({
  nome: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'operador', 'financeiro', 'cliente', 'revenda'], default: 'operador' },
  clienteId: { type: Schema.Types.ObjectId, ref: 'Cliente', index: true },
  parceiroId: { type: Schema.Types.ObjectId, ref: 'Parceiro', index: true },
  isMasterCliente: { type: Boolean, default: false },
  primeiroAcesso: { type: Boolean, default: false },
  ativo: { type: Boolean, default: true }
}, { timestamps: true });

export const UserModel: Model<IUser> = mongoose.model<IUser>('User', userSchema);
