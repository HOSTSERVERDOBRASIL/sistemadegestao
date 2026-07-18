import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IProduto extends Document {
  codigo: string;
  nome: string;
  descricao?: string;
  categoria?: string;
  fornecedor?: string;
  preco: number;
  precoTabela?: number;
  estoque: number;
  ativo: boolean;
}

const produtoSchema = new Schema<IProduto>({
  codigo: { type: String, required: true, unique: true },
  nome: { type: String, required: true },
  descricao: String,
  categoria: String,
  fornecedor: String,
  preco: { type: Number, required: true, min: 0 },
  precoTabela: { type: Number, min: 0 },
  estoque: { type: Number, required: true, min: 0 },
  ativo: { type: Boolean, default: true }
}, { timestamps: true });

produtoSchema.index({ nome: 1 });
produtoSchema.index({ categoria: 1 });
produtoSchema.index({ ativo: 1 });

export const ProdutoModel: Model<IProduto> = mongoose.model<IProduto>('Produto', produtoSchema);
