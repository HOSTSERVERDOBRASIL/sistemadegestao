import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserModel } from '../models/user.model.js';
import { TokenBlacklistModel } from '../models/token-blacklist.model.js';
import { env } from '../config/env.js';

export interface AuthenticatedRequest extends Request {
  user?: { id: string; role: string };
}

export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token ausente' });
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; jti?: string; exp?: number };

    if (payload.jti) {
      const revogado = await TokenBlacklistModel.exists({ jti: payload.jti });
      if (revogado) return res.status(401).json({ message: 'Token revogado' });
    }

    const user = await UserModel.findById(payload.sub).select('_id role ativo');
    if (!user || !user.ativo) {
      return res.status(401).json({ message: 'Usuário inválido ou inativo' });
    }
    req.user = { id: user._id.toString(), role: user.role };
    next();
  } catch {
    return res.status(401).json({ message: 'Token inválido ou expirado' });
  }
}

export function authorize(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: 'Não autenticado' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'Sem permissão' });
    next();
  };
}
