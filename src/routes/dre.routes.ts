import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { PedidoModel } from '../models/pedido.model.js';
import { CobrancaModel } from '../models/cobranca.model.js';
import { ContaPagarModel } from '../models/conta-pagar.model.js';

const router = Router();

router.use(authenticate, authorize('admin', 'financeiro'));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function monthRange(year: number, month: number): { inicio: Date; fim: Date } {
  const inicio = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const fim    = new Date(year, month,     0, 23, 59, 59, 999);
  return { inicio, fim };
}

interface CentroAgg { _id: string | null; valor: number }
interface TotalAgg   { total: number }

async function calcMes(inicio: Date, fim: Date) {
  const [recAgg, despAgg] = await Promise.all([
    PedidoModel.aggregate<TotalAgg>([
      { $match: { etapaOperacional: 'Conclusao', createdAt: { $gte: inicio, $lte: fim } } },
      { $group: { _id: null, total: { $sum: '$valorTotal' } } },
    ]),
    ContaPagarModel.aggregate<CentroAgg>([
      {
        $match: {
          status: { $in: ['Paga', 'Parcialmente Paga'] },
          dataPagamento: { $gte: inicio, $lte: fim },
        },
      },
      { $group: { _id: '$centroCusto', valor: { $sum: '$valorPago' } } },
    ]),
  ]);

  const pedidosFaturados = recAgg[0]?.total ?? 0;
  const porCentro = despAgg.map(d => ({ centro: d._id ?? 'sem centro', valor: d.valor }));
  const totalDespesas = porCentro.reduce((s, d) => s + d.valor, 0);
  const lucrobruto    = pedidosFaturados - totalDespesas;
  const margemBruta   = pedidosFaturados > 0
    ? Math.round((lucrobruto / pedidosFaturados) * 10000) / 100
    : 0;

  return {
    receitas: { pedidosFaturados, totalReceitas: pedidosFaturados },
    despesas: { porCentro, totalDespesas },
    resultado: { lucrobruto, margemBruta },
  };
}

// ─── GET /mensal ─────────────────────────────────────────────────────────────

router.get('/mensal', async (req, res, next) => {
  try {
    const now = new Date();
    const ano = Number(req.query.ano ?? now.getFullYear());
    const mes = Number(req.query.mes ?? now.getMonth() + 1);
    const { inicio, fim } = monthRange(ano, mes);
    const dre = await calcMes(inicio, fim);
    const periodo = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });
    res.json({ periodo, ...dre });
  } catch (err) {
    next(err);
  }
});

// ─── GET /anual ──────────────────────────────────────────────────────────────

router.get('/anual', async (req, res, next) => {
  try {
    const now = new Date();
    const ano = Number(req.query.ano ?? now.getFullYear());

    const meses = await Promise.all(
      Array.from({ length: 12 }, (_, i) => i + 1).map(async mes => {
        const { inicio, fim } = monthRange(ano, mes);
        const dre = await calcMes(inicio, fim);
        return {
          mes,
          mesNome: new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }),
          receitas: dre.receitas.totalReceitas,
          despesas: dre.despesas.totalDespesas,
          resultado: dre.resultado.lucrobruto,
        };
      }),
    );

    res.json({ ano, meses });
  } catch (err) {
    next(err);
  }
});

// ─── GET /fluxo-caixa ────────────────────────────────────────────────────────

router.get('/fluxo-caixa', async (req, res, next) => {
  try {
    const mesesFuturos = Math.max(1, Math.min(24, Number(req.query.meses ?? 6)));
    const now = new Date();

    // saldoAtual: total histórico de cobranças CONCLUIDA − ContaPagar pagas
    const [cobTotal, despTotal] = await Promise.all([
      CobrancaModel.aggregate<TotalAgg>([
        { $match: { status: 'CONCLUIDA' } },
        { $group: { _id: null, total: { $sum: '$valor' } } },
      ]),
      ContaPagarModel.aggregate<TotalAgg>([
        { $match: { status: { $in: ['Paga', 'Parcialmente Paga'] } } },
        { $group: { _id: null, total: { $sum: '$valorPago' } } },
      ]),
    ]);
    const saldoAtual = (cobTotal[0]?.total ?? 0) - (despTotal[0]?.total ?? 0);

    // histórico: últimos 6 meses reais
    const historico = await Promise.all(
      Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
        const { inicio, fim } = monthRange(d.getFullYear(), d.getMonth() + 1);
        const mesKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

        return Promise.all([
          CobrancaModel.aggregate<TotalAgg>([
            { $match: { status: 'CONCLUIDA', pagoEm: { $gte: inicio, $lte: fim } } },
            { $group: { _id: null, total: { $sum: '$valor' } } },
          ]),
          ContaPagarModel.aggregate<TotalAgg>([
            {
              $match: {
                status: { $in: ['Paga', 'Parcialmente Paga'] },
                dataPagamento: { $gte: inicio, $lte: fim },
              },
            },
            { $group: { _id: null, total: { $sum: '$valorPago' } } },
          ]),
        ]).then(([entAgg, saiAgg]) => {
          const entradas = entAgg[0]?.total ?? 0;
          const saidas   = saiAgg[0]?.total ?? 0;
          return { mes: mesKey, entradas, saidas, saldo: entradas - saidas };
        });
      }),
    );

    // projeção: próximos N meses
    const projecao = await Promise.all(
      Array.from({ length: mesesFuturos }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() + 1 + i, 1);
        const { inicio, fim } = monthRange(d.getFullYear(), d.getMonth() + 1);
        const mesKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

        return Promise.all([
          // entradas previstas: pedidos abertos (não concluídos, não cancelados) no período
          PedidoModel.aggregate<TotalAgg>([
            {
              $match: {
                etapaOperacional: { $ne: 'Conclusao' },
                status: { $nin: ['Cancelado'] },
                createdAt: { $gte: inicio, $lte: fim },
              },
            },
            { $group: { _id: null, total: { $sum: '$valorTotal' } } },
          ]),
          // saídas previstas: ContaPagar pendentes com vencimento no período
          ContaPagarModel.aggregate<TotalAgg>([
            {
              $match: {
                status: { $in: ['Pendente', 'Aprovada'] },
                dataVencimento: { $gte: inicio, $lte: fim },
              },
            },
            { $group: { _id: null, total: { $sum: '$valor' } } },
          ]),
        ]).then(([entAgg, saiAgg]) => {
          const entradasPrevistas = entAgg[0]?.total ?? 0;
          const saidasPrevistas   = saiAgg[0]?.total ?? 0;
          return {
            mes: mesKey,
            entradasPrevistas,
            saidasPrevistas,
            saldoPrevisto: entradasPrevistas - saidasPrevistas,
          };
        });
      }),
    );

    res.json({ saldoAtual, historico, projecao });
  } catch (err) {
    next(err);
  }
});

export { router as dreRouter };
