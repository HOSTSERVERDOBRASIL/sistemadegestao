import mongoose, { Schema, Document, Model } from 'mongoose';

export type TipoMovimento =
  | 'entrada_compra'       // recebimento de fornecedor
  | 'entrada_devolucao'    // devolução de cliente/pedido
  | 'entrada_ajuste'       // ajuste de inventário positivo
  | 'saida_pedido'         // saída vinculada a pedido ICP
  | 'saida_avaria'         // descarte por avaria
  | 'saida_ajuste'         // ajuste de inventário negativo
  | 'reserva'              // reserva para pedido (não sai do estoque ainda)
  | 'cancelamento_reserva' // cancelamento de reserva
  | 'entrega_reserva';     // concretiza reserva em saída real

export interface IMovimentoEstoque extends Document {
  itemId: mongoose.Types.ObjectId;
  tipo: TipoMovimento;
  quantidade: number;

  // Rastreabilidade
  numerosSerie?: string[];            // lista de nº de série dos itens movimentados
  lote?: string;                      // número do lote de compra

  // Vínculos
  pedidoId?: mongoose.Types.ObjectId;
  pedidoNumero?: string;
  clienteId?: mongoose.Types.ObjectId;
  clienteNome?: string;

  // Financeiro (para entradas)
  custoUnitario?: number;
  custoTotal?: number;
  notaFiscalFornecedor?: string;

  // Estoque resultante (snapshot no momento do movimento)
  saldoAnterior: number;
  saldoPosterior: number;

  // Controle
  responsavelId?: mongoose.Types.ObjectId;
  responsavelNome?: string;
  observacoes?: string;
  dataMovimento: Date;
}

const MovimentoEstoqueSchema = new Schema<IMovimentoEstoque>({
  itemId: { type: Schema.Types.ObjectId, ref: 'EstoqueItem', required: true },
  tipo: {
    type: String,
    enum: ['entrada_compra', 'entrada_devolucao', 'entrada_ajuste', 'saida_pedido', 'saida_avaria', 'saida_ajuste', 'reserva', 'cancelamento_reserva', 'entrega_reserva'],
    required: true,
  },
  quantidade: { type: Number, required: true, min: 1 },
  numerosSerie: [{ type: String, trim: true }],
  lote: String,
  pedidoId: { type: Schema.Types.ObjectId, ref: 'Pedido' },
  pedidoNumero: String,
  clienteId: { type: Schema.Types.ObjectId, ref: 'Cliente' },
  clienteNome: String,
  custoUnitario: { type: Number, min: 0 },
  custoTotal: { type: Number, min: 0 },
  notaFiscalFornecedor: String,
  saldoAnterior: { type: Number, required: true },
  saldoPosterior: { type: Number, required: true },
  responsavelId: { type: Schema.Types.ObjectId, ref: 'User' },
  responsavelNome: String,
  observacoes: String,
  dataMovimento: { type: Date, default: Date.now },
}, { timestamps: true });

MovimentoEstoqueSchema.index({ itemId: 1, dataMovimento: -1 });
MovimentoEstoqueSchema.index({ pedidoId: 1 });
MovimentoEstoqueSchema.index({ tipo: 1 });
MovimentoEstoqueSchema.index({ dataMovimento: -1 });

export const MovimentoEstoqueModel: Model<IMovimentoEstoque> = mongoose.model<IMovimentoEstoque>('MovimentoEstoque', MovimentoEstoqueSchema);
