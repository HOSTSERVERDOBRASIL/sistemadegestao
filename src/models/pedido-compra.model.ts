import mongoose, { Schema, Document, Model } from 'mongoose';

export type StatusPedidoCompra =
  | 'Rascunho'
  | 'Aguardando Aprovação'
  | 'Aprovado'
  | 'Pedido Enviado'
  | 'Parcialmente Recebido'
  | 'Recebido'
  | 'Cancelado';

export interface IItemPedidoCompra {
  estoqueItemId: mongoose.Types.ObjectId;
  estoqueItemCodigo: string;
  estoqueItemNome: string;
  quantidade: number;
  quantidadeRecebida: number;
  custoUnitario: number;
  custoTotal: number;
}

export interface IEventoPedidoCompra {
  data: Date;
  status: StatusPedidoCompra;
  observacao?: string;
  usuarioId?: mongoose.Types.ObjectId;
  usuarioNome?: string;
}

export interface IPedidoCompra extends Document {
  numero: string;                           // COMPRA-YYYY-NNNN
  fornecedor: string;
  fornecedorCnpj?: string;
  itens: IItemPedidoCompra[];
  valorTotal: number;
  status: StatusPedidoCompra;
  dataPrevisaoEntrega?: Date;
  notaFiscalFornecedor?: string;
  observacoes?: string;
  responsavelId?: mongoose.Types.ObjectId;
  responsavelNome?: string;
  aprovadoPorId?: mongoose.Types.ObjectId;
  aprovadoPorNome?: string;
  historico: IEventoPedidoCompra[];
}

const ItemSchema = new Schema<IItemPedidoCompra>({
  estoqueItemId: { type: Schema.Types.ObjectId, ref: 'EstoqueItem', required: true },
  estoqueItemCodigo: { type: String, required: true },
  estoqueItemNome: { type: String, required: true },
  quantidade: { type: Number, required: true, min: 1 },
  quantidadeRecebida: { type: Number, default: 0, min: 0 },
  custoUnitario: { type: Number, required: true, min: 0 },
  custoTotal: { type: Number, required: true, min: 0 },
}, { _id: false });

const EventoSchema = new Schema<IEventoPedidoCompra>({
  data: { type: Date, default: Date.now },
  status: String,
  observacao: String,
  usuarioId: Schema.Types.ObjectId,
  usuarioNome: String,
}, { _id: false });

const PedidoCompraSchema = new Schema<IPedidoCompra>({
  numero: { type: String, required: true, unique: true },
  fornecedor: { type: String, required: true },
  fornecedorCnpj: String,
  itens: { type: [ItemSchema], required: true, validate: (v: IItemPedidoCompra[]) => v.length > 0 },
  valorTotal: { type: Number, required: true, min: 0 },
  status: {
    type: String,
    enum: ['Rascunho','Aguardando Aprovação','Aprovado','Pedido Enviado','Parcialmente Recebido','Recebido','Cancelado'],
    default: 'Rascunho',
  },
  dataPrevisaoEntrega: Date,
  notaFiscalFornecedor: String,
  observacoes: String,
  responsavelId: Schema.Types.ObjectId,
  responsavelNome: String,
  aprovadoPorId: Schema.Types.ObjectId,
  aprovadoPorNome: String,
  historico: [EventoSchema],
}, { timestamps: true });

PedidoCompraSchema.index({ status: 1 });
PedidoCompraSchema.index({ createdAt: -1 });
PedidoCompraSchema.index({ 'itens.estoqueItemId': 1 });

export const PedidoCompraModel: Model<IPedidoCompra> = mongoose.model<IPedidoCompra>('PedidoCompra', PedidoCompraSchema);
