import mongoose, { Schema, Document, Model } from 'mongoose';

export type TipoEstoque = 'Token USB' | 'Cartão Inteligente' | 'Leitor de Cartão' | 'Mídia A3 Nuvem' | 'Envelope Seguro' | 'Outro';
export type FabricanteToken = 'G&D' | 'Thales' | 'Valid' | 'Certisign' | 'SafeNet' | 'Pronova' | 'Outros';
export type StatusEstoqueItem = 'Ativo' | 'Descontinuado' | 'Suspenso';

export interface IEstoqueItem extends Document {
  codigo: string;                     // ex: TOK-GD-USB-001
  nome: string;                       // ex: Token USB G&D StarSign CUT
  tipo: TipoEstoque;
  fabricante?: FabricanteToken;
  modelo?: string;                    // ex: StarSign CUT
  fornecedor?: string;                // empresa fornecedora
  descricao?: string;

  // Estoque
  quantidadeAtual: number;            // calculado via movimentos
  quantidadeReservada: number;        // reservado para pedidos pendentes
  quantidadeMinima: number;           // alerta abaixo deste valor
  quantidadeMaxima?: number;          // limite sugerido de reposição

  // Financeiro
  custoUnitario: number;
  moeda: 'BRL' | 'USD' | 'EUR';
  precoVenda?: number;

  // Controle
  localizacao?: string;               // ex: Almoxarifado A / Gaveta 3
  rastreiaNumeroSerie: boolean;       // se true, movimentos exigem nº série
  status: StatusEstoqueItem;
  observacoes?: string;
}

const EstoqueItemSchema = new Schema<IEstoqueItem>({
  codigo: { type: String, required: true, unique: true, trim: true, uppercase: true },
  nome: { type: String, required: true, trim: true },
  tipo: { type: String, enum: ['Token USB', 'Cartão Inteligente', 'Leitor de Cartão', 'Mídia A3 Nuvem', 'Envelope Seguro', 'Outro'], required: true },
  fabricante: { type: String, enum: ['G&D', 'Thales', 'Valid', 'Certisign', 'SafeNet', 'Pronova', 'Outros'] },
  modelo: String,
  fornecedor: String,
  descricao: String,
  quantidadeAtual: { type: Number, default: 0, min: 0 },
  quantidadeReservada: { type: Number, default: 0, min: 0 },
  quantidadeMinima: { type: Number, default: 0, min: 0 },
  quantidadeMaxima: { type: Number, min: 0 },
  custoUnitario: { type: Number, required: true, min: 0, default: 0 },
  moeda: { type: String, enum: ['BRL', 'USD', 'EUR'], default: 'BRL' },
  precoVenda: { type: Number, min: 0 },
  localizacao: String,
  rastreiaNumeroSerie: { type: Boolean, default: false },
  status: { type: String, enum: ['Ativo', 'Descontinuado', 'Suspenso'], default: 'Ativo' },
  observacoes: String,
}, { timestamps: true });

EstoqueItemSchema.index({ tipo: 1 });
EstoqueItemSchema.index({ status: 1 });
EstoqueItemSchema.index({ quantidadeAtual: 1 });

export const EstoqueItemModel: Model<IEstoqueItem> = mongoose.model<IEstoqueItem>('EstoqueItem', EstoqueItemSchema);
