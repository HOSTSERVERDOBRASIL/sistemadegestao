import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { UserModel } from '../models/user.model.js';
import { TokenBlacklistModel } from '../models/token-blacklist.model.js';
import { authenticate } from '../middleware/auth.middleware.js';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { env } from '../config/env.js';

const router = Router();

router.get('/me', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = await UserModel.findById(req.user?.id).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'Usuário não encontrado' });
    res.json(user);
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    const jti = randomUUID();
    const jwtPayload: Record<string, unknown> = { sub: user._id.toString(), role: user.role, jti };
    if (user.parceiroId) jwtPayload.parceiroId = user.parceiroId.toString();
    const token = jwt.sign(
      jwtPayload,
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] }
    );
    const userResp: Record<string, unknown> = { id: user._id, email: user.email, role: user.role };
    if (user.parceiroId) userResp.parceiroId = user.parceiroId.toString();
    res.json({ token, user: userResp });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', authenticate, async (req: AuthenticatedRequest, res, next) => {
  try {
    const header = req.headers.authorization!;
    const token = header.slice(7);
    const payload = jwt.decode(token) as { jti?: string; exp?: number } | null;

    if (payload?.jti && payload?.exp) {
      await TokenBlacklistModel.create({
        jti: payload.jti,
        expiresAt: new Date(payload.exp * 1000),
      });
    }

    res.json({ message: 'Logout realizado com sucesso' });
  } catch (error) {
    next(error);
  }
});

export { router as authRouter };
