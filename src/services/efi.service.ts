/**
 * Integração com a Efí Pay (ex-Gerencianet).
 *
 * A API Pix exige certificado mTLS em todas as chamadas, inclusive no OAuth.
 * O certificado pode ser informado por caminho (EFI_CERT_PATH) ou, em
 * ambientes de deploy, em base64 (EFI_CERT_BASE64).
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

type EfiSdk = Record<string, (...args: any[]) => Promise<any>>;
type EfiPayConstructor = new (options: Record<string, unknown>) => EfiSdk;
const require = createRequire(import.meta.url);
const EfiPay = require('sdk-node-apis-efi') as EfiPayConstructor;

export class EfiIntegrationError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'EfiIntegrationError';
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new EfiIntegrationError(`${name} não configurado`);
  return value;
}

function certificateOptions(requiredForPix: boolean): {
  certificate?: string;
  cert_base64?: boolean;
} {
  const base64 = process.env.EFI_CERT_BASE64?.replace(/\s/g, '');
  if (base64) {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      throw new EfiIntegrationError('EFI_CERT_BASE64 não contém um certificado base64 válido');
    }
    return { certificate: base64, cert_base64: true };
  }

  const configuredPath = process.env.EFI_CERT_PATH?.trim();
  if (!configuredPath) {
    if (requiredForPix) {
      throw new EfiIntegrationError('EFI_CERT_PATH ou EFI_CERT_BASE64 não configurado. A API Pix exige certificado .p12');
    }
    return {};
  }

  const absolutePath = path.resolve(configuredPath);
  if (!['.p12', '.pfx'].includes(path.extname(absolutePath).toLowerCase())) {
    throw new EfiIntegrationError('O certificado Efí deve estar no formato .p12 ou .pfx');
  }
  if (!fs.existsSync(absolutePath)) {
    throw new EfiIntegrationError(`Certificado Efí não encontrado em: ${absolutePath}`);
  }

  return { certificate: absolutePath, cert_base64: false };
}

function buildClient(options: { requireCertificate?: boolean; validateMtls?: boolean } = {}): EfiSdk {
  return new EfiPay({
    client_id: required('EFI_CLIENT_ID'),
    client_secret: required('EFI_CLIENT_SECRET'),
    sandbox: process.env.EFI_SANDBOX !== 'false',
    cache: true,
    validate_mtls: options.validateMtls ?? process.env.EFI_WEBHOOK_VALIDATE_MTLS === 'true',
    ...certificateOptions(options.requireCertificate ?? false),
  });
}

function providerMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const data = error as Record<string, unknown>;
    const message = data.mensagem ?? data.message ?? data.error_description ?? data.nome;
    if (typeof message === 'string') return message;
  }
  return 'falha não detalhada pelo provedor';
}

async function callEfi<T>(operation: string, callback: () => Promise<T>): Promise<T> {
  try {
    return await callback();
  } catch (error) {
    if (error instanceof EfiIntegrationError) throw error;
    throw new EfiIntegrationError(`Efí: não foi possível ${operation}: ${providerMessage(error)}`, error);
  }
}

function assertAmount(valor: number): void {
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new EfiIntegrationError('O valor da cobrança deve ser maior que zero');
  }
}

function assertDate(vencimento: Date): void {
  if (Number.isNaN(vencimento.getTime())) {
    throw new EfiIntegrationError('Data de vencimento inválida');
  }
}

export interface PixImediatoResult {
  txid: string;
  loc: string;
  qrCode: string;
  qrCodeBase64: string;
  pixCopiaECola: string;
  raw: Record<string, unknown>;
}

export interface PixVencimentoResult extends PixImediatoResult {}

export interface BoletoResult {
  nossoNumero: string;
  boletoUrl: string;
  boletoBarcode: string;
  raw: Record<string, unknown>;
}

export async function criarPixImediato(
  valor: number,
  infoAdicionais: {
    chave?: string;
    solicitacaoPagador?: string;
    expiracaoSegundos?: number;
    devedor?: { cpf?: string; cnpj?: string; nome: string };
  } = {},
): Promise<PixImediatoResult> {
  assertAmount(valor);
  const efi = buildClient({ requireCertificate: true });
  const pixKey = infoAdicionais.chave || required('EFI_PIX_KEY');
  const expiracao = Math.max(60, Math.min(infoAdicionais.expiracaoSegundos ?? 3600, 86400));

  return callEfi('criar a cobrança Pix', async () => {
    const cob = await efi.pixCreateImmediateCharge({}, {
      calendario: { expiracao },
      valor: { original: valor.toFixed(2) },
      chave: pixKey,
      devedor: infoAdicionais.devedor,
      solicitacaoPagador: (infoAdicionais.solicitacaoPagador || 'Pagamento Atlas Ops').slice(0, 140),
    });
    const qrData = await efi.pixGenerateQRCode({ id: cob.loc.id });

    return {
      txid: cob.txid,
      loc: cob.loc.location,
      qrCode: qrData.qrcode,
      qrCodeBase64: qrData.imagemQrcode ?? '',
      pixCopiaECola: qrData.qrcode,
      raw: cob as unknown as Record<string, unknown>,
    };
  });
}

export async function criarPixVencimento(
  valor: number,
  vencimento: Date,
  devedor: { cpf?: string; cnpj?: string; nome: string },
  txid?: string,
): Promise<PixVencimentoResult> {
  assertAmount(valor);
  assertDate(vencimento);
  const efi = buildClient({ requireCertificate: true });
  const pixKey = required('EFI_PIX_KEY');
  const txidFinal = txid || crypto.randomBytes(16).toString('hex');

  const devedorBody: { cpf?: string; cnpj?: string; nome: string } = { nome: devedor.nome.slice(0, 200) };
  if (devedor.cpf) devedorBody.cpf = devedor.cpf.replace(/\D/g, '');
  if (devedor.cnpj) devedorBody.cnpj = devedor.cnpj.replace(/\D/g, '');
  if (!devedorBody.cpf && !devedorBody.cnpj) {
    throw new EfiIntegrationError('CPF ou CNPJ válido é obrigatório para Pix com vencimento');
  }

  return callEfi('criar o Pix com vencimento', async () => {
    const cob = await efi.pixCreateDueCharge({ txid: txidFinal }, {
      calendario: {
        dataDeVencimento: vencimento.toISOString().slice(0, 10),
        validadeAposVencimento: 30,
      },
      devedor: devedorBody,
      valor: { original: valor.toFixed(2) },
      chave: pixKey,
    });
    const qrData = await efi.pixGenerateQRCode({ id: cob.loc.id });

    return {
      txid: cob.txid,
      loc: cob.loc.location,
      qrCode: qrData.qrcode,
      qrCodeBase64: qrData.imagemQrcode ?? '',
      pixCopiaECola: qrData.qrcode,
      raw: cob as unknown as Record<string, unknown>,
    };
  });
}

export async function criarBoleto(
  valor: number,
  vencimento: Date,
  cliente: { nome: string; cpfCnpj: string; email?: string; telefone?: string },
): Promise<BoletoResult> {
  assertAmount(valor);
  assertDate(vencimento);
  const efi = buildClient();
  const cpfCnpj = cliente.cpfCnpj.replace(/\D/g, '');
  if (![11, 14].includes(cpfCnpj.length)) {
    throw new EfiIntegrationError('CPF ou CNPJ válido é obrigatório para boleto');
  }
  if (!cliente.email) throw new EfiIntegrationError('E-mail do cliente é obrigatório para boleto');

  const customer = cpfCnpj.length === 14
    ? {
        email: cliente.email,
        phone_number: cliente.telefone?.replace(/\D/g, ''),
        juridical_person: { corporate_name: cliente.nome, cnpj: cpfCnpj },
      }
    : {
        name: cliente.nome,
        cpf: cpfCnpj,
        email: cliente.email,
        phone_number: cliente.telefone?.replace(/\D/g, ''),
      };

  return callEfi('criar o boleto', async () => {
    const result = await efi.createOneStepCharge({}, {
      items: [{ name: 'Cobrança Atlas Ops', value: Math.round(valor * 100), amount: 1 }],
      payment: {
        banking_billet: {
          customer,
          expire_at: vencimento.toISOString().slice(0, 10),
          message: 'Cobrança Atlas Ops',
        },
      },
    });

    const data = (result.data ?? result) as Record<string, unknown>;
    const payment = data.payment as Record<string, unknown> | undefined;
    const billet = (payment?.banking_billet ?? data.banking_billet ?? data) as Record<string, unknown>;
    const pdf = billet.pdf as Record<string, unknown> | string | undefined;

    return {
      nossoNumero: String(data.charge_id ?? ''),
      boletoUrl: String(billet.link ?? billet.billet_link ?? (typeof pdf === 'string' ? pdf : pdf?.charge) ?? ''),
      boletoBarcode: String(billet.barcode ?? billet.line ?? ''),
      raw: result as unknown as Record<string, unknown>,
    };
  });
}

export async function consultarPix(txid: string): Promise<Record<string, unknown>> {
  const efi = buildClient({ requireCertificate: true });
  return callEfi('consultar o Pix', async () =>
    efi.pixDetailCharge({ txid }) as unknown as Promise<Record<string, unknown>>,
  );
}

export async function cancelarCobrancaEfi(cobranca: {
  tipo: 'pix' | 'pix_vencimento' | 'boleto';
  txid?: string;
  nossoNumero?: string;
}): Promise<void> {
  const efi = buildClient({ requireCertificate: cobranca.tipo !== 'boleto' });

  if (cobranca.tipo === 'pix') {
    if (!cobranca.txid) throw new EfiIntegrationError('Cobrança Pix sem txid');
    await callEfi('remover a cobrança Pix', () =>
      efi.pixUpdateCharge({ txid: cobranca.txid! }, { status: 'REMOVIDA_PELO_USUARIO_RECEBEDOR' }),
    );
    return;
  }

  if (cobranca.tipo === 'boleto') {
    if (!cobranca.nossoNumero) throw new EfiIntegrationError('Boleto sem identificador Efí');
    await callEfi('cancelar o boleto', () => efi.cancelCharge({ id: Number(cobranca.nossoNumero) }));
    return;
  }

  throw new EfiIntegrationError('A API Efí não oferece remoção de Pix com vencimento (cobv) por status');
}

/**
 * Com skip-mTLS, a Efí recomenda um hash na URL. Mantemos compatibilidade com
 * os headers usados em versões anteriores, mas a query `hmac` é a principal.
 */
