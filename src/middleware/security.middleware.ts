import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { env } from '../config/env.js';
import type { Request, Response, NextFunction } from 'express';

const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean);

export const corsMiddleware = cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS bloqueado para origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

export const helmetMiddleware = helmet({
  contentSecurityPolicy: env.isProd ? undefined : false,
  crossOriginEmbedderPolicy: false,
});

export const globalRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Muitas requisições — tente novamente em instantes' },
});

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Muitas tentativas de login — tente novamente em 15 minutos' },
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function jsonBodyLimit(_req: Request, _res: Response, next: NextFunction) {
  next();
}

const TIMEOUT_MS = 30_000;
const SKIP_TIMEOUT = /^\/(events|uploads\/files)/;

export function requestTimeout(req: Request, res: Response, next: NextFunction) {
  if (SKIP_TIMEOUT.test(req.path)) return next();

  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(503).json({ message: 'Request timeout — tente novamente' });
    }
  }, TIMEOUT_MS);

  res.on('finish', () => clearTimeout(timer));
  res.on('close', () => clearTimeout(timer));
  next();
}
