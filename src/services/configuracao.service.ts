import { ConfiguracaoModel } from '../models/configuracao.model.js';
import { logger } from '../config/logger.js';

/** Reaplica no processo as configurações persistidas pelo painel administrativo. */
export async function loadStoredConfigurations(): Promise<number> {
  const docs = await ConfiguracaoModel.find().lean();
  let applied = 0;

  for (const doc of docs) {
    const rawFields = doc.campos as unknown;
    const fields = rawFields instanceof Map
      ? Object.fromEntries(rawFields.entries())
      : (rawFields ?? {}) as Record<string, string>;
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value !== 'string' || !value.trim()) continue;
      // Variáveis do ambiente de deploy têm prioridade sobre o banco.
      if (!process.env[key]) process.env[key] = value.trim();
      applied += 1;
    }
  }

  if (applied > 0) logger.info({ fields: applied }, 'Configurações persistidas aplicadas ao processo');
  return applied;
}
