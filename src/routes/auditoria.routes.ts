import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { AuditoriaModel } from '../models/auditoria.model.js';
import { escapeRegex, parseLimit, parsePage } from '../utils/query.js';

const router = Router();
router.use(authenticate, authorize('admin', 'financeiro'));

router.get('/', async (req, res, next) => {
  try {
    const { entidade, entidadeId, usuarioId, acao, de, ate } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = {};
    if (entidade) filter.entidade = entidade;
    if (entidadeId) filter.entidadeId = entidadeId;
    if (usuarioId) filter.usuarioId = usuarioId;
    if (acao) filter.acao = { $regex: escapeRegex(acao), $options: 'i' };
    if (de || ate) {
      filter.createdAt = {
        ...(de ? { $gte: new Date(de) } : {}),
        ...(ate ? { $lte: new Date(`${ate}T23:59:59.999`) } : {}),
      };
    }
    const page = parsePage(req.query.page as string);
    const limit = parseLimit(req.query.limit as string, 50);
    const [data, total] = await Promise.all([
      AuditoriaModel.find(filter).populate('usuarioId', 'nome email').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditoriaModel.countDocuments(filter),
    ]);
    res.json({ data, total, page, limit });
  } catch (error) { next(error); }
});

router.get('/pedido/:id', async (req, res, next) => {
  try {
    res.json(await AuditoriaModel.find({ entidade: 'Pedido', entidadeId: req.params.id })
      .populate('usuarioId', 'nome email').sort({ createdAt: 1 }).lean());
  } catch (error) { next(error); }
});

export { router as auditoriaRouter };
