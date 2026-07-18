import { Router } from 'express';
import { ClienteModel } from '../models/cliente.model.js';
import { PedidoModel } from '../models/pedido.model.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { escapeRegex, parseLimit, parsePage } from '../utils/query.js';

const router = Router();

router.get('/', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const { busca, tipo, ativo } = req.query as Record<string, string>;
    const page = parsePage(req.query.page as string);
    const limit = parseLimit(req.query.limit as string);
    const filter: Record<string, unknown> = {};
    if (busca) {
      const safe = escapeRegex(busca);
      filter.$or = [
        { nome: { $regex: safe, $options: 'i' } },
        { email: { $regex: safe, $options: 'i' } },
        { documento: { $regex: safe, $options: 'i' } }
      ];
    }
    if (tipo) filter.tipo = tipo;
    if (ativo !== undefined) filter.ativo = ativo === 'true';

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      ClienteModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      ClienteModel.countDocuments(filter)
    ]);
    res.json({ data, total, page, limit });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const cliente = await ClienteModel.findById(req.params.id);
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado' });
    res.json(cliente);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const cliente = await ClienteModel.create(req.body);
    res.status(201).json(cliente);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const cliente = await ClienteModel.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado' });
    res.json(cliente);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/ativo', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { ativo } = req.body as { ativo: boolean };
    if (typeof ativo !== 'boolean') return res.status(400).json({ message: 'Campo ativo deve ser boolean' });
    const cliente = await ClienteModel.findByIdAndUpdate(req.params.id, { ativo }, { new: true });
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado' });
    res.json(cliente);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const cliente = await ClienteModel.findByIdAndUpdate(req.params.id, { ativo: false }, { new: true });
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado' });
    res.json({ message: 'Cliente desativado', cliente });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/pedidos', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const pedidos = await PedidoModel.find({ clienteId: req.params.id })
      .populate('produtoId', 'codigo nome preco')
      .sort({ createdAt: -1 });
    res.json(pedidos);
  } catch (error) {
    next(error);
  }
});

export { router as clientesRouter };
