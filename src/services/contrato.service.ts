import { Types } from 'mongoose';
import { ContratoModel } from '../models/contrato.model.js';
import { OrdemFornecimentoModel } from '../models/ordem-fornecimento.model.js';
import { PedidoModel } from '../models/pedido.model.js';

export class ContratoFluxoError extends Error {
  constructor(message: string, public readonly statusCode = 422) {
    super(message);
    this.name = 'ContratoFluxoError';
  }
}

function mesmoId(a: unknown, b: unknown): boolean {
  return String(a ?? '') === String(b ?? '');
}

export function validarPeriodo(dataInicio: Date, dataFim: Date): void {
  if (Number.isNaN(dataInicio.getTime()) || Number.isNaN(dataFim.getTime())) {
    throw new ContratoFluxoError('Período do contrato inválido', 400);
  }
  if (dataFim <= dataInicio) {
    throw new ContratoFluxoError('A data final deve ser posterior à data inicial', 400);
  }
}

export function contratoEstaVigente(contrato: { dataInicio: Date; dataFim: Date }): boolean {
  const agora = new Date();
  return contrato.dataInicio <= agora && agora <= contrato.dataFim;
}

export function valorTotalComDireito(contrato: { valorTotal: number; aditivos?: Array<{ valor: number }> }): number {
  return contrato.valorTotal + (contrato.aditivos ?? []).reduce((total, aditivo) => total + aditivo.valor, 0);
}

async function totalReservado(contratoId: Types.ObjectId, ordemFornecimentoId?: Types.ObjectId): Promise<number> {
  const filter: Record<string, unknown> = {
    contratoId,
    nfEmitida: { $ne: true },
    saldoStatus: { $ne: 'Estornado' },
  };
  if (ordemFornecimentoId) filter.ordemFornecimentoId = ordemFornecimentoId;
  const result = await PedidoModel.aggregate<{ total: number }>([
    { $match: filter },
    { $group: { _id: null, total: { $sum: '$valorTotal' } } },
  ]);
  return result[0]?.total ?? 0;
}

export async function validarVinculoContrato(input: {
  contratoId: string;
  clienteId: string;
  valor: number;
  ordemFornecimentoId?: string;
}) {
  const contrato = await ContratoModel.findById(input.contratoId);
  if (!contrato) throw new ContratoFluxoError('Contrato não encontrado', 404);
  if (!contrato.ativo) throw new ContratoFluxoError('Contrato encerrado');
  if (!contratoEstaVigente(contrato)) throw new ContratoFluxoError('Contrato fora do período de vigência');
  if (!mesmoId(contrato.clienteId, input.clienteId)) {
    throw new ContratoFluxoError('O contrato não pertence ao cliente selecionado');
  }
  if (!Number.isFinite(input.valor) || input.valor <= 0) {
    throw new ContratoFluxoError('Valor do pedido inválido', 400);
  }

  if (contrato.modalidade === 'Por Ordem de Fornecimento') {
    if (!input.ordemFornecimentoId) throw new ContratoFluxoError('Selecione uma ordem de fornecimento');
    const ordem = await OrdemFornecimentoModel.findOne({
      _id: input.ordemFornecimentoId,
      contratoId: contrato._id,
    });
    if (!ordem) throw new ContratoFluxoError('Ordem de fornecimento não pertence ao contrato', 404);
    if (ordem.status === 'Fechada') throw new ContratoFluxoError('Ordem de fornecimento fechada');
    if (ordem.dataFim && ordem.dataFim < new Date()) throw new ContratoFluxoError('Ordem de fornecimento vencida');
    const reservado = await totalReservado(contrato._id, ordem._id as Types.ObjectId);
    const disponivel = ordem.valor - ordem.valorFaturado - reservado;
    if (input.valor > disponivel + 0.001) {
      throw new ContratoFluxoError(`Saldo insuficiente na OF. Disponível: R$ ${disponivel.toFixed(2)}`);
    }
    return { contrato, ordem, saldoDisponivel: disponivel };
  }

  if (input.ordemFornecimentoId) {
    throw new ContratoFluxoError('Este contrato não utiliza ordem de fornecimento');
  }

  const reservado = await totalReservado(contrato._id as Types.ObjectId);
  const totalComDireito = valorTotalComDireito(contrato);
  const disponivel = totalComDireito - contrato.valorFaturado - reservado;
  if (contrato.modalidade === 'Total' && (reservado > 0 || contrato.valorFaturado > 0)) {
    throw new ContratoFluxoError('O contrato de faturamento total já possui pedido ou faturamento');
  }
  if (contrato.modalidade === 'Total' && Math.abs(input.valor - totalComDireito) > 0.01) {
    throw new ContratoFluxoError('O pedido deve usar o valor total do contrato');
  }
  if (input.valor > disponivel + 0.001) {
    throw new ContratoFluxoError(`Saldo insuficiente no contrato. Disponível: R$ ${disponivel.toFixed(2)}`);
  }
  return { contrato, ordem: null, saldoDisponivel: disponivel };
}

export async function validarNovaOrdem(contratoId: string, valor: number, dataFim?: Date, dataEmissao = new Date()) {
  const contrato = await ContratoModel.findById(contratoId);
  if (!contrato) throw new ContratoFluxoError('Contrato não encontrado', 404);
  if (!contrato.ativo) throw new ContratoFluxoError('Contrato encerrado');
  if (!contratoEstaVigente(contrato)) throw new ContratoFluxoError('Contrato fora do período de vigência');
  if (contrato.modalidade !== 'Por Ordem de Fornecimento') {
    throw new ContratoFluxoError('O contrato não utiliza ordens de fornecimento');
  }
  if (!Number.isFinite(valor) || valor <= 0) throw new ContratoFluxoError('Valor da OF deve ser maior que zero', 400);
  if (Number.isNaN(dataEmissao.getTime()) || dataEmissao < contrato.dataInicio || dataEmissao > contrato.dataFim) {
    throw new ContratoFluxoError('A data de emissão da OF deve estar dentro da vigência do contrato', 400);
  }
  if (dataFim && (Number.isNaN(dataFim.getTime()) || dataFim > contrato.dataFim)) {
    throw new ContratoFluxoError('A vigência da OF deve terminar dentro da vigência do contrato', 400);
  }
  if (dataFim && dataFim < dataEmissao) {
    throw new ContratoFluxoError('A data final da OF não pode ser anterior à emissão', 400);
  }
  const alocado = await OrdemFornecimentoModel.aggregate<{ total: number }>([
    { $match: { contratoId: contrato._id } },
    { $group: { _id: null, total: { $sum: '$valor' } } },
  ]);
  const disponivel = valorTotalComDireito(contrato) - (alocado[0]?.total ?? 0);
  if (valor > disponivel + 0.001) {
    throw new ContratoFluxoError(`Valor excede o saldo não alocado do contrato: R$ ${disponivel.toFixed(2)}`);
  }
  return contrato;
}
