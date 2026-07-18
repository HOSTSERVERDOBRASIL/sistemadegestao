import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { VinculoTipo } from './contrato.model.js';

export type EtapaOperacional =
  | 'Pedido'
  | 'Pagamento'
  | 'Validacao'
  | 'Preparacao'
  | 'Processamento'
  | 'Entrega'
  | 'Conclusao';

export const ETAPAS_OPERACIONAIS: EtapaOperacional[] = [
  'Pedido', 'Pagamento', 'Validacao', 'Preparacao', 'Processamento', 'Entrega', 'Conclusao'
];

export interface IHistoricoEtapa {
  etapa: EtapaOperacional;
  data: Date;
  usuarioId?: Types.ObjectId;
  observacao?: string;
}

export interface IPedido extends Document {
  numero: string;
  clienteId: Types.ObjectId;
  produtoId: Types.ObjectId;
  contratoId?: Types.ObjectId;
  parceiroId?: Types.ObjectId;
  valorTotal: number;
  valorTabela: number;
  valorRevenda?: number;
  cupomId?: Types.ObjectId;
  cupomCodigo?: string;
  descontoValor?: number;
  descontoPercentual?: number;
  vinculo: {
    tipo: VinculoTipo;
    emissorNF?: 'XDigital' | 'Revendedor';
    empenho?: string;
    sf?: string;
    comprovantePagamentoAprovado?: boolean;
    contratoModalidade?: string;
  };
  status: 'Rascunho' | 'Aprovado' | 'Em processo' | 'Faturado' | 'Concluido';
  etapaOperacional: EtapaOperacional;
  historicoEtapas: IHistoricoEtapa[];
  nfEmitida?: boolean;
}

const pedidoSchema = new Schema<IPedido>({
  numero: { type: String, required: true, unique: true },
  clienteId: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true },
  produtoId: { type: Schema.Types.ObjectId, ref: 'Produto', required: true },
  contratoId: { type: Schema.Types.ObjectId, ref: 'Contrato' },
  parceiroId: { type: Schema.Types.ObjectId, ref: 'Parceiro' },
  valorTotal: { type: Number, required: true, min: 0 },
  valorTabela: { type: Number, required: true, min: 0 },
  valorRevenda: Number,
  cupomId: { type: Schema.Types.ObjectId, ref: 'Cupom' },
  cupomCodigo: String,
  descontoValor: { type: Number, min: 0 },
  descontoPercentual: { type: Number, min: 0, max: 100 },
  vinculo: {
    tipo: { type: String, enum: ['Contrato', 'EmpenhoSF', 'CompraDireta', 'Revenda'], required: true },
    emissorNF: { type: String, enum: ['XDigital', 'Revendedor'] },
    empenho: String,
    sf: String,
    comprovantePagamentoAprovado: Boolean,
    contratoModalidade: String
  },
  status: {
    type: String,
    enum: ['Rascunho', 'Aprovado', 'Em processo', 'Faturado', 'Concluido'],
    default: 'Aprovado'
  },
  etapaOperacional: {
    type: String,
    enum: ['Pedido', 'Pagamento', 'Validacao', 'Preparacao', 'Processamento', 'Entrega', 'Conclusao'],
    default: 'Pedido'
  },
  historicoEtapas: [{
    etapa: { type: String, enum: ['Pedido', 'Pagamento', 'Validacao', 'Preparacao', 'Processamento', 'Entrega', 'Conclusao'] },
    data: { type: Date, default: Date.now },
    usuarioId: { type: Schema.Types.ObjectId, ref: 'User' },
    observacao: String
  }],
  nfEmitida: { type: Boolean, default: false }
}, { timestamps: true });

pedidoSchema.index({ clienteId: 1 });
pedidoSchema.index({ contratoId: 1 });
pedidoSchema.index({ etapaOperacional: 1 });
pedidoSchema.index({ status: 1 });
pedidoSchema.index({ nfEmitida: 1 });
pedidoSchema.index({ cupomId: 1 });
pedidoSchema.index({ createdAt: -1 });

export const PedidoModel: Model<IPedido> = mongoose.model<IPedido>('Pedido', pedidoSchema);
