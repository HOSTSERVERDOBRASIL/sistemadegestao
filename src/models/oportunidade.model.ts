import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type EtapaFunil =
  | 'Contato'
  | 'Qualificado'
  | 'Proposta'
  | 'Negociação'
  | 'Fechado Ganho'
  | 'Fechado Perdido';

export interface IOportunidade extends Document {
  titulo: string;
  clienteId?: Types.ObjectId;
  nomeContato?: string;
  emailContato?: string;
  telefoneContato?: string;
  etapa: EtapaFunil;
  valor?: number;
  probabilidade: number;
  dataPrevisaoFechamento?: Date;
  produtoIds: Types.ObjectId[];
  origem?: string;
  responsavelId?: Types.ObjectId;
  responsavelNome?: string;
  observacoes?: string;
  motivoPerda?: string;
  tags: string[];
}

const oportunidadeSchema = new Schema<IOportunidade>(
  {
    titulo: { type: String, required: true, trim: true },
    clienteId: { type: Schema.Types.ObjectId, ref: 'Cliente' },
    nomeContato: { type: String, trim: true },
    emailContato: { type: String, trim: true, lowercase: true },
    telefoneContato: { type: String, trim: true },
    etapa: {
      type: String,
      enum: ['Contato', 'Qualificado', 'Proposta', 'Negociação', 'Fechado Ganho', 'Fechado Perdido'],
      required: true,
      default: 'Contato',
    },
    valor: { type: Number, min: 0 },
    probabilidade: { type: Number, required: true, min: 0, max: 100, default: 0 },
    dataPrevisaoFechamento: Date,
    produtoIds: [{ type: Schema.Types.ObjectId, ref: 'Produto' }],
    origem: { type: String, trim: true },
    responsavelId: { type: Schema.Types.ObjectId, ref: 'User' },
    responsavelNome: { type: String, trim: true },
    observacoes: { type: String, maxlength: 2000 },
    motivoPerda: { type: String, trim: true },
    tags: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

oportunidadeSchema.index({ etapa: 1 });
oportunidadeSchema.index({ clienteId: 1 });
oportunidadeSchema.index({ responsavelId: 1 });

export const OportunidadeModel: Model<IOportunidade> =
  mongoose.model<IOportunidade>('Oportunidade', oportunidadeSchema);
