import { Types } from 'mongoose';
import { ConfiguracaoModel } from '../models/configuracao.model.js';
import { MovimentoCreditoRevendaModel } from '../models/movimento-credito-revenda.model.js';
import { IRegraCobrancaRevenda, ParceiroModel } from '../models/parceiro.model.js';

function camposConfig(value: unknown): Record<string, string> {
  if (value instanceof Map) return Object.fromEntries(value.entries());
  return value && typeof value === 'object' ? value as Record<string, string> : {};
}

export async function obterRegraCobrancaRevenda(parceiroId: string | Types.ObjectId) {
  const parceiro = await ParceiroModel.findById(parceiroId).lean();
  if (!parceiro) return null;
  const config = await ConfiguracaoModel.findOne({ servico: 'revendas' }).lean();
  const campos = camposConfig(config?.campos);
  const padrao: IRegraCobrancaRevenda = {
    formaPagamento: (campos.REVENDAS_FORMA_PAGAMENTO_PADRAO || 'Pre-pago') as IRegraCobrancaRevenda['formaPagamento'],
    certificadosInternacionais: (campos.REVENDAS_COBRANCA_INTERNACIONAL || 'Por emissao') as IRegraCobrancaRevenda['certificadosInternacionais'],
    certificadosIcpBrasil: (campos.REVENDAS_COBRANCA_ICP_BRASIL || 'Por emissao') as IRegraCobrancaRevenda['certificadosIcpBrasil'],
    diaVencimento: Number(campos.REVENDAS_DIA_VENCIMENTO || 10),
    limiteCredito: Number(campos.REVENDAS_LIMITE_CREDITO_PADRAO || 0),
  };
  return {
    parceiro,
    origem: parceiro.usarRegraCobrancaPadrao !== false ? 'padrao' as const : 'revenda' as const,
    regras: parceiro.usarRegraCobrancaPadrao !== false ? padrao : parceiro.regrasCobranca,
  };
}

export async function movimentarCreditoRevenda(params: {
  parceiroId: string | Types.ObjectId;
  valor: number;
  tipo: 'Aporte' | 'Consumo' | 'Estorno' | 'Ajuste';
  descricao: string;
  pedidoId?: string | Types.ObjectId;
  usuarioId?: string | Types.ObjectId;
}) {
  const valorAbsoluto = Math.round(Math.abs(params.valor) * 100) / 100;
  if (!Number.isFinite(valorAbsoluto) || valorAbsoluto <= 0) throw new Error('O valor deve ser maior que zero');
  const credito = params.tipo === 'Aporte' || params.tipo === 'Estorno' || (params.tipo === 'Ajuste' && params.valor > 0);
  const delta = credito ? valorAbsoluto : -valorAbsoluto;
  const filtro: Record<string, unknown> = { _id: params.parceiroId };
  if (delta < 0) filtro.saldoCreditos = { $gte: valorAbsoluto };
  const parceiro = await ParceiroModel.findOneAndUpdate(filtro, { $inc: { saldoCreditos: delta } }, { new: true });
  if (!parceiro) {
    const existe = await ParceiroModel.exists({ _id: params.parceiroId });
    if (!existe) throw new Error('Revenda não encontrada');
    throw new Error('Saldo de créditos insuficiente');
  }
  const saldoPosterior = parceiro.saldoCreditos;
  let movimento;
  try {
    movimento = await MovimentoCreditoRevendaModel.create({
      parceiroId: parceiro._id,
      pedidoId: params.pedidoId,
      tipo: params.tipo,
      valor: delta,
      saldoAnterior: saldoPosterior - delta,
      saldoPosterior,
      descricao: params.descricao,
      usuarioId: params.usuarioId,
    });
  } catch (error) {
    await ParceiroModel.updateOne({ _id: parceiro._id }, { $inc: { saldoCreditos: -delta } });
    throw error;
  }
  return { parceiro, movimento };
}
