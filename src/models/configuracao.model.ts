import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IConfiguracao extends Document {
  servico: string;
  campos: Map<string, string>;
  atualizadoPor?: string;
  createdAt: Date;
  updatedAt: Date;
}

const configuracaoSchema = new Schema<IConfiguracao>(
  {
    servico: { type: String, required: true, unique: true },
    campos: { type: Map, of: String, default: () => new Map() },
    atualizadoPor: String,
  },
  { timestamps: true }
);

export const ConfiguracaoModel: Model<IConfiguracao> =
  mongoose.model<IConfiguracao>('Configuracao', configuracaoSchema);
