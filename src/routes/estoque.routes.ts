import { Router } from 'express';
import { EstoqueItemModel } from '../models/estoque-item.model.js';
import { MovimentoEstoqueModel } from '../models/movimento-estoque.model.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { parsePage, parseLimit } from '../utils/query.js';

const router = Router();

// ─── ITENS DE ESTOQUE ────────────────────────────────────────────────────────

// GET /estoque/items — lista com filtros e KPIs
router.get('/items', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const { tipo, fabricante, status, abaixoMinimo } = req.query as Record<string, string>;
    const page = parsePage(req.query.page as string);
    const limit = parseLimit(req.query.limit as string, 20, 100);
    const filter: Record<string, unknown> = {};
    if (tipo) filter.tipo = tipo;
    if (fabricante) filter.fabricante = fabricante;
    if (status) filter.status = status; else filter.status = { $ne: 'Descontinuado' };
    if (abaixoMinimo === 'true') {
      filter.$expr = { $lt: ['$quantidadeAtual', '$quantidadeMinima'] };
    }

    const [items, total] = await Promise.all([
      EstoqueItemModel.find(filter).sort({ tipo: 1, nome: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      EstoqueItemModel.countDocuments(filter),
    ]);

    // KPIs
    const todos = await EstoqueItemModel.find({ status: { $ne: 'Descontinuado' } }).lean();
    const kpis = {
      totalItens: todos.length,
      abaixoMinimo: todos.filter(i => i.quantidadeAtual < i.quantidadeMinima).length,
      semEstoque: todos.filter(i => i.quantidadeAtual === 0).length,
      totalReservado: todos.reduce((s, i) => s + i.quantidadeReservada, 0),
      valorTotalEstoque: todos.reduce((s, i) => s + i.quantidadeAtual * i.custoUnitario, 0),
    };

    res.json({ data: items, total, page, limit, pages: Math.ceil(total / limit), kpis });
  } catch (e) { next(e); }
});

// GET /estoque/items/alertas — apenas itens abaixo do mínimo
router.get('/items/alertas', authenticate, async (req, res, next) => {
  try {
    const items = await EstoqueItemModel.find({
      status: 'Ativo',
      $expr: { $lte: ['$quantidadeAtual', '$quantidadeMinima'] },
    }).sort({ quantidadeAtual: 1 }).lean();
    res.json(items);
  } catch (e) { next(e); }
});

// GET /estoque/items/:id
router.get('/items/:id', authenticate, async (req, res, next) => {
  try {
    const item = await EstoqueItemModel.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item não encontrado' });
    res.json(item);
  } catch (e) { next(e); }
});

// POST /estoque/items
router.post('/items', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const item = await EstoqueItemModel.create(req.body);
    res.status(201).json(item);
  } catch (e) { next(e); }
});

// PUT /estoque/items/:id
router.put('/items/:id', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    // não permite alterar quantidadeAtual diretamente — apenas via movimentos
    const { quantidadeAtual, quantidadeReservada, ...rest } = req.body;
    const item = await EstoqueItemModel.findByIdAndUpdate(req.params.id, rest, { new: true });
    if (!item) return res.status(404).json({ message: 'Item não encontrado' });
    res.json(item);
  } catch (e) { next(e); }
});

// ─── MOVIMENTOS ──────────────────────────────────────────────────────────────

const ENTRADAS = new Set(['entrada_compra', 'entrada_devolucao', 'entrada_ajuste', 'cancelamento_reserva']);
const SAIDAS   = new Set(['saida_pedido', 'saida_avaria', 'saida_ajuste', 'entrega_reserva']);
const RESERVAS = new Set(['reserva']);

