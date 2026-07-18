import mongoose, { Schema, Document, Model } from 'mongoose';
import type { BancoOrigem, OrigemLancamento } from './lancamento-bancario.model.js';

export interface IConciliacaoLote extends Document {
  banco: BancoOrigem;
  origem: OrigemLancamento;
  arquivoNome?: string;
  arquivoUrl?: string;
  periodoInicio?: Date;
  periodoFim?: Date;
  totalLancamentos: number;
  totalConciliados: number;
  totalIgnorados: number;
  importadoPor?: string;
  createdAt: Date;
  updatedAt: Date;
}

const loteSchema = new Schema<IConciliacaoLote>(
  {
    banco:             { type: String, enum: ['BB', 'Bradesco', 'Manual', 'Efi'], required: true },
    origem:            { type: String, enum: ['manual', 'ofx', 'api_bb', 'api_bradesco'], required: true },
    arquivoNome:       String,
    arquivoUrl:        String,
    periodoInicio:     Date,
    periodoFim:        Date,
    totalLancamentos:  { type: Number, default: 0 },
    totalConciliados:  { type: Number, default: 0 },
    totalIgnorados:    { type: Number, default: 0 },
    importadoPor:      String,
  },
  { timestamps: true }
);

export const ConciliacaoLoteModel: Model<IConciliacaoLote> =
  mongoose.model<IConciliacaoLote>('ConciliacaoLote', loteSchema);
