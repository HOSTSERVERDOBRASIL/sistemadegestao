import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface INotaFiscal extends Document {
  numero: string;
  clienteId?: Types.ObjectId;
  pedidoId?: Types.ObjectId;
  descricao?: string;
  valor: number;
  tipo: 'Fiscal' | 'Credito';
  tipoFaturamento?: 'Total' | 'Demanda' | 'Fechamento';
  competencia?: string;
  dataVencimento?: Date;
  codigoServico?: string;
  aliquotaISS?: number;
  municipioPrestacao?: string;
  itensCertificados?: { tipo: string; quantidade: number }[];
  notaOriginalId?: Types.ObjectId;
  aprovacaoEstornoSaldo?: 'Pendente' | 'Aprovado' | 'Negado';
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
  clienteId: { type: Schema.Types.ObjectId, ref: 'Cliente', required: false },
  pedidoId: { type: Schema.Types.ObjectId, ref: 'Pedido', required: false },
  descricao: { type: String },
  valor: { type: Number, required: true },
  tipo: { type: String, enum: ['Fiscal', 'Credito'], default: 'Fiscal' },
  tipoFaturamento: { type: String, enum: ['Total', 'Demanda', 'Fechamento'] },
  competencia: { type: String },
  dataVencimento: { type: Date },
  codigoServico: { type: String },
  aliquotaISS: { type: Number },
  municipioPrestacao: { type: String },
  itensCertificados: [{ tipo: { type: String }, quantidade: { type: Number } }],
  notaOriginalId: { type: Schema.Types.ObjectId, ref: 'NotaFiscal' },
  aprovacaoEstornoSaldo: { type: String, enum: ['Pendente', 'Aprovado', 'Negado'] },
  emissor: { type: String, enum: ['XDigital', 'Revendedor'], required: true },
  status: { type: String, enum: ['Emitida', 'Pendente', 'Cancelada'], default: 'Emitida' },
  observacoes: String,
  tinyNfeId: { type: String, sparse: true, index: true },
  chaveAcesso: { type: String, sparse: true, index: true },
  linkAcesso: String,
  situacaoTiny: { type: String, enum: ['Rascunho', 'Autorizada', 'Cancelada', 'Erro'] },
  erroEmissao: String,
}, { timestamps: true });

notaSchema.index({ clienteId: 1 });
notaSchema.index({ pedidoId: 1 });
notaSchema.index({ status: 1 });
notaSchema.index({ emissor: 1 });
notaSchema.index({ tipo: 1, aprovacaoEstornoSaldo: 1 });

export const NotaFiscalModel: Model<INotaFiscal> = mongoose.model<INotaFiscal>('NotaFiscal', notaSchema);
