/**
 * Transport pino → MongoDB.
 * Persiste logs warn/error/fatal no banco para consulta via /admin/logs.
 * Registrado em logger.ts somente em produção — em dev apenas pino-pretty.
 */
import { LogModel } from '../models/log.model.js';

const LEVEL_NAMES: Record<number, ILog['level']> = {
  10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal',
};

import type { ILog } from '../models/log.model.js';

// Pino chama write() com cada linha de log serializada como string JSON
export function createMongoTransport() {
  return {
    write(line: string) {
      try {
        const entry = JSON.parse(line) as Record<string, unknown>;
        const levelNum = Number(entry.level ?? 0);
        // Só persiste warn(40) e acima — info/debug são muito volumosos
        if (levelNum < 40) return;

        const doc: Partial<ILog> = {
          level: LEVEL_NAMES[levelNum] ?? 'info',
          levelNum,
          message: String(entry.msg ?? entry.message ?? ''),
          service: String(entry.service ?? 'atlasX'),
        };

        if (entry.err && typeof entry.err === 'object') {
          const e = entry.err as Record<string, unknown>;
          doc.err = {
            message: String(e.message ?? ''),
            stack:   e.stack ? String(e.stack) : undefined,
            type:    e.type  ? String(e.type)  : undefined,
          };
        }

        if (entry.req && typeof entry.req === 'object') {
          const r = entry.req as Record<string, unknown>;
          doc.req = {
            method:        String(r.method ?? ''),
            url:           String(r.url ?? ''),
            remoteAddress: r.remoteAddress ? String(r.remoteAddress) : undefined,
          };
        }

        if (entry.res && typeof entry.res === 'object') {
          const r = entry.res as Record<string, unknown>;
          doc.res = { statusCode: Number(r.statusCode ?? 0) };
        }

        // Campos extras relevantes (exclui os já mapeados + verbose internals)
        const SKIP = new Set(['level', 'time', 'pid', 'hostname', 'service', 'msg', 'message', 'err', 'req', 'res']);
        const extra: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(entry)) {
          if (!SKIP.has(k)) extra[k] = v;
        }
        if (Object.keys(extra).length > 0) doc.extra = extra;

        // Fire-and-forget — não bloqueia o pipeline de log
        LogModel.create(doc).catch(() => { /* silencioso — evita loop de erro */ });
      } catch {
        // JSON inválido ou DB indisponível — ignora
      }
    },
  };
}
