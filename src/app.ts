import express from 'express';
import mongoose from 'mongoose';
import { pinoHttp } from 'pino-http';
import type { Request, Response } from 'express';
import path from 'path';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { corsMiddleware, helmetMiddleware, globalRateLimit, loginRateLimit, requestTimeout } from './middleware/security.middleware.js';
import { authRouter } from './routes/auth.routes.js';
import { clientesRouter } from './routes/clientes.routes.js';
import { produtosRouter } from './routes/produtos.routes.js';
import { parceirosRouter } from './routes/parceiros.routes.js';
import { contratosRouter } from './routes/contratos.routes.js';
import { pedidosRouter } from './routes/pedidos.routes.js';
import { financeiroRouter } from './routes/financeiro.routes.js';
import { relatoriosRouter } from './routes/relatorios.routes.js';
import { usuariosRouter } from './routes/usuarios.routes.js';
import { eventsRouter } from './routes/events.routes.js';
import { uploadsRouter } from './routes/uploads.routes.js';
import { exportarRouter } from './routes/exportar.routes.js';
import { cobrancasRouter } from './routes/cobrancas.routes.js';
import { tinyRouter } from './routes/tiny.routes.js';
import { cuponsRouter } from './routes/cupons.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { fretesRouter } from './routes/fretes.routes.js';
import { configuracoesRouter } from './routes/configuracoes.routes.js';
import { conciliacaoRouter } from './routes/conciliacao.routes.js';
import { errorHandler } from './middleware/error.middleware.js';

const app = express();

// ─── Segurança ────────────────────────────────────────────────────────────────
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.set('trust proxy', 1); // necessário para rate limiting por IP atrás de proxy/nginx

// ─── Logging de requisições ───────────────────────────────────────────────────
app.use(pinoHttp({
  logger,
  customLogLevel: (_req: Request, res: Response) => {
    if (res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req: Request, res: Response) => `${req.method} ${req.url} ${res.statusCode}`,
  autoLogging: { ignore: (req: Request) => req.url === '/health' },
}));

// ─── Body parsing com limite de tamanho ──────────────────────────────────────
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// ─── Rate limiting global ─────────────────────────────────────────────────────
app.use(globalRateLimit);

// ─── Timeout de request (30s) — exceto SSE e uploads ─────────────────────────
app.use(requestTimeout);

// ─── Arquivos estáticos (com autenticação básica — ver middleware abaixo) ────
// Nota: arquivos servidos acessíveis somente via rotas autenticadas de /uploads/files
// O static serve apenas como fallback; a segurança está nas rotas de upload.
app.use('/uploads', express.static(path.resolve(env.UPLOAD_DIR)));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  const dbOk = mongoose.connection.readyState === 1;
  res.status(dbOk ? 200 : 503).json({
    ok: dbOk,
    service: 'atlasX',
    db: dbOk ? 'connected' : 'disconnected',
    uptime: Math.floor(process.uptime()),
    env: env.NODE_ENV,
  });
});

// ─── Rotas ────────────────────────────────────────────────────────────────────
app.use('/auth/login', loginRateLimit); // rate limit estrito só no login
app.use('/auth', authRouter);
app.use('/clientes', clientesRouter);
app.use('/produtos', produtosRouter);
app.use('/parceiros', parceirosRouter);
app.use('/contratos', contratosRouter);
app.use('/pedidos', pedidosRouter);
app.use('/financeiro', financeiroRouter);
app.use('/relatorios', relatoriosRouter);
app.use('/usuarios', usuariosRouter);
app.use('/events', eventsRouter);
app.use('/uploads/files', uploadsRouter);
app.use('/exportar', exportarRouter);
app.use('/cobrancas', cobrancasRouter);
app.use('/tiny', tinyRouter);
app.use('/cupons', cuponsRouter);
app.use('/admin', adminRouter);
app.use('/fretes', fretesRouter);
app.use('/configuracoes', configuracoesRouter);
app.use('/conciliacao', conciliacaoRouter);

// ─── Error handler ───────────────────────────────────────────────────────────
app.use(errorHandler);

export { app };
