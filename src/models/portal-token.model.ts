import mongoose, { Schema, Document, Model } from 'mongoose';
import crypto from 'crypto';

export type EscopoToken =
  | 'acompanhamento'         // só visualizar o pedido
  | 'envio_documentos'       // visualizar + enviar documentos
  | 'aceite'                 // visualizar + aceitar proposta/contrato
  | 'formulario_icp'         // preencher formulário ICP-Brasil
  | 'completo';              // todos os escopos acima

export type StatusToken = 'ativo' | 'expirado' | 'revogado' | 'esgotado';

export interface IPortalToken extends Document {
  // Token em plain text nunca é armazenado — só o hash SHA-256
  tokenHash: string;

  // Referência ao pedido
  pedidoId: mongoose.Types.ObjectId;
  pedidoNumero: string;

  // Referência ao cliente
  clienteId: mongoose.Types.ObjectId;
  clienteNome: string;
  clienteEmail: string;

  escopo: EscopoToken;
  status: StatusToken;

  // Expiração
  expiresAt: Date;

  // Controle de uso
  acessos: number;
  maxAcessos?: number;

  // Segundo fator opcional
  segundoFator?: {
    tipo: 'cpf_digitos' | 'data_nascimento' | 'codigo_email';
    valorHash: string;        // hash do valor correto
  };

  // Metadata
  geradoPorId: mongoose.Types.ObjectId;
  geradoPorNome: string;
  emailEnviado: boolean;
  emailEnviadoEm?: Date;
  revogadoPorId?: mongoose.Types.ObjectId;
  revogadoPorNome?: string;
  revogadoEm?: Date;
  motivoRevogacao?: string;
  observacoes?: string;
}

const PortalTokenSchema = new Schema<IPortalToken>({
  tokenHash: { type: String, required: true, unique: true, index: true },
  pedidoId: { type: Schema.Types.ObjectId, ref: 'Pedido', required: true },
  pedidoNumero: { type: String, required: true },
  clienteId: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true },
  clienteNome: { type: String, required: true },
  clienteEmail: { type: String, required: true },
  escopo: {
    type: String,
    enum: ['acompanhamento', 'envio_documentos', 'aceite', 'formulario_icp', 'completo'],
    default: 'acompanhamento',
  },
  status: { type: String, enum: ['ativo', 'expirado', 'esgotado', 'revogado'], default: 'ativo' },
  expiresAt: { type: Date, required: true },
  acessos: { type: Number, default: 0 },
  maxAcessos: { type: Number },
  segundoFator: {
    tipo: { type: String, enum: ['cpf_digitos', 'data_nascimento', 'codigo_email'] },
    valorHash: String,
  },
  geradoPorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  geradoPorNome: { type: String, required: true },
  emailEnviado: { type: Boolean, default: false },
  emailEnviadoEm: Date,
  revogadoPorId: Schema.Types.ObjectId,
  revogadoPorNome: String,
  revogadoEm: Date,
  motivoRevogacao: String,
  observacoes: String,
}, { timestamps: true });

PortalTokenSchema.index({ pedidoId: 1 });
PortalTokenSchema.index({ clienteId: 1 });
PortalTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
PortalTokenSchema.index({ status: 1, expiresAt: 1 });

// Gera token seguro e retorna plain text (para envio por e-mail) + hash (para armazenar)
export function gerarTokenSeguro(): { plain: string; hash: string } {
  const plain = crypto.randomBytes(32).toString('hex'); // 64 chars hex
  const hash = crypto.createHash('sha256').update(plain).digest('hex');
  return { plain, hash };
}

export function hashToken(plain: string): string {
  return crypto.createHash('sha256').update(plain).digest('hex');
}

export const PortalTokenModel: Model<IPortalToken> = mongoose.model<IPortalToken>('PortalToken', PortalTokenSchema);
