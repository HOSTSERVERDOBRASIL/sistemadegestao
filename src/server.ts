import 'dotenv/config';
import { env } from './config/env.js';
import { app } from './app.js';
import { connectDatabase } from './config/database.js';
import { loadConfigFromDb } from './config/load-config.js';
import { logger } from './config/logger.js';
import { runStartupChecks } from './config/startup-check.js';

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error({ err, reason: String(reason) }, 'Unhandled promise rejection — encerrando');
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception — encerrando');
  process.exit(1);
});

async function main() {
  // 1. Verifica obrigatórios mínimos (.env) antes de conectar
  const { ok: okPre, errors: errPre } = runStartupChecks();
  if (!okPre) {
    logger.fatal({ errors: errPre }, 'Configuração inválida — encerrando');
    process.exit(1);
  }

  // 2. Conecta ao banco
  await connectDatabase();

  // 3. Carrega credenciais salvas no painel de Configurações para process.env
  //    Isso garante que credenciais inseridas pelo painel sobrevivam ao restart
  await loadConfigFromDb();

  const port = Number(process.env.PORT || env.PORT || 3000);
  const server = app.listen(port, () => {
    logger.info(`AtlasX API rodando na porta ${port} [${env.NODE_ENV}]`);
  });

  // Graceful shutdown
  function shutdown(signal: string) {
    logger.info(`${signal} recebido — encerrando graciosamente`);
    server.close(() => {
      logger.info('Servidor HTTP encerrado');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Falha ao iniciar o servidor');
  process.exit(1);
});
