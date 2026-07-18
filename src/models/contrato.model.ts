import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type ModalidadeContrato = 'Total' | 'Parcial' | 'Por Ordem de Fornecimento';
export type VinculoTipo = 'Contrato' | 'EmpenhoSF' | 'CompraDireta' | 'Revenda';

export interface IContrato extends Document {
  numero: string;
  clienteId: Types.ObjectId;
  valorTotal: number;
  valorFaturado: number;
  modalidade: ModalidadeContrato;
  ativo: boolean;
  dataInicio: Date;
  dataFim: Date;
  assinantes: string[];
  versoes: Array<{ numeroVersao: number; arquivoUrl?: string; data: Date }>;
}

const contratoSchema = new Schema<IContrato>({
  numero: { type: String, required: true, unique: true },
  clienteId: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true },
  valorTotal: { type: Number, required: true, min: 0 },
  valorFaturado: { type: Number, default: 0, min: 0 },
  modalidade: { type: String, enum: ['Total', 'Parcial', 'Por Ordem de Fornecimento'], default: 'Parcial' },
  ativo: { type: Boolean, default: true },
  dataInicio: { type: Date, required: true },
  dataFim: { type: Date, required: true },
  assinantes: [{ type: String }],
  versoes: [{ numeroVersao: Number, arquivoUrl: String, data: Date }]
}, { timestamps: true });

contratoSchema.index({ clienteId: 1 });
contratoSchema.index({ ativo: 1 });
contratoSchema.index({ modalidade: 1 });

export const ContratoModel: Model<IContrato> = mongoose.model<IContrato>('Contrato', contratoSchema);
