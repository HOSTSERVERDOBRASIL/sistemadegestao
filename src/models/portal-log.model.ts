import mongoose, { Schema, Document, Model } from 'mongoose';

export type AcaoPortal =
  | 'acesso'             // visualizou o portal
  | 'segundo_fator'      // tentativa de segundo fator
  | 'download_doc'       // baixou documento
  | 'upload_doc'         // enviou documento
  | 'aceite'             // clicou em aceitar
  | 'formulario_salvo'   // salvou formulário
  | 'formulario_enviado' // submeteu formulário
  | 'token_invalido'     // tentativa com token inválido
  | 'token_expirado'     // tentativa com token expirado
  | 'rate_limit';        // bloqueado por rate limit

export interface IPortalLog extends Document {
  // tokenId pode ser null em tentativas com token inválido
  tokenId?: mongoose.Types.ObjectId;
  pedidoId?: mongoose.Types.ObjectId;
  pedidoNumero?: string;
  acao: AcaoPortal;
  sucesso: boolean;
  ip?: string;
  userAgent?: string;
  detalhe?: string;
  dataAcao: Date;
}

const PortalLogSchema = new Schema<IPortalLog>({
  tokenId: { type: Schema.Types.ObjectId, ref: 'PortalToken' },
  pedidoId: { type: Schema.Types.ObjectId, ref: 'Pedido' },
  pedidoNumero: String,
  acao: {
    type: String,
    enum: ['acesso','segundo_fator','download_doc','upload_doc','aceite','formulario_salvo','formulario_enviado','token_invalido','token_expirado','rate_limit'],
    required: true,
  },
  sucesso: { type: Boolean, required: true },
  ip: String,
  userAgent: String,
  detalhe: String,
  dataAcao: { type: Date, default: Date.now },
}, { timestamps: false });

PortalLogSchema.index({ tokenId: 1, dataAcao: -1 });
PortalLogSchema.index({ pedidoId: 1 });
PortalLogSchema.index({ dataAcao: -1 });
PortalLogSchema.index({ ip: 1, dataAcao: -1 });

// TTL: logs de portal ficam 90 dias
PortalLogSchema.index({ dataAcao: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

export const PortalLogModel: Model<IPortalLog> = mongoose.model<IPortalLog>('PortalLog', PortalLogSchema);
