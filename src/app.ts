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
import { notasEmpenhoRouter } from './routes/notas-empenho.routes.js';
import { lojaBridgeRouter } from './routes/loja-bridge.routes.js';
import { auditoriaRouter } from './routes/auditoria.routes.js';
import { clmIntegrationRouter } from './routes/clm-integration.routes.js';
import { certificadosICPRouter } from './routes/certificados-icp.routes.js';
import { pedidosSSLRouter } from './routes/pedidos-ssl.routes.js';
import { estoqueRouter } from './routes/estoque.routes.js';
import { errorHandler } from './middleware/error.middleware.js';
import { verificarCertificadosVencendo } from './services/alertas-vencimento.service.js';

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
app.use(express.json({
  limit: '100kb',
  verify: (req, _res, buffer) => { (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer); },
}));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// ─── Rate limiting global ─────────────────────────────────────────────────────
app.use(globalRateLimit);

// ─── Timeout de request (30s) — exceto SSE e uploads ─────────────────────────
app.use(requestTimeout);

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

// ─── Rotas API (prefixo /api em produção Railway, sem prefixo em dev) ────────
// Em produção: Railway expõe tudo em uma porta. O frontend faz fetch para /api/*
// Em dev: Vite proxy redireciona /api → localhost:3000 removendo o prefixo
const apiPrefix = env.isProd ? '/api' : '';
app.use(`${apiPrefix}/auth/login`, loginRateLimit);
app.use(`${apiPrefix}/auth`, authRouter);
app.use(`${apiPrefix}/clientes`, clientesRouter);
app.use(`${apiPrefix}/produtos`, produtosRouter);
app.use(`${apiPrefix}/parceiros`, parceirosRouter);
app.use(`${apiPrefix}/contratos`, contratosRouter);
app.use(`${apiPrefix}/pedidos`, pedidosRouter);
app.use(`${apiPrefix}/financeiro`, financeiroRouter);
app.use(`${apiPrefix}/relatorios`, relatoriosRouter);
app.use(`${apiPrefix}/usuarios`, usuariosRouter);
app.use(`${apiPrefix}/events`, eventsRouter);
app.use(`${apiPrefix}/uploads/files`, uploadsRouter);
app.use(`${apiPrefix}/exportar`, exportarRouter);
app.use(`${apiPrefix}/cobrancas`, cobrancasRouter);
app.use(`${apiPrefix}/tiny`, tinyRouter);
app.use(`${apiPrefix}/cupons`, cuponsRouter);
app.use(`${apiPrefix}/admin`, adminRouter);
app.use(`${apiPrefix}/fretes`, fretesRouter);
app.use(`${apiPrefix}/configuracoes`, configuracoesRouter);
app.use(`${apiPrefix}/conciliacao`, conciliacaoRouter);
app.use(`${apiPrefix}/notas-empenho`, notasEmpenhoRouter);
app.use(`${apiPrefix}`, lojaBridgeRouter);
app.use(`${apiPrefix}/auditoria`, auditoriaRouter);
app.use(`${apiPrefix}/integracoes/clm`, clmIntegrationRouter);
app.use(`${apiPrefix}/certificados-icp`, certificadosICPRouter);
app.use(`${apiPrefix}/pedidos-ssl`, pedidosSSLRouter);
app.use(`${apiPrefix}/estoque`, estoqueRouter);
// uploads públicos (sem prefixo /api)
app.use('/uploads', express.static(path.resolve(env.UPLOAD_DIR)));

// ─── Frontend estático em produção ───────────────────────────────────────────
if (env.isProd) {
  const frontendDist = path.resolve('frontend/dist');
  app.use(express.static(frontendDist));
  // SPA fallback — todas as rotas não-API devolvem o index.html
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// ─── Error handler ───────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Alertas de vencimento de certificados ICP (a cada 4h) ───────────────────
setInterval(() => verificarCertificadosVencendo().catch(console.error), 4 * 60 * 60 * 1000);
verificarCertificadosVencendo().catch(console.error);

export { app };
