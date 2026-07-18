import { existsSync } from 'fs';
import { env } from './env.js';
import { logger } from './logger.js';

interface CheckResult {
  ok: boolean;
  warnings: string[];
  errors: string[];
}

export function runStartupChecks(): CheckResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // JWT_SECRET — obrigatório sempre (já lança no env.ts, mas checamos aqui para log claro)
  if (!process.env.JWT_SECRET) {
    errors.push('JWT_SECRET não definido');
  } else if (process.env.JWT_SECRET.length < 32) {
    warnings.push('JWT_SECRET curto (< 32 chars) — use um segredo mais longo em produção');
  }

  // Em produção, exigir configurações críticas
  if (env.isProd) {
    if (!env.EFI_CLIENT_ID || !env.EFI_CLIENT_SECRET) {
      warnings.push('EFI_CLIENT_ID / EFI_CLIENT_SECRET não configurados — cobranças Efi Bank desabilitadas');
    }
    if (!env.EFI_PIX_KEY) {
      warnings.push('EFI_PIX_KEY não configurada — PIX desabilitado');
    }
    if (env.EFI_CLIENT_ID && !env.EFI_CERT_BASE64 && !existsSync(env.EFI_CERT_PATH)) {
      warnings.push(`Certificado Efi não encontrado em: ${env.EFI_CERT_PATH} — faça upload via Configurações`);
    }
    if (!env.EFI_WEBHOOK_SECRET) {
      warnings.push('EFI_WEBHOOK_SECRET não definido — webhooks Efi Bank serão rejeitados em produção');
    }
    if (!env.EFI_WEBHOOK_URL) {
      warnings.push('EFI_WEBHOOK_URL não definida — confirmação automática de Pix desabilitada');
    }
    if (!env.TINY_TOKEN) {
      warnings.push('TINY_TOKEN não configurado — integração Tiny ERP desabilitada');
    }
    if (!env.TINY_WEBHOOK_SECRET) {
      warnings.push('TINY_WEBHOOK_SECRET não definido — webhooks Tiny sem autenticação');
    }
    if (env.EFI_SANDBOX) {
      warnings.push('EFI_SANDBOX=true em produção — cobranças serão em ambiente de teste');
    }
    if (env.ALLOWED_ORIGINS.includes('localhost')) {
      warnings.push('ALLOWED_ORIGINS contém localhost — revise antes de expor publicamente');
    }
  }

  const ok = errors.length === 0;

  if (warnings.length > 0) {
    logger.warn({ warnings }, `Startup: ${warnings.length} aviso(s) de configuração`);
  }
  if (errors.length > 0) {
    logger.error({ errors }, `Startup: ${errors.length} erro(s) crítico(s) de configuração`);
  }
  if (ok && warnings.length === 0) {
    logger.info('Startup: todas as verificações de configuração passaram');
  }

  return { ok, warnings, errors };
}
