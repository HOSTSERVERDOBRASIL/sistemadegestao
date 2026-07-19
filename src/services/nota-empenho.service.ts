import { NotaEmpenhoModel } from '../models/nota-empenho.model.js';
import { ContratoFluxoError } from './contrato.service.js';

export async function reservarSaldoNotaEmpenho(input: {
  notaEmpenhoId: string;
  clienteId: string;
  valor: number;
}) {
  const agora = new Date();
  const nota = await NotaEmpenhoModel.findOneAndUpdate({
    _id: input.notaEmpenhoId,
    clienteId: input.clienteId,
    status: { $ne: 'Encerrado' },
    $and: [
      { $or: [{ dataVencimento: { $exists: false } }, { dataVencimento: null }, { dataVencimento: { $gte: agora } }] },
      { $expr: { $lte: [{ $add: ['$valorUtilizado', input.valor] }, '$valor'] } },
    ],
  }, {
    $inc: { valorUtilizado: input.valor },
    $set: { status: 'Parcialmente utilizado' },
  }, { new: true });

  if (!nota) {
    const existe = await NotaEmpenhoModel.findById(input.notaEmpenhoId).lean();
    if (!existe) throw new ContratoFluxoError('Nota de empenho não encontrada', 404);
    if (String(existe.clienteId) !== input.clienteId) throw new ContratoFluxoError('Nota de empenho não pertence ao cliente', 422);
    if (existe.dataVencimento && existe.dataVencimento < agora) throw new ContratoFluxoError('Nota de empenho vencida', 422);
    throw new ContratoFluxoError(`Saldo insuficiente na Nota de Empenho. Disponível: R$ ${(existe.valor - existe.valorUtilizado).toFixed(2)}`, 422);
  }
  return nota;
}

export async function estornarSaldoNotaEmpenho(notaEmpenhoId: unknown, valor: number) {
  const nota = await NotaEmpenhoModel.findOneAndUpdate(
    { _id: notaEmpenhoId, valorUtilizado: { $gte: valor } },
    { $inc: { valorUtilizado: -valor } },
    { new: true },
  );
  if (nota && nota.valorUtilizado <= 0 && nota.status !== 'Encerrado') {
    nota.valorUtilizado = 0;
    nota.status = 'Aberto';
    await nota.save();
  }
  return nota;
}
