import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { LogModel } from '../models/log.model.js';

const router = Router();

// Todos os endpoints de admin exigem token + role admin
router.use(authenticate, authorize('admin'));

// ─── GET /admin/logs ──────────────────────────────────────────────────────────
// Query params:
//   level   — 'warn' | 'error' | 'fatal'  (padrão: warn+)
//   de      — ISO date string  (padrão: últimas 24h)
//   ate     — ISO date string  (padrão: agora)
//   busca   — string para pesquisa em message e err.message
//   page    — número da página  (padrão: 1)
//   limit   — itens por página  (padrão: 50, máx: 200)
router.get('/logs', async (req, res, next) => {
  try {
    const {
      level,
      de,
      ate,
      busca,
      page = '1',
      limit = '50',
    } = req.query as Record<string, string>;

    const filter: Record<string, unknown> = {};

    // Filtro de nível
    const LEVEL_NUMS: Record<string, number> = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };
    const minLevel = LEVEL_NUMS[level ?? 'warn'] ?? 40;
    filter.levelNum = { $gte: minLevel };

    // Filtro de data
    const dataInicio = de ? new Date(de) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dataFim    = ate ? new Date(ate) : new Date();
    if (!isNaN(dataInicio.getTime()) && !isNaN(dataFim.getTime())) {
      filter.createdAt = { $gte: dataInicio, $lte: dataFim };
    }

    // Busca textual em message e err.message
    if (busca?.trim()) {
      const re = new RegExp(busca.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ message: re }, { 'err.message': re }];
    }

    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip     = (pageNum - 1) * limitNum;

    const [data, total] = await Promise.all([
      LogModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      LogModel.countDocuments(filter),
    ]);

    res.json({
      data,
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    next(error);
  }
});

// ─── GET /admin/logs/stats ────────────────────────────────────────────────────
// Contagem de logs por nível nas últimas N horas (padrão: 24h)
router.get('/logs/stats', async (req, res, next) => {
  try {
    const horas = Math.min(168, parseInt(String(req.query.horas ?? '24'), 10) || 24);
    const desde = new Date(Date.now() - horas * 60 * 60 * 1000);

    const stats = await LogModel.aggregate([
      { $match: { createdAt: { $gte: desde } } },
      { $group: { _id: '$level', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    const result: Record<string, number> = { warn: 0, error: 0, fatal: 0 };
    for (const s of stats) result[s._id as string] = s.count;

    res.json({ horas, desde, stats: result, total: Object.values(result).reduce((a, b) => a + b, 0) });
  } catch (error) {
    next(error);
  }
});

// ─── DELETE /admin/logs ───────────────────────────────────────────────────────
// Limpa logs anteriores a uma data (padrão: mais de 7 dias)
router.delete('/logs', async (req, res, next) => {
  try {
    const diasAtras = Math.max(1, parseInt(String(req.query.diasAtras ?? '7'), 10) || 7);
    const antes = new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000);
    const { deletedCount } = await LogModel.deleteMany({ createdAt: { $lt: antes } });
    res.json({ message: `${deletedCount} log(s) removido(s) anteriores a ${antes.toISOString()}`, deletedCount });
  } catch (error) {
    next(error);
  }
});

export { router as adminRouter };
