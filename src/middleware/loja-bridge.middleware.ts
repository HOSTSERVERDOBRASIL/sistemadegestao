import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

export function authenticateLojaBridge(req: Request, res: Response, next: NextFunction): void {
  const expected = env.GESTAO_BRIDGE_API_KEY;
  if (!expected) {
    res.status(503).json({ message: 'Ponte da loja não configurada' });
    return;
  }

  const recebido = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
  const esperadoBuffer = Buffer.from(expected);
  const recebidoBuffer = Buffer.from(recebido);
  const valido = esperadoBuffer.length === recebidoBuffer.length && timingSafeEqual(esperadoBuffer, recebidoBuffer);
  if (!valido) {
    res.status(401).json({ message: 'API key inválida ou ausente' });
    return;
  }
  next();
}

export const lojaLookupRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Limite de consultas da loja excedido. Tente novamente em instantes.' },
});
