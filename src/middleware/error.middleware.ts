import { NextFunction, Request, Response } from 'express';
import {
  ContratoJaFaturadoError,
  SaldoInsuficienteError,
  DocumentoObrigatorioError,
} from '../services/faturamento.service.js';
import { CupomInvalidoError } from '../services/cupom.service.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { EfiIntegrationError } from '../services/efi.service.js';

function isSafeMessage(msg: string): boolean {
  // Bloqueia mensagens que expõem internos do MongoDB
  return !msg.includes('collection:') &&
         !msg.includes('dup key') &&
         !msg.includes('$') &&
         msg.length < 300;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  // Erros de negócio conhecidos — mensagem segura para o cliente
  if (err instanceof SaldoInsuficienteError)     return res.status(409).json({ message: err.message });
  if (err instanceof ContratoJaFaturadoError)    return res.status(409).json({ message: err.message });
  if (err instanceof DocumentoObrigatorioError)  return res.status(422).json({ message: err.message });
  if (err instanceof CupomInvalidoError)         return res.status(422).json({ message: err.message });
  if (err instanceof EfiIntegrationError) {
    logger.warn({ err, path: req.path, method: req.method }, 'Falha na integração Efí');
    return res.status(502).json({ message: err.message });
  }

  const errorObj = err as Record<string, unknown>;

  // Erros de validação do Mongoose (ValidationError)
  if (errorObj?.name === 'ValidationError') {
    const details = Object.values(
      (errorObj.errors as Record<string, { message: string }>) ?? {}
    ).map(e => e.message);
    return res.status(400).json({ message: 'Erro de validação', details });
  }

  // CastError — ID inválido
  if (errorObj?.name === 'CastError') {
    return res.status(400).json({ message: 'ID inválido' });
  }

  // Duplicate key
  if (errorObj?.code === 11000) {
    const keyPattern = Object.keys((errorObj.keyPattern as object) ?? {}).join(', ');
    return res.status(409).json({ message: `Valor já cadastrado: ${keyPattern}` });
  }

  // CORS block
  if (err instanceof Error && err.message.startsWith('CORS bloqueado')) {
    return res.status(403).json({ message: err.message });
  }

  // Erro genérico — expõe mensagem só se for segura
  if (err instanceof Error) {
    logger.error({ err, path: req.path, method: req.method }, 'Erro não tratado');
    const safeMsg = isSafeMessage(err.message) ? err.message : 'Erro interno';
    const body: Record<string, unknown> = { message: safeMsg };
    if (env.isDev) body.stack = err.stack;
    return res.status(500).json(body);
  }

  logger.error({ err, path: req.path }, 'Erro desconhecido');
  return res.status(500).json({ message: 'Erro inesperado' });
}
