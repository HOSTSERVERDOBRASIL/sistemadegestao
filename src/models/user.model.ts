import mongoose, { Schema, Document, Model } from 'mongoose';

export type Role = 'admin' | 'operador' | 'financeiro' | 'cliente';

export interface IUser extends Document {
  nome: string;
  email: string;
  passwordHash: string;
  role: Role;
  ativo: boolean;
}

const userSchema = new Schema<IUser>({
  nome: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'operador', 'financeiro', 'cliente'], default: 'operador' },
  ativo: { type: Boolean, default: true }
}, { timestamps: true });

export const UserModel: Model<IUser> = mongoose.model<IUser>('User', userSchema);
