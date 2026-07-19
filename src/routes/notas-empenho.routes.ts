import { Router } from 'express';
import { NotaEmpenhoModel } from '../models/nota-empenho.model.js';
import { PedidoModel } from '../models/pedido.model.js';
import { ClienteModel } from '../models/cliente.model.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { escapeRegex, parseLimit, parsePage } from '../utils/query.js';

const router = Router();

function toFilter(v: string | undefined) {
  if (!v) return undefined
  const arr = v.split(',').map(s => s.trim()).filter(Boolean)
  return arr.length === 1 ? arr[0] : { $in: arr }
}

router.get('/', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const { busca, clienteId, status } = req.query as Record<string, string>;
    const page = parsePage(req.query.page as string);
    const limit = parseLimit(req.query.limit as string);
    const filter: Record<string, unknown> = {};

    if (busca) filter.numero = { $regex: escapeRegex(busca), $options: 'i' };
    if (clienteId) filter.clienteId = clienteId;
    const statusFilter = toFilter(status)
    if (statusFilter) filter.status = statusFilter;

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      NotaEmpenhoModel.find(filter)
        .populate('clienteId', 'nome documento')
        .populate('contratoId', 'numero modalidade')
        .sort({ dataEmissao: -1 })
        .skip(skip)
        .limit(limit),
      NotaEmpenhoModel.countDocuments(filter),
    ]);
    res.json({ data, total, page, limit });
  } catch (error) { next(error); }
});

router.get('/:id', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const nota = await NotaEmpenhoModel.findById(req.params.id)
      .populate('clienteId', 'nome documento email')
      .populate('contratoId', 'numero modalidade valorTotal');
    if (!nota) return res.status(404).json({ message: 'Nota de empenho não encontrada' });
    res.json(nota);
  } catch (error) { next(error); }
});

router.get('/:id/pedidos', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const pedidos = await PedidoModel.find({ notaEmpenhoId: req.params.id })
      .populate('clienteId', 'nome documento')
      .populate('produtoId', 'codigo nome')
      .sort({ createdAt: -1 });
    res.json(pedidos);
  } catch (error) { next(error); }
});

router.post('/', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { numero, clienteId, contratoId, valor, dataEmissao, dataVencimento, descricao, observacoes } =
      req.body as Record<string, unknown>;

    if (!numero || !clienteId || !valor || !dataEmissao) {
      return res.status(400).json({ message: 'Campos obrigatórios: numero, clienteId, valor, dataEmissao' });
    }

    const cliente = await ClienteModel.findById(clienteId);
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado' });

    const nota = await NotaEmpenhoModel.create({
      numero, clienteId, contratoId: contratoId || undefined,
      valor: Number(valor),
      dataEmissao: new Date(dataEmissao as string),
      dataVencimento: dataVencimento ? new Date(dataVencimento as string) : undefined,
      descricao, observacoes,
    });
    res.status(201).json(nota);
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 11000) {
      return res.status(409).json({ message: 'Já existe uma nota de empenho com este número' });
    }
    next(error);
  }
});

router.put('/:id', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { numero, descricao, dataVencimento, status, observacoes } = req.body as Record<string, unknown>;
    const allowed: Record<string, unknown> = {};
    if (numero !== undefined) allowed.numero = numero;
    if (descricao !== undefined) allowed.descricao = descricao;
    if (dataVencimento !== undefined) allowed.dataVencimento = dataVencimento ? new Date(dataVencimento as string) : undefined;
    if (status !== undefined) allowed.status = status;
    if (observacoes !== undefined) allowed.observacoes = observacoes;

    const nota = await NotaEmpenhoModel.findByIdAndUpdate(req.params.id, allowed, { new: true, runValidators: true });
    if (!nota) return res.status(404).json({ message: 'Nota de empenho não encontrada' });
    res.json(nota);
  } catch (error) { next(error); }
});

router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const emUso = await PedidoModel.countDocuments({ notaEmpenhoId: req.params.id });
    if (emUso > 0) {
      return res.status(409).json({ message: `Nota de empenho vinculada a ${emUso} pedido(s) — encerre-a em vez de excluir` });
    }
    const nota = await NotaEmpenhoModel.findByIdAndDelete(req.params.id);
    if (!nota) return res.status(404).json({ message: 'Nota de empenho não encontrada' });
    res.json({ message: 'Nota de empenho removida', nota });
  } catch (error) { next(error); }
});

export { router as notasEmpenhoRouter };
