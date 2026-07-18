import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface INotaFiscal extends Document {
  numero: string;
  pedidoId: Types.ObjectId;
  valor: number;
  emissor: 'XDigital' | 'Revendedor';
  status: 'Emitida' | 'Pendente' | 'Cancelada';
  observacoes?: string;
  // Campos preenchidos após autorização no Tiny/SEFAZ
  tinyNfeId?: string;
  chaveAcesso?: string;       // 44 dígitos — chave SEFAZ
  linkAcesso?: string;        // URL para DANFE / consulta SEFAZ
  situacaoTiny?: 'Rascunho' | 'Autorizada' | 'Cancelada' | 'Erro';
  erroEmissao?: string;       // Mensagem de erro quando situacaoTiny === 'Erro'
}

const notaSchema = new Schema<INotaFiscal>({
  numero: { type: String, required: true, unique: true },
  pedidoId: { type: Schema.Types.ObjectId, ref: 'Pedido', required: true },
  valor: { type: Number, required: true, min: 0 },
  emissor: { type: String, enum: ['XDigital', 'Revendedor'], required: true },
  status: { type: String, enum: ['Emitida', 'Pendente', 'Cancelada'], default: 'Emitida' },
  observacoes: String,
  tinyNfeId: { type: String, sparse: true, index: true },
  chaveAcesso: { type: String, sparse: true, index: true },
  linkAcesso: String,
  situacaoTiny: { type: String, enum: ['Rascunho', 'Autorizada', 'Cancelada', 'Erro'] },
  erroEmissao: String,
}, { timestamps: true });

notaSchema.index({ pedidoId: 1 });
notaSchema.index({ status: 1 });
notaSchema.index({ emissor: 1 });

export const NotaFiscalModel: Model<INotaFiscal> = mongoose.model<INotaFiscal>('NotaFiscal', notaSchema);
