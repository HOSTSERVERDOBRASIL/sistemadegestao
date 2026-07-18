import { Router } from 'express';
import { PedidoModel } from '../models/pedido.model.js';
import { NotaFiscalModel } from '../models/nota-fiscal.model.js';
import { ContratoModel } from '../models/contrato.model.js';
import { ClienteModel } from '../models/cliente.model.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = Router();

const roles = ['admin', 'financeiro', 'operador'] as const;

router.get('/resumo', authenticate, authorize(...roles), async (req, res, next) => {
  try {
    const { dataInicio, dataFim } = req.query as Record<string, string>;
    const match: Record<string, unknown> = {};
    if (dataInicio || dataFim) {
      const range: Record<string, Date> = {};
      if (dataInicio) range.$gte = new Date(dataInicio);
      if (dataFim) range.$lte = new Date(dataFim + 'T23:59:59.999Z');
      match.createdAt = range;
    }

    const [pedidos, notas, faturados, totalNF] = await Promise.all([
      PedidoModel.countDocuments(match),
      NotaFiscalModel.countDocuments({ ...match, status: 'Emitida' }),
      PedidoModel.countDocuments({ ...match, nfEmitida: true }),
      NotaFiscalModel.aggregate([
        { $match: { ...match, status: 'Emitida' } },
        { $group: { _id: null, soma: { $sum: '$valor' } } }
      ])
    ]);

    res.json({
      pedidos,
      notasEmitidas: notas,
      pedidosFaturados: faturados,
      totalFaturado: totalNF[0]?.soma ?? 0
    });
  } catch (error) {
    next(error);
  }
});

router.get('/faturamento-por-cliente', authenticate, authorize('admin', 'financeiro'), async (_req, res, next) => {
  try {
    const result = await PedidoModel.aggregate([
      { $match: { nfEmitida: true } },
      { $group: { _id: '$clienteId', totalFaturado: { $sum: '$valorTotal' }, pedidos: { $sum: 1 } } },
      { $sort: { totalFaturado: -1 } },
      { $limit: 50 },
      {
        $lookup: {
          from: 'clientes',
          localField: '_id',
          foreignField: '_id',
          as: 'cliente'
        }
      },
      { $unwind: { path: '$cliente', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          clienteId: '$_id',
          nomeCliente: '$cliente.nome',
          documentoCliente: '$cliente.documento',
          totalFaturado: 1,
          pedidos: 1
        }
      }
    ]);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/faturamento-por-modalidade', authenticate, authorize('admin', 'financeiro'), async (_req, res, next) => {
  try {
    const result = await PedidoModel.aggregate([
      { $match: { nfEmitida: true } },
      { $group: { _id: '$vinculo.tipo', totalFaturado: { $sum: '$valorTotal' }, pedidos: { $sum: 1 } } },
      { $sort: { totalFaturado: -1 } }
    ]);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/pedidos-por-status', authenticate, authorize(...roles), async (_req, res, next) => {
  try {
    const result = await PedidoModel.aggregate([
      { $group: { _id: '$status', total: { $sum: 1 }, valor: { $sum: '$valorTotal' } } },
      { $sort: { total: -1 } }
    ]);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/contratos-com-saldo', authenticate, authorize('admin', 'financeiro', 'operador'), async (_req, res, next) => {
  try {
    const contratos = await ContratoModel.find({ ativo: true }).lean();
    const comSaldo = contratos
      .map(c => ({ ...c, saldoDisponivel: c.valorTotal - c.valorFaturado }))
      .filter(c => c.saldoDisponivel > 0)
      .sort((a, b) => b.saldoDisponivel - a.saldoDisponivel);
    res.json(comSaldo);
  } catch (error) {
    next(error);
  }
});

router.get('/faturamento-por-mes', authenticate, authorize('admin', 'financeiro'), async (req, res, next) => {
  try {
    const meses = Number((req.query as Record<string, string>).meses) || 12;
    const result = await NotaFiscalModel.aggregate([
      { $match: { status: 'Emitida' } },
      {
        $group: {
          _id: { ano: { $year: '$createdAt' }, mes: { $month: '$createdAt' } },
          total: { $sum: '$valor' },
          quantidade: { $sum: 1 }
        }
      },
      { $sort: { '_id.ano': -1, '_id.mes': -1 } },
      { $limit: meses }
    ]);
    res.json(result.reverse());
  } catch (error) {
    next(error);
  }
});

router.get('/clientes-ativos', authenticate, authorize('admin', 'financeiro', 'operador'), async (_req, res, next) => {
  try {
    const total = await ClienteModel.countDocuments();
    const ativos = await ClienteModel.countDocuments({ ativo: true });
    const pf = await ClienteModel.countDocuments({ tipo: 'pessoa-fisica' });
    const pj = await ClienteModel.countDocuments({ tipo: 'pessoa-juridica' });
    res.json({ total, ativos, inativos: total - ativos, pessoaFisica: pf, pessoaJuridica: pj });
  } catch (error) {
    next(error);
  }
});

export { router as relatoriosRouter };
