import mongoose, { Schema, Document, Model } from 'mongoose';

export type TipoSubmission = 'documentos' | 'formulario_icp' | 'aceite' | 'observacao';
export type StatusSubmission = 'recebido' | 'em_analise' | 'aprovado' | 'rejeitado';

export interface IArquivoSubmission {
  nomeOriginal: string;
  nomeArquivo: string;   // nome salvo no servidor
  tamanho: number;
  mimetype: string;
  descricao?: string;
}

export interface IPortalSubmission extends Document {
  tokenId: mongoose.Types.ObjectId;
  pedidoId: mongoose.Types.ObjectId;
  pedidoNumero: string;
  clienteId: mongoose.Types.ObjectId;
  clienteNome: string;

  tipo: TipoSubmission;
  status: StatusSubmission;

  // Dados enviados pelo cliente (formulário livre)
  dados?: Record<string, unknown>;

  // Arquivos enviados
  arquivos: IArquivoSubmission[];

  // Observação do cliente
  observacao?: string;

  // Revisão interna
  revisadoPorId?: mongoose.Types.ObjectId;
  revisadoPorNome?: string;
  revisadoEm?: Date;
  observacaoInterna?: string;

  ip?: string;
}

const ArquivoSchema = new Schema<IArquivoSubmission>({
  nomeOriginal: { type: String, required: true },
  nomeArquivo: { type: String, required: true },
  tamanho: { type: Number, required: true },
  mimetype: { type: String, required: true },
  descricao: String,
}, { _id: false });

const PortalSubmissionSchema = new Schema<IPortalSubmission>({
  tokenId: { type: Schema.Types.ObjectId, ref: 'PortalToken', required: true },
  pedidoId: { type: Schema.Types.ObjectId, ref: 'Pedido', required: true },
  pedidoNumero: { type: String, required: true },
  clienteId: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true },
  clienteNome: { type: String, required: true },
  tipo: { type: String, enum: ['documentos', 'formulario_icp', 'aceite', 'observacao'], required: true },
  status: { type: String, enum: ['recebido', 'em_analise', 'aprovado', 'rejeitado'], default: 'recebido' },
  dados: { type: Schema.Types.Mixed },
  arquivos: [ArquivoSchema],
  observacao: String,
  revisadoPorId: Schema.Types.ObjectId,
  revisadoPorNome: String,
  revisadoEm: Date,
  observacaoInterna: String,
  ip: String,
}, { timestamps: true });

PortalSubmissionSchema.index({ pedidoId: 1, createdAt: -1 });
PortalSubmissionSchema.index({ tokenId: 1 });
PortalSubmissionSchema.index({ status: 1 });

export const PortalSubmissionModel: Model<IPortalSubmission> = mongoose.model<IPortalSubmission>('PortalSubmission', PortalSubmissionSchema);
