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

export interface IDominioItem {
  dominio: string;
  adicionadoEm: Date;
}

export interface IPedidoItem {
  _id?: Types.ObjectId;
  produtoId: Types.ObjectId;
  codigo: string;
  nome: string;
  quantidade: number;
  precoUnitario: number;
  valorTabelaUnitario: number;
  subtotal: number;
  quantidadeExecutada?: number;
  quantidadeFaturada?: number;
  // Campos para certificados SSL/ICP
  dominioPrincipal?: string;
  dominiosAdicionais?: IDominioItem[];
}

export interface IPedido extends Document {
  numero: string;
  clienteId: Types.ObjectId;
  produtoId: Types.ObjectId;
  contratoId?: Types.ObjectId;
  ordemFornecimentoId?: Types.ObjectId;
  parceiroId?: Types.ObjectId;
  cobrancaRevenda?: {
    formaPagamento: 'Pre-pago' | 'Pos-pago' | 'Por pedido';
    modeloCertificado: 'Por emissao' | 'Por pedido' | 'Fatura mensal' | 'Misto';
    valorCobrado: number;
    situacao: 'Pago com creditos' | 'A faturar' | 'Aguardando pagamento' | 'Estornado';
  };
  valorTotal: number;
  valorTabela: number;
  valorRevenda?: number;
  cupomId?: Types.ObjectId;
  cupomCodigo?: string;
  descontoValor?: number;
  descontoPercentual?: number;
  notaEmpenhoId?: Types.ObjectId;
  numeroEmpenhoNoContrato?: string;
  ordemFornecimento?: { numero: string; dataEmissao?: Date; arquivoUrl?: string };
  solicitacaoFornecimento?: { numero: string; dataEmissao?: Date; arquivoUrl?: string };
  origemCompra?: 'site' | 'manual' | 'atendimento';
  protocolo?: string;
  protocoloConfirmadoEm?: Date;
  saldoStatus: 'Reservado' | 'Confirmado' | 'Estornado';
  vinculo: {
    tipo: VinculoTipo;
    emissorNF?: 'XDigital' | 'Revendedor';
    empenho?: string;
    comprovantePagamentoAprovado?: boolean;
    contratoModalidade?: string;
  };
  status: 'Rascunho' | 'Aprovado' | 'Em processo' | 'Faturado' | 'Concluido' | 'Cancelado';
  etapaOperacional: EtapaOperacional;
  historicoEtapas: IHistoricoEtapa[];
  nfEmitida?: boolean;
  itens: IPedidoItem[];
  evidencias: IEvidencia[];
  clm?: {
    requestId?: string;
    status?: string;
    enviadoEm?: Date;
    atualizadoEm?: Date;
    quantidadeExecutada: number;
    quantidadeFaturavel: number;
    ultimoEvento?: string;
  };
  prazoAnos?: 1 | 2 | 3 | 4 | 5;
  observacoes?: string;
}

export interface IEvidencia {
  _id?: Types.ObjectId;
  tipo: 'email' | 'imagem' | 'documento' | 'outro';
  origem?: string;
  dataRegistro: Date;
  observacao?: string;
  arquivoUrl?: string;
  arquivoNome?: string;
  arquivoMime?: string;
}

const pedidoItemSchema = new Schema<IPedidoItem>({
  produtoId: { type: Schema.Types.ObjectId, ref: 'Produto', required: true },
  codigo: { type: String, required: true },
  nome: { type: String, required: true },
  quantidade: { type: Number, required: true, min: 1 },
  precoUnitario: { type: Number, required: true, min: 0 },
  valorTabelaUnitario: { type: Number, required: true, min: 0 },
  subtotal: { type: Number, required: true, min: 0 },
  quantidadeExecutada: { type: Number, default: 0, min: 0 },
  quantidadeFaturada: { type: Number, default: 0, min: 0 },
  dominioPrincipal: { type: String, trim: true, lowercase: true },
  dominiosAdicionais: [{
    dominio: { type: String, required: true, trim: true, lowercase: true },
    adicionadoEm: { type: Date, default: Date.now },
  }],
}, { _id: true });

const pedidoSchema = new Schema<IPedido>({
  numero: { type: String, required: true, unique: true },
  clienteId: { type: Schema.Types.ObjectId, ref: 'Cliente', required: true },
  produtoId: { type: Schema.Types.ObjectId, ref: 'Produto', required: true },
  contratoId: { type: Schema.Types.ObjectId, ref: 'Contrato' },
  ordemFornecimentoId: { type: Schema.Types.ObjectId, ref: 'OrdemFornecimento' },
  parceiroId: { type: Schema.Types.ObjectId, ref: 'Parceiro' },
  cobrancaRevenda: {
    formaPagamento: { type: String, enum: ['Pre-pago', 'Pos-pago', 'Por pedido'] },
    modeloCertificado: { type: String, enum: ['Por emissao', 'Por pedido', 'Fatura mensal', 'Misto'] },
    valorCobrado: { type: Number, min: 0 },
    situacao: { type: String, enum: ['Pago com creditos', 'A faturar', 'Aguardando pagamento', 'Estornado'] },
  },
  notaEmpenhoId: { type: Schema.Types.ObjectId, ref: 'NotaEmpenho' },
  numeroEmpenhoNoContrato: String,
  ordemFornecimento: {
    numero: String,
    dataEmissao: Date,
    arquivoUrl: String,
  },
  solicitacaoFornecimento: {
    numero: String,
    dataEmissao: Date,
    arquivoUrl: String,
  },
  origemCompra: { type: String, enum: ['site', 'manual', 'atendimento'] },
  protocolo: String,
  protocoloConfirmadoEm: Date,
  saldoStatus: { type: String, enum: ['Reservado', 'Confirmado', 'Estornado'], default: 'Reservado' },
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
    comprovantePagamentoAprovado: Boolean,
    contratoModalidade: String
  },
  status: {
    type: String,
    enum: ['Rascunho', 'Aprovado', 'Em processo', 'Faturado', 'Concluido', 'Cancelado'],
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
  nfEmitida: { type: Boolean, default: false },
  itens: { type: [pedidoItemSchema], default: [] },
  evidencias: {
    type: [{
      tipo: { type: String, enum: ['email', 'imagem', 'documento', 'outro'], required: true },
      origem: String,
      dataRegistro: { type: Date, default: Date.now },
      observacao: String,
      arquivoUrl: String,
      arquivoNome: String,
      arquivoMime: String,
    }],
    default: [],
  },
  clm: {
    requestId: String,
    status: String,
    enviadoEm: Date,
    atualizadoEm: Date,
    quantidadeExecutada: { type: Number, default: 0, min: 0 },
    quantidadeFaturavel: { type: Number, default: 0, min: 0 },
    ultimoEvento: String,
  },
  prazoAnos: { type: Number, enum: [1, 2, 3, 4, 5] },
  observacoes: { type: String, maxlength: 1000 },
}, { timestamps: true });

pedidoSchema.index({ clienteId: 1 });
pedidoSchema.index({ notaEmpenhoId: 1 });
pedidoSchema.index({ saldoStatus: 1, createdAt: 1 });
pedidoSchema.index({ contratoId: 1 });
pedidoSchema.index({ ordemFornecimentoId: 1 });
pedidoSchema.index({ etapaOperacional: 1 });
pedidoSchema.index({ status: 1 });
pedidoSchema.index({ nfEmitida: 1 });
pedidoSchema.index({ cupomId: 1 });
pedidoSchema.index({ createdAt: -1 });

export const PedidoModel: Model<IPedido> = mongoose.model<IPedido>('Pedido', pedidoSchema);
