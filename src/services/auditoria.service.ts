import type { Types } from 'mongoose';
import { AuditoriaModel, type IAuditoria } from '../models/auditoria.model.js';

export async function registrarAuditoria(evento: {
  entidade: IAuditoria['entidade'];
  entidadeId: unknown;
  acao: string;
  usuarioId?: Types.ObjectId;
  origem: IAuditoria['origem'];
  detalhes?: Record<string, unknown>;
}) {
  return AuditoriaModel.create({ ...evento, entidadeId: String(evento.entidadeId) });
}