export function validarWebhookEfi(provided: string | undefined): boolean {
  const expected = process.env.EFI_WEBHOOK_SECRET?.trim();
  if (!expected) return process.env.NODE_ENV !== 'production';
  if (!provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export function buildWebhookUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new EfiIntegrationError('EFI_WEBHOOK_URL inválida');
  }
  if (url.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
    throw new EfiIntegrationError('A URL do webhook Efí deve usar HTTPS em produção');
  }
  const secret = required('EFI_WEBHOOK_SECRET');
  url.searchParams.set('hmac', secret);
  url.searchParams.set('ignorar', '');
  return url.toString();
}

export async function configurarWebhookEfi(rawUrl = required('EFI_WEBHOOK_URL')): Promise<void> {
  const validateMtls = process.env.EFI_WEBHOOK_VALIDATE_MTLS === 'true';
  const efi = buildClient({ requireCertificate: true, validateMtls });
  // O hash continua ativo mesmo com mTLS, como segunda camada de validação.
  const webhookUrl = buildWebhookUrl(rawUrl);
  await callEfi('configurar o webhook Pix', () =>
    efi.pixConfigWebhook({ chave: required('EFI_PIX_KEY') }, { webhookUrl }),
  );
}

export async function consultarWebhookEfi(): Promise<Record<string, unknown>> {
  const efi = buildClient({ requireCertificate: true });
  return callEfi('consultar o webhook Pix', async () => {
    const result = await efi.pixDetailWebhook({ chave: required('EFI_PIX_KEY') });
    return result as unknown as Record<string, unknown>;
  });
}