// POST /estoque/movimentos — registrar movimentação
router.post('/movimentos', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const {
      itemId, tipo, quantidade, numerosSerie, lote,
      pedidoId, pedidoNumero, clienteId, clienteNome,
      custoUnitario, notaFiscalFornecedor, observacoes,
    } = req.body;

    if (!itemId || !tipo || !quantidade) {
      return res.status(400).json({ message: 'itemId, tipo e quantidade são obrigatórios' });
    }

    const item = await EstoqueItemModel.findById(itemId);
    if (!item) return res.status(404).json({ message: 'Item de estoque não encontrado' });

    const qtd = Number(quantidade);
    const saldoAnterior = item.quantidadeAtual;
    let saldoPosterior = saldoAnterior;
    let reservadoAnterior = item.quantidadeReservada;

    if (ENTRADAS.has(tipo)) {
      saldoPosterior = saldoAnterior + qtd;
      if (tipo === 'cancelamento_reserva') {
        reservadoAnterior = Math.max(0, reservadoAnterior - qtd);
      }
    } else if (SAIDAS.has(tipo)) {
      const disponivel = saldoAnterior - reservadoAnterior;
      if (tipo === 'entrega_reserva') {
        // desconta do estoque real e da reserva
        if (qtd > reservadoAnterior) return res.status(400).json({ message: 'Quantidade maior que o reservado' });
        saldoPosterior = saldoAnterior - qtd;
        reservadoAnterior = reservadoAnterior - qtd;
      } else {
        if (qtd > disponivel) return res.status(400).json({ message: `Estoque insuficiente. Disponível: ${disponivel}` });
        saldoPosterior = saldoAnterior - qtd;
      }
    } else if (RESERVAS.has(tipo)) {
      const disponivel = saldoAnterior - reservadoAnterior;
      if (qtd > disponivel) return res.status(400).json({ message: `Estoque disponível insuficiente para reserva. Disponível: ${disponivel}` });
      reservadoAnterior = reservadoAnterior + qtd;
      saldoPosterior = saldoAnterior; // reserva não altera saldo real
    }

    const custoTotal = custoUnitario ? qtd * Number(custoUnitario) : undefined;

    const movimento = await MovimentoEstoqueModel.create({
      itemId, tipo, quantidade: qtd,
      numerosSerie: numerosSerie ?? [],
      lote, pedidoId, pedidoNumero, clienteId, clienteNome,
      custoUnitario: custoUnitario ? Number(custoUnitario) : item.custoUnitario,
      custoTotal,
      notaFiscalFornecedor,
      saldoAnterior,
      saldoPosterior,
      responsavelId: (req as any).user?.id,
      responsavelNome: (req as any).user?.nome,
      observacoes,
      dataMovimento: new Date(),
    });

    // atualizar o item
    await EstoqueItemModel.findByIdAndUpdate(itemId, {
      quantidadeAtual: saldoPosterior,
      quantidadeReservada: reservadoAnterior,
      ...(ENTRADAS.has(tipo) && custoUnitario ? { custoUnitario: Number(custoUnitario) } : {}),
    });

    res.status(201).json({ movimento, saldoAtual: saldoPosterior });
  } catch (e) { next(e); }
});

// GET /estoque/movimentos — histórico com filtros
router.get('/movimentos', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const { itemId, tipo, pedidoId } = req.query as Record<string, string>;
    const page = parsePage(req.query.page as string);
    const limit = parseLimit(req.query.limit as string, 30, 200);
    const filter: Record<string, unknown> = {};
    if (itemId) filter.itemId = itemId;
    if (tipo) filter.tipo = tipo;
    if (pedidoId) filter.pedidoId = pedidoId;

    const [data, total] = await Promise.all([
      MovimentoEstoqueModel.find(filter)
        .populate('itemId', 'codigo nome tipo fabricante')
        .sort({ dataMovimento: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      MovimentoEstoqueModel.countDocuments(filter),
    ]);

    res.json({ data, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (e) { next(e); }
});

// GET /estoque/movimentos/item/:itemId — histórico de um item
router.get('/movimentos/item/:itemId', authenticate, async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit as string, 50, 200);
    const movs = await MovimentoEstoqueModel.find({ itemId: req.params.itemId })
      .sort({ dataMovimento: -1 })
      .limit(limit)
      .lean();
    res.json(movs);
  } catch (e) { next(e); }
});

export { router as estoqueRouter };
