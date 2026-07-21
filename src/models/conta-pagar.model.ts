import mongoose, { Schema, Document, Model } from 'mongoose';

export type StatusContaPagar =
  | 'Pendente'
  | 'Aprovada'
  | 'Paga'
  | 'Vencida'
  | 'Cancelada'
  | 'Parcialmente Paga';

export type TipoContaPagar =
  | 'Fornecedor'
  | 'Funcionário'
  | 'Imposto'
  | 'Infraestrutura'
  | 'Marketing'
  | 'Comissão'
  | 'Outros';

export type RecorrenciaContaPagar =
  | 'Única'
  | 'Mensal'
  | 'Trimestral'
  | 'Semestral'
  | 'Anual';

export interface IContaPagar extends Document {
  descricao: string;
  tipo: TipoContaPagar;
  fornecedor?: string;
  valor: number;
  valorPago: number;
  dataVencimento: Date;
  dataPagamento?: Date;
  status: StatusContaPagar;
  recorrencia: RecorrenciaContaPagar;
  centroCusto?: string;
  observacoes?: string;
  comprovante?: string;
  aprovadoPor?: string;
  criadorNome?: string;
  createdAt: Date;
  updatedAt: Date;
}

const contaPagarSchema = new Schema<IContaPagar>(
  {
    descricao: { type: String, required: true, trim: true },
    tipo: {
      type: String,
      enum: [
        'Fornecedor',
        'Funcionário',
        'Imposto',
        'Infraestrutura',
        'Marketing',
        'Comissão',
        'Outros',
      ],
      required: true,
    },
    fornecedor: { type: String, trim: true },
    valor: { type: Number, required: true, min: 0.01 },
    valorPago: { type: Number, default: 0, min: 0 },
    dataVencimento: { type: Date, required: true },
    dataPagamento: { type: Date },
    status: {
      type: String,
      enum: ['Pendente', 'Aprovada', 'Paga', 'Vencida', 'Cancelada', 'Parcialmente Paga'],
      default: 'Pendente',
    },
    recorrencia: {
      type: String,
      enum: ['Única', 'Mensal', 'Trimestral', 'Semestral', 'Anual'],
      default: 'Única',
    },
    centroCusto: { type: String, trim: true },
    observacoes: { type: String, trim: true },
    comprovante: { type: String },
    aprovadoPor: { type: String },
    criadorNome: { type: String },
  },
  { timestamps: true }
);

contaPagarSchema.index({ status: 1 });
contaPagarSchema.index({ dataVencimento: 1 });
contaPagarSchema.index({ tipo: 1 });
contaPagarSchema.index({ centroCusto: 1 });

export const ContaPagarModel: Model<IContaPagar> = mongoose.model<IContaPagar>(
  'ContaPagar',
  contaPagarSchema
);
