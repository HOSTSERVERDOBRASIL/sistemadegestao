import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IAuditoria extends Document {
  entidade: 'Cliente' | 'Contrato' | 'Pedido' | 'NotaFiscal' | 'Integracao' | 'Certificacao';
  entidadeId: string;
  acao: string;
  usuarioId?: Types.ObjectId;
  origem: 'Painel' | 'Loja' | 'CLM' | 'Sistema';
  detalhes?: Record<string, unknown>;
  createdAt: Date;
}

const auditoriaSchema = new Schema<IAuditoria>({
  entidade: { type: String, enum: ['Cliente', 'Contrato', 'Pedido', 'NotaFiscal', 'Integracao', 'Certificacao'], required: true },
  entidadeId: { type: String, required: true },
  acao: { type: String, required: true },
  usuarioId: { type: Schema.Types.ObjectId, ref: 'User' },
  origem: { type: String, enum: ['Painel', 'Loja', 'CLM', 'Sistema'], required: true },
  detalhes: { type: Schema.Types.Mixed },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

auditoriaSchema.index({ entidade: 1, entidadeId: 1, createdAt: -1 });
auditoriaSchema.index({ usuarioId: 1, createdAt: -1 });
auditoriaSchema.index({ acao: 1, createdAt: -1 });

export const AuditoriaModel: Model<IAuditoria> = mongoose.model<IAuditoria>('Auditoria', auditoriaSchema);
