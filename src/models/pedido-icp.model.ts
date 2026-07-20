import mongoose, { Schema, Document, Model } from 'mongoose';

export type TipoCertICP =
  | 'e-CPF A1' | 'e-CPF A3'
  | 'e-CNPJ A1' | 'e-CNPJ A3'
  | 'NF-e A1' | 'NF-e A3'
  | 'Equipamento A3'
  | 'Aplicação/InfoConv A3'
  | 'Bancário A3'
  | 'Outro';

export type MidiaICP = 'A1' | 'A3-Token' | 'A3-Cartão' | 'A3-Nuvem' | 'A3-Outro';

export type StatusPedidoICP =
  | 'Rascunho'
  | 'Em Análise'
  | 'Aguardando Documentos'
  | 'Documentação OK'
  | 'Agendado'
  | 'Em Emissão'
  | 'Despachado'
  | 'Entregue'
  | 'Concluído'
  | 'Cancelado';

export interface IEventoPedidoICP {
  data: Date;
  status: StatusPedidoICP;
  observacao?: string;
  usuarioId?: mongoose.Types.ObjectId;
  usuarioNome?: string;
}

export interface IHardwareICP {
  estoqueItemId: mongoose.Types.ObjectId;
  estoqueItemCodigo?: string;
  estoqueItemNome?: string;
  estoqueMovimentoReservaId?: mongoose.Types.ObjectId;
  estoqueMovimentoSaidaId?: mongoose.Types.ObjectId;
  numeroSerie?: string;
  fabricante?: string;
  modelo?: string;
}

export interface IPedidoICP extends Document {
  numero: string;                       // ICP-YYYY-NNNN
  clienteId: mongoose.Types.ObjectId;
  clienteNome?: string;

  tipoCert: TipoCertICP;
  midia: MidiaICP;
  prazoAnos: number;
  quantidade: number;

  // Titular
  titularNome?: string;
  titularCpfCnpj?: string;
  titularEmail?: string;
  titularTelefone?: string;

  // Hardware (preenchido quando midia é A3-Token ou A3-Cartão)
  hardware?: IHardwareICP;

  // Financeiro
  valorUnitario?: number;
  valorTotal?: number;

  // Operacional
  status: StatusPedidoICP;
  responsavelId?: mongoose.Types.ObjectId;
  responsavelNome?: string;
  observacoes?: string;
  historico: IEventoPedidoICP[];
}

const EventoSchema = new Schema<IEventoPedidoICP>({
  data: { type: Date, default: Date.now },
  status: String,
  observacao: String,
  usuarioId: Schema.Types.ObjectId,
  usuarioNome: String,
}, { _id: false });

const HardwareSchema = new Schema<IHardwareICP>({
  estoqueItemId: { type: Schema.Types.ObjectId, ref: 'EstoqueItem', required: true },
  estoqueItemCodigo: String,
  estoqueItemNome: String,
  estoqueMovimentoReservaId: Schema.Types.ObjectId,
  estoqueMovimentoSaidaId: Schema.Types.ObjectId,
  numeroSerie: String,
  fabricante: String,
  modelo: String,
}, { _id: false });

const PedidoICPSchema = new Schema<IPedidoICP>({
  numero: { type: String, required: true, unique: true },
  clienteId: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true },
  clienteNome: String,
  tipoCert: { type: String, required: true },
  midia: { type: String, enum: ['A1', 'A3-Token', 'A3-Cartão', 'A3-Nuvem', 'A3-Outro'], required: true },
  prazoAnos: { type: Number, default: 1, min: 1, max: 3 },
  quantidade: { type: Number, default: 1, min: 1 },
  titularNome: String,
  titularCpfCnpj: String,
  titularEmail: String,
  titularTelefone: String,
  hardware: HardwareSchema,
  valorUnitario: { type: Number, min: 0 },
  valorTotal: { type: Number, min: 0 },
  status: {
    type: String,
    enum: ['Rascunho','Em Análise','Aguardando Documentos','Documentação OK','Agendado','Em Emissão','Despachado','Entregue','Concluído','Cancelado'],
    default: 'Rascunho',
  },
  responsavelId: Schema.Types.ObjectId,
  responsavelNome: String,
  observacoes: String,
  historico: [EventoSchema],
}, { timestamps: true });

PedidoICPSchema.index({ clienteId: 1, createdAt: -1 });
PedidoICPSchema.index({ status: 1 });
PedidoICPSchema.index({ 'hardware.estoqueItemId': 1 });

export const PedidoICPModel: Model<IPedidoICP> = mongoose.model<IPedidoICP>('PedidoICP', PedidoICPSchema);
