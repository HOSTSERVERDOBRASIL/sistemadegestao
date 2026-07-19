import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { assinaturaClm, ClmIntegrationError } from '../services/clm-integration.service.js';

export function authenticateClmEvent(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!env.CLM_API_TOKEN || !env.CLM_HMAC_SECRET) throw new ClmIntegrationError('Integração CLM não configurada', 503);
    const authorization = req.header('authorization') ?? '';
    const source = req.header('x-atlas-source');
    if (authorization !== `Bearer ${env.CLM_API_TOKEN}` || source !== 'atlas-clm') throw new ClmIntegrationError('Origem CLM não autorizada', 401);
    const informed = (req.header('x-atlas-signature') ?? '').replace(/^sha256=/i, '');
    const raw = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body));
    const expected = assinaturaClm(raw);
    const left = Buffer.from(informed, 'hex');
    const right = Buffer.from(expected, 'hex');
    if (left.length !== right.length || !timingSafeEqual(left, right)) throw new ClmIntegrationError('Assinatura do evento CLM inválida', 401);
    next();
  } catch (error) { next(error); }
}
