import type { Response } from 'express';

export type EventType =
  | 'pedido:etapa' | 'pedido:nf_emitida' | 'nota:avulsa_criada' | 'nota:cancelada' | 'contrato:faturado'
  | 'cobranca_criada' | 'cobranca_paga' | 'tiny_sync' | 'etapa_atualizada' | 'ping'
  | 'certificacao:criada' | 'certificacao:etapa_avancada' | 'certificacao:nc_criada' | 'certificacao:status_alterado'
  | 'cert_icp:vencendo';

export interface AppEvent {
  type: EventType;
  payload: Record<string, unknown>;
}

const clients = new Set<Response>();

export function addSseClient(res: Response) { clients.add(res); }
export function removeSseClient(res: Response) { clients.delete(res); }
export function sseClientCount(): number { return clients.size; }

export function broadcast(event: AppEvent) {
  const data = `event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`;
  for (const client of clients) {
    try { client.write(data); }
    catch { clients.delete(client); }
  }
}
