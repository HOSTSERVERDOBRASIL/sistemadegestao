import { CupomModel, type ICupom } from '../models/cupom.model.js';
import type { Types } from 'mongoose';

export class CupomInvalidoError extends Error {
  constructor(msg: string) { super(msg); this.name = 'CupomInvalidoError'; }
}

export interface AplicacaoCupom {
  cupom: ICupom;
  descontoValor: number;
  descontoPercentual: number;
  valorFinal: number;
}

/**
 * Valida e calcula o desconto de um cupom para um determinado pedido.
 * Não incrementa o contador — isso é feito ao confirmar o pedido.
 */
export async function validarCupom(
  codigo: string,
  valorPedido: number,
  opts: { produtoId?: Types.ObjectId; clienteId?: Types.ObjectId } = {}
): Promise<AplicacaoCupom> {
  const cupom = await CupomModel.findOne({ codigo: codigo.toUpperCase().trim() });

  if (!cupom) throw new CupomInvalidoError('Cupom não encontrado');
  if (!cupom.ativo) throw new CupomInvalidoError('Cupom inativo');

  const agora = new Date();
  if (cupom.validoDe && agora < cupom.validoDe) {
    throw new CupomInvalidoError(`Cupom válido somente a partir de ${cupom.validoDe.toLocaleDateString('pt-BR')}`);
  }
  if (cupom.validoAte && agora > cupom.validoAte) {
    throw new CupomInvalidoError('Cupom expirado');
  }
  if (cupom.usosMaximos !== undefined && cupom.usosRealizados >= cupom.usosMaximos) {
    throw new CupomInvalidoError('Limite de usos do cupom atingido');
  }
  if (cupom.valorMinimoPedido !== undefined && valorPedido < cupom.valorMinimoPedido) {
    throw new CupomInvalidoError(
      `Valor mínimo para este cupom é R$ ${cupom.valorMinimoPedido.toFixed(2).replace('.', ',')}`
    );
  }

  // Restrição de produto
  if (cupom.produtoIds && cupom.produtoIds.length > 0 && opts.produtoId) {
    const permitido = cupom.produtoIds.some(id => id.equals(opts.produtoId!));
    if (!permitido) throw new CupomInvalidoError('Cupom não válido para este produto');
  }

  // Restrição de cliente
  if (cupom.clienteIds && cupom.clienteIds.length > 0 && opts.clienteId) {
    const permitido = cupom.clienteIds.some(id => id.equals(opts.clienteId!));
    if (!permitido) throw new CupomInvalidoError('Cupom não válido para este cliente');
  }

  // Calcular desconto
  let descontoValor: number;
  let descontoPercentual: number;

  if (cupom.tipo === 'percentual') {
    descontoValor = (valorPedido * cupom.valor) / 100;
    descontoPercentual = cupom.valor;
  } else {
    descontoValor = cupom.valor;
    descontoPercentual = (cupom.valor / valorPedido) * 100;
  }

  // Aplica teto de desconto máximo
  if (cupom.valorMaximoDesconto !== undefined && descontoValor > cupom.valorMaximoDesconto) {
    descontoValor = cupom.valorMaximoDesconto;
    descontoPercentual = (descontoValor / valorPedido) * 100;
  }

  // Desconto não pode exceder o valor do pedido
  descontoValor = Math.min(descontoValor, valorPedido);
  const valorFinal = Math.max(0, valorPedido - descontoValor);

  return { cupom, descontoValor, descontoPercentual, valorFinal };
}

/** Incrementa o contador de usos do cupom (chamar após confirmar pedido) */
export async function registrarUsoCupom(cupomId: Types.ObjectId): Promise<void> {
  await CupomModel.findByIdAndUpdate(cupomId, { $inc: { usosRealizados: 1 } });
}

/** Decrementa uso (chamar ao cancelar pedido que tinha cupom) */
export async function estornarUsoCupom(cupomId: Types.ObjectId): Promise<void> {
  await CupomModel.findByIdAndUpdate(cupomId, {
    $inc: { usosRealizados: -1 },
  });
  // Garante que não fique negativo
  await CupomModel.updateOne({ _id: cupomId, usosRealizados: { $lt: 0 } }, { $set: { usosRealizados: 0 } });
}
