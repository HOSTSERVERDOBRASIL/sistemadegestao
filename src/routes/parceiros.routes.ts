import { Router } from 'express';
import { ParceiroModel } from '../models/parceiro.model.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const { page = '1', limit = '20', busca, ativo, emissorNFPadrao } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = {};
    if (busca) filter.$or = [
      { nome: { $regex: busca, $options: 'i' } },
      { documento: { $regex: busca, $options: 'i' } },
      { email: { $regex: busca, $options: 'i' } }
    ];
    if (ativo !== undefined) filter.ativo = ativo === 'true';
    if (emissorNFPadrao) filter.emissorNFPadrao = emissorNFPadrao;

    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      ParceiroModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      ParceiroModel.countDocuments(filter)
    ]);
    res.json({ data, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const parceiro = await ParceiroModel.findById(req.params.id);
    if (!parceiro) return res.status(404).json({ message: 'Parceiro não encontrado' });
    res.json(parceiro);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const parceiro = await ParceiroModel.create(req.body);
    res.status(201).json(parceiro);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const parceiro = await ParceiroModel.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!parceiro) return res.status(404).json({ message: 'Parceiro não encontrado' });
    res.json(parceiro);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/ativo', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { ativo } = req.body as { ativo: boolean };
    if (typeof ativo !== 'boolean') return res.status(400).json({ message: 'Campo ativo deve ser boolean' });
    const parceiro = await ParceiroModel.findByIdAndUpdate(req.params.id, { ativo }, { new: true });
    if (!parceiro) return res.status(404).json({ message: 'Parceiro não encontrado' });
    res.json(parceiro);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const parceiro = await ParceiroModel.findByIdAndUpdate(req.params.id, { ativo: false }, { new: true });
    if (!parceiro) return res.status(404).json({ message: 'Parceiro não encontrado' });
    res.json({ message: 'Parceiro desativado', parceiro });
  } catch (error) {
    next(error);
  }
});

export { router as parceirosRouter };
