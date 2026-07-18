import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { UserModel } from '../models/user.model.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { escapeRegex, parseLimit, parsePage } from '../utils/query.js';

const router = Router();

router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { busca, role, ativo } = req.query as Record<string, string>;
    const page = parsePage(req.query.page as string);
    const limit = parseLimit(req.query.limit as string);
    const filter: Record<string, unknown> = {};
    if (busca) {
      const safe = escapeRegex(busca);
      filter.$or = [
        { nome: { $regex: safe, $options: 'i' } },
        { email: { $regex: safe, $options: 'i' } }
      ];
    }
    if (role) filter.role = role;
    if (ativo !== undefined) filter.ativo = ativo === 'true';

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      UserModel.find(filter).select('-passwordHash').sort({ createdAt: -1 }).skip(skip).limit(limit),
      UserModel.countDocuments(filter)
    ]);
    res.json({ data, total, page, limit });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const user = await UserModel.findById(req.params.id).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });
    res.json(user);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { nome, email, password, role } = req.body as { nome: string; email: string; password: string; role: string };
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Senha deve ter ao menos 6 caracteres' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await UserModel.create({ nome, email, passwordHash, role });
    const { passwordHash: _ph, ...safe } = user.toObject();
    res.status(201).json(safe);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { password, passwordHash, ...rest } = req.body;
    const update: Record<string, unknown> = { ...rest };
    if (password) {
      if (password.length < 6) return res.status(400).json({ message: 'Senha deve ter ao menos 6 caracteres' });
      update.passwordHash = await bcrypt.hash(password, 12);
    }
    const user = await UserModel.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true }).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });
    res.json(user);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticate, authorize('admin'), async (req: AuthenticatedRequest, res, next) => {
  try {
    if (req.user?.id === req.params.id) {
      return res.status(400).json({ message: 'Não é possível desativar o próprio usuário' });
    }
    const user = await UserModel.findByIdAndUpdate(req.params.id, { ativo: false }, { new: true }).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });
    res.json({ message: 'Usuário desativado', user });
  } catch (error) {
    next(error);
  }
});

export { router as usuariosRouter };
