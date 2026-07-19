import { Types } from 'mongoose';
import { ProdutoModel } from '../models/produto.model.js';
import type { IPedidoItem } from '../models/pedido.model.js';
import { ContratoFluxoError } from './contrato.service.js';

type ItemEntrada = {
  produtoId?: string;
  quantidade?: number;
  precoUnitario?: number;
  valorTabelaUnitario?: number;
};

function moeda(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

export async function montarItensPedido(entrada: ItemEntrada[]): Promise<{
  itens: IPedidoItem[];
  produtoId: Types.ObjectId;
  valorTotal: number;
  valorTabela: number;
}> {
  if (!Array.isArray(entrada) || entrada.length === 0) {
    throw new ContratoFluxoError('Adicione ao menos um item ao pedido', 400);
  }

  const ids = entrada.map(item => item.produtoId).filter(Boolean) as string[];
  if (ids.length !== entrada.length || ids.some(id => !Types.ObjectId.isValid(id))) {
    throw new ContratoFluxoError('Produto inválido em um dos itens', 400);
  }

  const produtos = await ProdutoModel.find({ _id: { $in: ids } });
  const porId = new Map(produtos.map(produto => [String(produto._id), produto]));
  const itens: IPedidoItem[] = entrada.map(item => {
    const produto = porId.get(item.produtoId!);
    if (!produto) throw new ContratoFluxoError('Produto não encontrado', 404);
    if (!produto.ativo) throw new ContratoFluxoError(`Produto inativo: ${produto.nome}`);

    const quantidade = Number(item.quantidade ?? 1);
    const precoUnitario = Number(item.precoUnitario ?? produto.preco);
    const valorTabelaUnitario = Number(item.valorTabelaUnitario ?? produto.precoTabela ?? produto.preco);
    if (!Number.isInteger(quantidade) || quantidade < 1) {
      throw new ContratoFluxoError(`Quantidade inválida para ${produto.nome}`, 400);
    }
    if (!Number.isFinite(precoUnitario) || precoUnitario < 0 ||
        !Number.isFinite(valorTabelaUnitario) || valorTabelaUnitario < 0) {
      throw new ContratoFluxoError(`Preço inválido para ${produto.nome}`, 400);
    }

    return {
      produtoId: produto._id as Types.ObjectId,
      codigo: produto.codigo,
      nome: produto.nome,
      quantidade,
      precoUnitario: moeda(precoUnitario),
      valorTabelaUnitario: moeda(valorTabelaUnitario),
      subtotal: moeda(quantidade * precoUnitario),
    };
  });

  return {
    itens,
    produtoId: itens[0].produtoId,
    valorTotal: moeda(itens.reduce((total, item) => total + item.subtotal, 0)),
    valorTabela: moeda(itens.reduce((total, item) => total + item.quantidade * item.valorTabelaUnitario, 0)),
  };
}
