import { Router } from 'express';
import { ProdutoModel } from '../models/produto.model.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { escapeRegex, parseLimit, parsePage } from '../utils/query.js';

const router = Router();

router.get('/', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const { busca, ativo } = req.query as Record<string, string>;
    const page = parsePage(req.query.page as string);
    const limit = parseLimit(req.query.limit as string);
    const filter: Record<string, unknown> = {};
    if (busca) {
      const safe = escapeRegex(busca);
      filter.$or = [
        { nome: { $regex: safe, $options: 'i' } },
        { codigo: { $regex: safe, $options: 'i' } }
      ];
    }
    if (ativo !== undefined) filter.ativo = ativo === 'true';

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      ProdutoModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      ProdutoModel.countDocuments(filter)
    ]);
    res.json({ data, total, page, limit });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const produto = await ProdutoModel.findById(req.params.id);
    if (!produto) return res.status(404).json({ message: 'Produto não encontrado' });
    res.json(produto);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const produto = await ProdutoModel.create(req.body);
    res.status(201).json(produto);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const produto = await ProdutoModel.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!produto) return res.status(404).json({ message: 'Produto não encontrado' });
    res.json(produto);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const produto = await ProdutoModel.findByIdAndUpdate(req.params.id, { ativo: false }, { new: true });
    if (!produto) return res.status(404).json({ message: 'Produto não encontrado' });
    res.json({ message: 'Produto desativado', produto });
  } catch (error) {
    next(error);
  }
});

export { router as produtosRouter };
