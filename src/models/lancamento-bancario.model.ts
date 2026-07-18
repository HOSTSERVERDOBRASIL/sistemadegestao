import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type BancoOrigem = 'BB' | 'Bradesco' | 'Manual' | 'Efi';
export type TipoLancamento = 'credito' | 'debito';
export type StatusConciliacao = 'pendente' | 'conciliado' | 'ignorado';
export type OrigemLancamento = 'manual' | 'ofx' | 'api_bb' | 'api_bradesco';

export interface ILancamentoBancario extends Document {
  banco: BancoOrigem;
  origem: OrigemLancamento;
  tipo: TipoLancamento;
  valor: number;
  data: Date;
  descricao: string;
  documento?: string;       // CPF/CNPJ do pagador ou código do doc
  txid?: string;            // txid PIX quando disponível
  nossoNumero?: string;     // referência boleto
  comprovanteUrl?: string;  // arquivo enviado manualmente
  status: StatusConciliacao;
  pedidoId?: Types.ObjectId;
  cobrancaId?: Types.ObjectId;
  loteId?: Types.ObjectId;  // referência ao lote de importação
  observacoes?: string;
  conciliadoEm?: Date;
  conciliadoPor?: string;
  createdAt: Date;
  updatedAt: Date;
}

const lancamentoSchema = new Schema<ILancamentoBancario>(
  {
    banco:           { type: String, enum: ['BB', 'Bradesco', 'Manual', 'Efi'], required: true },
    origem:          { type: String, enum: ['manual', 'ofx', 'api_bb', 'api_bradesco'], required: true },
    tipo:            { type: String, enum: ['credito', 'debito'], required: true },
    valor:           { type: Number, required: true, min: 0 },
    data:            { type: Date, required: true },
    descricao:       { type: String, required: true, trim: true },
    documento:       { type: String, trim: true },
    txid:            { type: String, sparse: true, index: true },
    nossoNumero:     String,
    comprovanteUrl:  String,
    status:          { type: String, enum: ['pendente', 'conciliado', 'ignorado'], default: 'pendente' },
    pedidoId:        { type: Schema.Types.ObjectId, ref: 'Pedido' },
    cobrancaId:      { type: Schema.Types.ObjectId, ref: 'Cobranca' },
    loteId:          { type: Schema.Types.ObjectId, ref: 'ConciliacaoLote' },
    observacoes:     String,
    conciliadoEm:    Date,
    conciliadoPor:   String,
  },
  { timestamps: true }
);

lancamentoSchema.index({ banco: 1, status: 1 });
lancamentoSchema.index({ data: -1 });
lancamentoSchema.index({ pedidoId: 1 }, { sparse: true });
lancamentoSchema.index({ cobrancaId: 1 }, { sparse: true });
lancamentoSchema.index({ loteId: 1 }, { sparse: true });
// Evita duplicatas em importações OFX/API
lancamentoSchema.index({ banco: 1, data: 1, valor: 1, descricao: 1 }, { unique: false });

export const LancamentoBancarioModel: Model<ILancamentoBancario> =
  mongoose.model<ILancamentoBancario>('LancamentoBancario', lancamentoSchema);
