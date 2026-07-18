/**
 * Carrega configurações persistidas no MongoDB de volta para process.env.
 * Chamado no boot, após connectDatabase(), para que credenciais salvas
 * via painel de Configurações sejam aplicadas sem reiniciar o servidor.
 */
import { ConfiguracaoModel } from '../models/configuracao.model.js';
import { logger } from './logger.js';

export async function loadConfigFromDb(): Promise<void> {
  try {
    const docs = await ConfiguracaoModel.find().lean();
    let total = 0;

    for (const doc of docs) {
      const campos = doc.campos as unknown as Record<string, string>;
      for (const [key, value] of Object.entries(campos)) {
        if (typeof value === 'string' && value.trim() !== '') {
          process.env[key] = value.trim();
          total++;
        }
      }
    }

    if (total > 0) {
      logger.info(`loadConfigFromDb: ${total} variável(is) aplicada(s) de ${docs.length} serviço(s)`);
    }
  } catch (err) {
    // Não mata o servidor — .env local é o fallback
    logger.warn({ err }, 'loadConfigFromDb: falha ao carregar configurações do banco (usando .env)');
  }
}
