import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { UserModel } from '../models/user.model.js';
import { addSseClient, removeSseClient, broadcast, sseClientCount } from '../services/events.service.js';
import { env } from '../config/env.js';

const MAX_SSE_CLIENTS = 500;

const router = Router();

router.get('/', async (req, res) => {
  // SSE não suporta Authorization header customizado — aceita token via query param
  // Mitigação: token de curta duração é o ideal; por ora, validamos assinatura normalmente
  const token = (req.query.token as string) || req.headers.authorization?.replace('Bearer ', '') || '';

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string };
    const user = await UserModel.findById(payload.sub).select('_id ativo');
    if (!user || !user.ativo) { res.status(401).end(); return; }
  } catch {
    res.status(401).end();
    return;
  }

  if (sseClientCount() >= MAX_SSE_CLIENTS) {
    res.status(429).json({ message: 'Limite de conexões SSE atingido' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  addSseClient(res);

  const keepAlive = setInterval(() => {
    try { res.write('event: ping\ndata: {}\n\n'); }
    catch { clearInterval(keepAlive); }
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    removeSseClient(res);
  });
});

export { router as eventsRouter };
export { broadcast };
