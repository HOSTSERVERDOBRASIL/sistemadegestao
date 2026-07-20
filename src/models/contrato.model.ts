import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type ModalidadeContrato = 'Total' | 'Parcial' | 'Por Ordem de Fornecimento';
export type VinculoTipo = 'Contrato' | 'EmpenhoSF' | 'CompraDireta' | 'Revenda';
export type TipoDocumentoContrato = 'Contrato' | 'Edital' | 'Termo de Referência' | 'Ata de Registro de Preços' | 'Aditivo' | 'Garantia' | 'Outro';

export interface IDocumentoContrato {
  tipo: TipoDocumentoContrato;
  descricao?: string;
  arquivoUrl: string;
  nomeOriginal?: string;
  dataUpload: Date;
  uploadPorNome?: string;
}

export interface IAditivoContrato {
  numero: string;
  valor: number;
  vigenciaAte?: Date;
  motivo: string;
  dataAssinatura: Date;
  tipo?: 'Reequilíbrio Econômico' | 'Acréscimo' | 'Supressão' | 'Prorrogação';
}

export interface IContrato extends Document {
  numero: string;
  clienteId: Types.ObjectId;
  valorTotal: number;
  valorFaturado: number;
  modalidade: ModalidadeContrato;
  gatilhoFaturamento?: 'marco_agendado' | 'sob_demanda';
  ativo: boolean;
  dataInicio: Date;
  dataFim: Date;
  assinantes: string[];
  versoes: Array<{ numeroVersao: number; arquivoUrl?: string; data: Date }>;
  documentos: IDocumentoContrato[];
  aditivos: IAditivoContrato[];
}

const contratoSchema = new Schema<IContrato>({
  numero: { type: String, required: true, unique: true },
  clienteId: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true },
  valorTotal: { type: Number, required: true, min: 0 },
  valorFaturado: { type: Number, default: 0, min: 0 },
  modalidade: { type: String, enum: ['Total', 'Parcial', 'Por Ordem de Fornecimento'], default: 'Parcial' },
  gatilhoFaturamento: { type: String, enum: ['marco_agendado', 'sob_demanda'] },
  ativo: { type: Boolean, default: true },
  dataInicio: { type: Date, required: true },
  dataFim: { type: Date, required: true },
  assinantes: [{ type: String }],
  versoes: [{ numeroVersao: Number, arquivoUrl: String, data: Date }],
  documentos: [{
    tipo: { type: String, enum: ['Contrato', 'Edital', 'Termo de Referência', 'Ata de Registro de Preços', 'Aditivo', 'Garantia', 'Outro'], required: true },
    descricao: String,
    arquivoUrl: { type: String, required: true },
    nomeOriginal: String,
    dataUpload: { type: Date, default: Date.now },
    uploadPorNome: String,
  }],
  aditivos: [{
    numero: { type: String, required: true },
    valor: { type: Number, required: true },
    vigenciaAte: Date,
    motivo: { type: String, required: true },
    dataAssinatura: { type: Date, required: true },
    tipo: { type: String, enum: ['Reequilíbrio Econômico', 'Acréscimo', 'Supressão', 'Prorrogação'] },
  }]
}, { timestamps: true });

contratoSchema.index({ clienteId: 1 });
contratoSchema.index({ ativo: 1 });
contratoSchema.index({ modalidade: 1 });

export const ContratoModel: Model<IContrato> = mongoose.model<IContrato>('Contrato', contratoSchema);