export function getEfiConfigurationStatus() {
  const certPath = process.env.EFI_CERT_PATH?.trim();
  const certBase64 = process.env.EFI_CERT_BASE64?.trim();
  const certificateFound = Boolean(certBase64 || (certPath && fs.existsSync(path.resolve(certPath))));
  const credentials = Boolean(process.env.EFI_CLIENT_ID && process.env.EFI_CLIENT_SECRET);
  const pixKey = Boolean(process.env.EFI_PIX_KEY);
  const webhookUrl = Boolean(process.env.EFI_WEBHOOK_URL);
  const webhookSecret = Boolean(process.env.EFI_WEBHOOK_SECRET);

  return {
    configurado: credentials && certificateFound,
    pix: credentials && certificateFound && pixKey,
    boleto: credentials,
    certificado: certificateFound,
    webhook: webhookUrl && webhookSecret,
    sandbox: process.env.EFI_SANDBOX !== 'false',
    modo: process.env.EFI_SANDBOX !== 'false' ? 'homologação' : 'produção',
  };
}

// Mutável para substituição controlada nos testes.
export const efiAdapter = {
  criarPixImediato,
  criarPixVencimento,
  criarBoleto,
  consultarPix,
  cancelarCobrancaEfi,
  validarWebhookEfi,
  configurarWebhookEfi,
  consultarWebhookEfi,
};
