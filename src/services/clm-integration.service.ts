import axios from 'axios';
import { createHmac, randomUUID } from 'crypto';
import { env } from '../config/env.js';
import { IntegrationEventModel } from '../models/integration-event.model.js';
import { PedidoModel } from '../models/pedido.model.js';
import { registrarAuditoria } from './auditoria.service.js';

export class ClmIntegrationError extends Error {
  constructor(message: string, public statusCode = 502) {
    super(message);
    this.name = 'ClmIntegrationError';
  }
}

export function assinaturaClm(payload: Buffer | string): string {
  if (!env.CLM_HMAC_SECRET) throw new ClmIntegrationError('CLM_HMAC_SECRET não configurado', 503);
  return createHmac('sha256', env.CLM_HMAC_SECRET).update(payload).digest('hex');
}

function proximaTentativa(retryCount: number): Date | undefined {
  const minutos = [0, 5, 15, 60, 360][retryCount];
  return minutos === undefined ? undefined : new Date(Date.now() + minutos * 60_000);
}

export async function enviarPedidoAoClm(pedidoId: string) {
  if (!env.CLM_BASE_URL || !env.CLM_API_TOKEN || !env.CLM_HMAC_SECRET) {
    throw new ClmIntegrationError('Integração CLM incompleta nas Configurações', 503);
  }
  const pedido = await PedidoModel.findById(pedidoId)
    .populate('clienteId', 'nome documento')
    .populate('contratoId', 'numero');
  if (!pedido) throw new ClmIntegrationError('Pedido não encontrado', 404);
  if (pedido.status === 'Cancelado') throw new ClmIntegrationError('Pedido cancelado não pode ser enviado ao CLM', 409);

  const cliente = pedido.clienteId as unknown as { _id: unknown; nome: string; documento: string };
  const contrato = pedido.contratoId as unknown as { _id?: unknown } | undefined;
  const eventId = randomUUID();
  const payload = {
    eventId,
    eventType: 'ORDER_CREATED',
    occurredAt: new Date().toISOString(),
    source: 'atlas-erp',
    erpOrderId: String(pedido._id),
    erpOrderNumber: pedido.numero,
    erpContractId: contrato?._id ? String(contrato._id) : undefined,
    customer: { customerId: String(cliente._id), name: cliente.nome, document: cliente.documento.replace(/\D/g, '') },
    items: pedido.itens.map(item => ({
      erpItemId: String(item._id), productCode: item.codigo, quantity: item.quantidade,
    })),
  };
  const serialized = JSON.stringify(payload);
  const log = await IntegrationEventModel.create({
    eventId, eventType: 'ORDER_CREATED', source: 'atlas-erp', direction: 'outbound', payload, status: 'pending',
  });
  try {
    const response = await axios.post<{ requestId?: string; status?: string }>(`${env.CLM_BASE_URL}/api/clm/requests`, payload, {
      timeout: env.CLM_TIMEOUT,
      headers: {
        Authorization: `Bearer ${env.CLM_API_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Atlas-Event-Id': eventId,
        'X-Atlas-Signature': assinaturaClm(serialized),
        'X-Atlas-Source': 'atlas-erp',
      },
    });
    log.status = 'sent';
    log.processedAt = new Date();
    await log.save();
    pedido.clm = {
      requestId: response.data.requestId,
      status: response.data.status || 'CREATED',
      enviadoEm: new Date(), atualizadoEm: new Date(),
      quantidadeExecutada: pedido.clm?.quantidadeExecutada ?? 0,
      quantidadeFaturavel: pedido.clm?.quantidadeFaturavel ?? 0,
      ultimoEvento: 'ORDER_CREATED',
    };
    await pedido.save();
    await registrarAuditoria({ entidade: 'Pedido', entidadeId: pedido._id, acao: 'pedido_enviado_clm', origem: 'Sistema', detalhes: { eventId, requestId: response.data.requestId } });
    return { eventId, requestId: response.data.requestId, status: response.data.status || 'CREATED' };
  } catch (error) {
    log.retryCount += 1;
    log.status = log.retryCount >= 5 ? 'dead_letter' : 'failed';
    log.nextRetryAt = proximaTentativa(log.retryCount);
    log.errorMessage = axios.isAxiosError(error) ? `HTTP ${error.response?.status ?? 'indisponível'}` : 'Falha de comunicação';
    await log.save();
    throw new ClmIntegrationError('Não foi possível entregar o pedido ao CLM');
  }
}

export async function retentarEventoClm(eventId: string) {
  if (!env.CLM_BASE_URL || !env.CLM_API_TOKEN || !env.CLM_HMAC_SECRET) {
    throw new ClmIntegrationError('Integração CLM incompleta nas Configurações', 503);
  }
  const log = await IntegrationEventModel.findOne({ eventId, direction: 'outbound' });
  if (!log) throw new ClmIntegrationError('Evento de saída não encontrado', 404);
  if (log.status === 'sent' || log.status === 'processed') return { eventId, status: log.status, idempotente: true };
  const serialized = JSON.stringify(log.payload);
  log.status = 'retrying';
  log.retryCount += 1;
  await log.save();
  try {
    const response = await axios.post(`${env.CLM_BASE_URL}/api/clm/requests`, log.payload, {
      timeout: env.CLM_TIMEOUT,
      headers: {
        Authorization: `Bearer ${env.CLM_API_TOKEN}`, 'Content-Type': 'application/json',
        'X-Atlas-Event-Id': eventId, 'X-Atlas-Signature': assinaturaClm(serialized), 'X-Atlas-Source': 'atlas-erp',
      },
    });
    log.status = 'sent'; log.processedAt = new Date(); log.nextRetryAt = undefined; log.errorMessage = undefined;
    await log.save();
    return { eventId, status: log.status, resposta: response.status };
  } catch (error) {
    log.status = log.retryCount >= 5 ? 'dead_letter' : 'failed';
    log.nextRetryAt = proximaTentativa(log.retryCount);
    log.errorMessage = axios.isAxiosError(error) ? `HTTP ${error.response?.status ?? 'indisponível'}` : 'Falha de comunicação';
    await log.save();
    throw new ClmIntegrationError('Retentativa de entrega ao CLM falhou');
  }
}

type EventoClm = {
  eventId: string;
  eventType: string;
  occurredAt?: string;
  source: string;
  orderId?: string;
  requestId?: string;
  status?: string;
  orderItemId?: string;
  productCode?: string;
  billable?: boolean;
  billableImpact?: string;
  execution?: { quantity?: number; unit?: string };
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

export async function processarEventoClm(eventoOriginal: EventoClm) {
  if (!eventoOriginal.eventId || !eventoOriginal.eventType) throw new ClmIntegrationError('eventId e eventType são obrigatórios', 400);
  const evento = { ...eventoOriginal, ...(eventoOriginal.data ?? {}) } as EventoClm;
  try {
    await IntegrationEventModel.create({
      eventId: evento.eventId, eventType: evento.eventType, source: evento.source || 'atlas-clm',
      direction: 'inbound', payload: eventoOriginal, status: 'pending',
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return { received: true, eventId: evento.eventId, processed: false, duplicate: true };
    throw error;
  }

  const log = await IntegrationEventModel.findOne({ eventId: evento.eventId });
  try {
    const orderId = String(evento.orderId ?? evento.erpOrderId ?? '');
    const pedido = orderId ? await PedidoModel.findById(orderId) : null;
    if (!pedido) throw new ClmIntegrationError('Pedido do evento CLM não encontrado', 404);

    const quantidade = Math.max(1, Number(evento.execution?.quantity ?? 1));
    const faturavel = evento.eventType === 'CERTIFICATE_ISSUED' || evento.eventType === 'CERTIFICATE_RENEWED' ||
      (evento.eventType === 'CERTIFICATE_REISSUED' && evento.billable === true);
    pedido.clm ??= { quantidadeExecutada: 0, quantidadeFaturavel: 0 };
    pedido.clm.status = String(evento.status ?? evento.eventType);
    pedido.clm.atualizadoEm = new Date();
    pedido.clm.ultimoEvento = evento.eventType;

    if (evento.eventType === 'CERTIFICATE_REQUEST_CREATED') {
      pedido.clm.requestId = String(evento.requestId ?? pedido.clm.requestId ?? '');
      pedido.protocolo = pedido.clm.requestId || pedido.protocolo;
      pedido.protocoloConfirmadoEm ??= new Date();
      pedido.saldoStatus = 'Confirmado';
    }
    if (faturavel) {
      pedido.clm.quantidadeExecutada += quantidade;
      pedido.clm.quantidadeFaturavel += quantidade;
      const item = pedido.itens.find(candidate => String(candidate._id) === String(evento.orderItemId ?? '') || candidate.codigo === evento.productCode);
      if (item) item.quantidadeExecutada = Math.min(item.quantidade, (item.quantidadeExecutada ?? 0) + quantidade);
    }
    if (evento.eventType === 'CERTIFICATE_REVOKED' && evento.billableImpact === 'REVERSE_EXECUTION') {
      pedido.clm.quantidadeExecutada = Math.max(0, pedido.clm.quantidadeExecutada - quantidade);
      pedido.clm.quantidadeFaturavel = Math.max(0, pedido.clm.quantidadeFaturavel - quantidade);
    }
    await pedido.save();
    if (log) { log.status = 'processed'; log.processedAt = new Date(); await log.save(); }
    await registrarAuditoria({ entidade: 'Pedido', entidadeId: pedido._id, acao: `clm_${evento.eventType.toLowerCase()}`, origem: 'CLM', detalhes: { eventId: evento.eventId, requestId: evento.requestId } });
    return { received: true, eventId: evento.eventId, processed: true };
  } catch (error) {
    if (log) {
      log.status = 'failed';
      log.retryCount += 1;
      log.nextRetryAt = proximaTentativa(log.retryCount);
      log.errorMessage = error instanceof Error ? error.message.slice(0, 250) : 'Falha de processamento';
      await log.save();
    }
    throw error;
  }
}
