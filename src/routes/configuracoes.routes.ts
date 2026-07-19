import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { ConfiguracaoModel } from '../models/configuracao.model.js';
import {
  configurarWebhookEfi,
  consultarWebhookEfi,
  getEfiConfigurationStatus,
} from '../services/efi.service.js';
import { env } from '../config/env.js';
import { IntegrationEventModel } from '../models/integration-event.model.js';

const router = Router();

const uploadCert = multer({
  // Valida o conteúdo antes de substituir um certificado que já funciona.
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024 }, // 1 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ['.p12', '.pfx'].includes(ext));
  },
}).single('certificado');

// Campos que existem no processo por serviço — servem como fonte de verdade de qual env usar
const SERVICOS: Record<string, { label: string; campos: Array<{
  key: string;
  label: string;
  secret?: boolean;
  placeholder?: string;
  type?: 'text' | 'number' | 'select';
  options?: Array<{ value: string; label: string }>;
}> }> = {
  revendas: {
    label: 'Cobrança de Revendas',
    campos: [
      {
        key: 'REVENDAS_FORMA_PAGAMENTO_PADRAO', label: 'Forma de pagamento padrão', type: 'select',
        options: [
          { value: 'Pre-pago', label: 'Pré-pago — consome créditos' },
          { value: 'Pos-pago', label: 'Pós-pago — gera faturamento' },
          { value: 'Por pedido', label: 'Pagamento por pedido' },
        ],
      },
      {
        key: 'REVENDAS_COBRANCA_INTERNACIONAL', label: 'Certificados internacionais', type: 'select',
        options: [
          { value: 'Por emissao', label: 'Cobrar por emissão' },
          { value: 'Por pedido', label: 'Cobrar por pedido' },
          { value: 'Fatura mensal', label: 'Consolidar em fatura mensal' },
        ],
      },
      {
        key: 'REVENDAS_COBRANCA_ICP_BRASIL', label: 'Certificados ICP-Brasil', type: 'select',
        options: [
          { value: 'Por emissao', label: 'Cobrar por emissão' },
          { value: 'Por pedido', label: 'Cobrar por pedido' },
          { value: 'Fatura mensal', label: 'Consolidar em fatura mensal' },
        ],
      },
      { key: 'REVENDAS_DIA_VENCIMENTO', label: 'Dia padrão de vencimento', type: 'number', placeholder: '1 a 28' },
      { key: 'REVENDAS_LIMITE_CREDITO_PADRAO', label: 'Limite de crédito padrão (R$)', type: 'number', placeholder: '0,00' },
    ],
  },
  efi: {
    label: 'Efi Bank (PIX + Boleto)',
    campos: [
      { key: 'EFI_CLIENT_ID',      label: 'Client ID',        placeholder: 'Client_Id_...' },
      { key: 'EFI_CLIENT_SECRET',  label: 'Client Secret',    secret: true, placeholder: 'Client_Secret_...' },
      { key: 'EFI_PIX_KEY',        label: 'Chave PIX',        placeholder: 'CPF, CNPJ, e-mail ou chave aleatória' },
      { key: 'EFI_SANDBOX',        label: 'Modo Sandbox',     placeholder: 'true ou false' },
      { key: 'EFI_CERT_PATH',      label: 'Caminho .p12',     placeholder: './certs/certificado.p12' },
      { key: 'EFI_WEBHOOK_URL',    label: 'URL pública do Webhook', placeholder: 'https://api.seudominio.com/cobrancas/webhook/efi' },
      { key: 'EFI_WEBHOOK_SECRET', label: 'Hash secreto do Webhook', secret: true, placeholder: 'Use uma sequência aleatória longa' },
      { key: 'EFI_WEBHOOK_VALIDATE_MTLS', label: 'Validar mTLS no Webhook', placeholder: 'true ou false' },
    ],
  },
  tiny: {
    label: 'Tiny ERP / Olist',
    campos: [
      { key: 'TINY_TOKEN',          label: 'Token API',        secret: true, placeholder: 'Token gerado em Configurações → API' },
      { key: 'TINY_WEBHOOK_SECRET', label: 'Webhook Secret',   secret: true, placeholder: 'Secret configurado no painel Tiny' },
      { key: 'TINY_TIMEOUT',        label: 'Timeout (ms)',     placeholder: '15000' },
    ],
  },
  olist: {
    label: 'Olist Fretes',
    campos: [
      { key: 'OLIST_PARTNER_ID', label: 'Partner ID',   placeholder: '9700' },
      { key: 'OLIST_TOKEN',      label: 'Token Bearer', secret: true, placeholder: 'Token Bearer fornecido pela Olist' },
      { key: 'OLIST_TIMEOUT',    label: 'Timeout (ms)', placeholder: '15000' },
    ],
  },
  bb: {
    label: 'Banco do Brasil',
    campos: [
      { key: 'BB_CLIENT_ID',      label: 'Client ID',   placeholder: 'Obtido em developers.bb.com.br' },
      { key: 'BB_CLIENT_SECRET',  label: 'Client Secret', secret: true, placeholder: 'Client secret da aplicação BB' },
      { key: 'BB_CONVENIO',       label: 'Convênio',    placeholder: 'Número do convênio corporativo' },
      { key: 'BB_AGENCIA',        label: 'Agência',     placeholder: 'Ex: 1234 (sem dígito)' },
      { key: 'BB_CONTA',          label: 'Conta',       placeholder: 'Ex: 12345 (sem dígito)' },
      { key: 'BB_SANDBOX',        label: 'Sandbox',     placeholder: 'true ou false' },
    ],
  },
  bradesco: {
    label: 'Bradesco',
    campos: [
      { key: 'BRADESCO_CLIENT_ID',     label: 'Client ID',    placeholder: 'Obtido em developers.bradesco.com.br' },
      { key: 'BRADESCO_CLIENT_SECRET', label: 'Client Secret', secret: true, placeholder: 'Client secret Bradesco' },
      { key: 'BRADESCO_CNPJ',          label: 'CNPJ',          placeholder: 'Somente dígitos' },
      { key: 'BRADESCO_AGENCIA',       label: 'Agência',       placeholder: 'Ex: 1234' },
      { key: 'BRADESCO_CONTA',         label: 'Conta',         placeholder: 'Ex: 123456' },
      { key: 'BRADESCO_SANDBOX',       label: 'Sandbox',       placeholder: 'true ou false' },
    ],
  },
  serpro: {
    label: 'Serpro (CPF + CNPJ)',
    campos: [
      { key: 'SERPRO_BASIC_TOKEN', label: 'Token Basic', secret: true, placeholder: 'Base64 client_id:client_secret' },
      { key: 'SERPRO_TIMEOUT', label: 'Timeout (ms)', placeholder: '15000' },
      { key: 'VIACEP_TIMEOUT', label: 'Timeout ViaCEP (ms)', placeholder: '8000' },
    ],
  },
  clm: {
    label: 'Atlas CLM',
    campos: [
      { key: 'CLM_BASE_URL', label: 'URL do CLM', placeholder: 'https://clm.seudominio.com.br' },
      { key: 'CLM_API_TOKEN', label: 'Token interno', secret: true, placeholder: 'Token compartilhado ERP/CLM' },
      { key: 'CLM_HMAC_SECRET', label: 'Segredo HMAC', secret: true, placeholder: 'Segredo forte compartilhado' },
      { key: 'CLM_TIMEOUT', label: 'Timeout (ms)', placeholder: '20000' },
    ],
  },
};

function mascarar(valor: string): string {
  if (valor.length <= 8) return '••••••••';
  return valor.slice(0, 4) + '•'.repeat(Math.min(valor.length - 8, 20)) + valor.slice(-4);
}

function camposToRecord(value: unknown): Record<string, string> {
  if (value instanceof Map) return Object.fromEntries(value.entries());
  if (value && typeof value === 'object') return { ...(value as Record<string, string>) };
  return {};
}

function validarCampo(key: string, value: string): string | null {
  if (key === 'REVENDAS_FORMA_PAGAMENTO_PADRAO' && !['Pre-pago', 'Pos-pago', 'Por pedido'].includes(value)) {
    return 'Forma de pagamento de revenda inválida';
  }
  if (['REVENDAS_COBRANCA_INTERNACIONAL', 'REVENDAS_COBRANCA_ICP_BRASIL'].includes(key) &&
      !['Por emissao', 'Por pedido', 'Fatura mensal'].includes(value)) {
    return 'Modelo de cobrança de certificados inválido';
  }
  if (key === 'REVENDAS_DIA_VENCIMENTO' && (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 28)) {
    return 'O dia de vencimento deve estar entre 1 e 28';
  }
  if (key === 'REVENDAS_LIMITE_CREDITO_PADRAO' && (!/^\d+(\.\d{1,2})?$/.test(value) || Number(value) < 0)) {
    return 'O limite de crédito deve ser um valor positivo com até duas casas decimais';
  }
  if (['EFI_SANDBOX', 'EFI_WEBHOOK_VALIDATE_MTLS'].includes(key) && !['true', 'false'].includes(value)) {
    return `${key} deve ser true ou false`;
  }
  if (key === 'EFI_CERT_PATH' && !/\.(p12|pfx)$/i.test(value)) {
    return 'EFI_CERT_PATH deve apontar para um arquivo .p12 ou .pfx';
  }
  if (key === 'EFI_WEBHOOK_URL') {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) return 'EFI_WEBHOOK_URL deve ser uma URL HTTP(S)';
    } catch {
      return 'EFI_WEBHOOK_URL inválida';
    }
  }
  if (key === 'CLM_BASE_URL') {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) return 'CLM_BASE_URL deve ser uma URL HTTP(S)';
    } catch { return 'CLM_BASE_URL inválida'; }
  }
  if (['SERPRO_TIMEOUT', 'VIACEP_TIMEOUT', 'CLM_TIMEOUT'].includes(key) && (!/^\d+$/.test(value) || Number(value) < 1000)) {
    return `${key} deve ser um tempo em milissegundos maior ou igual a 1000`;
  }
  return null;
}

// ─── POST /configuracoes/efi/certificado ─────────────────────────────────────
// Upload do certificado .p12 da Efi Bank via painel de Configurações
router.post('/efi/certificado', authenticate, authorize('admin'), (req, res, next) => {
  uploadCert(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ message: `Erro no upload: ${err.message}` });
      }
      return res.status(400).json({ message: 'Somente arquivos .p12 ou .pfx são aceitos' });
    }
    if (!req.file) return res.status(400).json({ message: 'Nenhum arquivo enviado' });

    // PKCS#12/PFX é codificado em DER e começa por uma sequência ASN.1 (0x30).
    if (req.file.buffer.length < 100 || req.file.buffer[0] !== 0x30) {
      return res.status(400).json({ message: 'O arquivo enviado não parece ser um certificado PKCS#12 válido' });
    }

    void (async () => {
      const destino = path.resolve(env.EFI_CERT_PATH);
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, req.file!.buffer, { mode: 0o600 });
      process.env.EFI_CERT_PATH = destino;

      const doc = await ConfiguracaoModel.findOne({ servico: 'efi' })
        ?? new ConfiguracaoModel({ servico: 'efi', campos: {} });
      const campos = camposToRecord(doc.campos);
      campos.EFI_CERT_PATH = destino;
      doc.campos = campos as unknown as Map<string, string>;
      doc.atualizadoPor = (req as { user?: { id: string } }).user?.id;
      await doc.save();

      res.json({ ok: true, arquivo: path.basename(destino), tamanho: req.file!.size });
    })().catch(next);
  });
});

router.get('/efi/webhook', authenticate, authorize('admin'), async (_req, res, next) => {
  try {
    const result = await consultarWebhookEfi();
    const webhookUrl = typeof result.webhookUrl === 'string'
      ? new URL(result.webhookUrl).origin + new URL(result.webhookUrl).pathname
      : undefined;
    res.json({ configurado: true, webhookUrl, criacao: result.criacao ?? null });
  } catch (error) {
    next(error);
  }
});

router.post('/efi/webhook', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const url = typeof req.body?.url === 'string' && req.body.url.trim()
      ? req.body.url.trim()
      : process.env.EFI_WEBHOOK_URL;
    if (!url) return res.status(400).json({ message: 'Configure EFI_WEBHOOK_URL primeiro' });
    await configurarWebhookEfi(url);
    res.json({ ok: true, message: 'Webhook Pix registrado na Efí' });
  } catch (error) {
    next(error);
  }
});

// ─── GET /configuracoes ───────────────────────────────────────────────────────
// Lista todos os serviços com status configurado/não configurado.
// Valores secret são mascarados. Nunca retorna o valor real.
router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const docs = await ConfiguracaoModel.find().lean();
    const mapaDb = new Map(docs.map(d => [d.servico, d.campos as unknown as Map<string, string>]));

    const result = Object.entries(SERVICOS).map(([id, def]) => {
      const camposDb = camposToRecord(mapaDb.get(id));
      const campos = def.campos.map(c => {
        // Prioridade: BD → process.env
        const valorBruto = camposDb[c.key] ?? process.env[c.key] ?? '';
        return {
          key: c.key,
          label: c.label,
          secret: c.secret ?? false,
          placeholder: c.placeholder ?? '',
          type: c.type ?? 'text',
          options: c.options ?? [],
          configurado: valorBruto !== '',
          valor: valorBruto ? (c.secret ? mascarar(valorBruto) : valorBruto) : '',
        };
      });
      const configurado = campos.filter(c => c.configurado).length;
      const total = campos.length;
      return { id, label: def.label, campos, configurado, total, status: configurado === total ? 'ok' : configurado > 0 ? 'parcial' : 'vazio' };
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ─── PATCH /configuracoes/:servico ────────────────────────────────────────────
// Atualiza campos de um serviço. Aplica os valores em process.env imediatamente.
// Campos vazios ou omitidos não são alterados.
router.patch('/:servico', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { servico } = req.params;
    const def = SERVICOS[servico as keyof typeof SERVICOS];
    if (!def) {
      return res.status(404).json({ message: `Serviço desconhecido: ${servico}` });
    }

    const updates = req.body as Record<string, string>;
    const chavesPermitidas = new Set(def.campos.map((c: { key: string }) => c.key));

    // Aplica imediatamente em process.env e persiste no MongoDB
    const doc = await ConfiguracaoModel.findOne({ servico }) ?? new ConfiguracaoModel({ servico, campos: {} });
    const campos = camposToRecord(doc.campos);

    for (const [key, value] of Object.entries(updates)) {
      if (!chavesPermitidas.has(key)) continue;
      if (typeof value !== 'string') continue;
      if (value.trim() === '') continue; // ignora vazios

      const validationError = validarCampo(key, value.trim());
      if (validationError) return res.status(400).json({ message: validationError });

      campos[key] = value.trim();
      process.env[key] = value.trim(); // aplica imediatamente sem reiniciar
    }

    doc.campos = campos as unknown as Map<string, string>;
    doc.atualizadoPor = (req as { user?: { id: string } }).user?.id;
    await doc.save();

    res.json({ ok: true, servico, campos: Object.keys(campos) });
  } catch (error) {
    next(error);
  }
});

// ─── GET /configuracoes/:servico/status ───────────────────────────────────────
// Testa conectividade do serviço (sem expor credenciais)
router.get('/:servico/status', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { servico } = req.params;
    switch (servico) {
      case 'efi': {
        return res.json(getEfiConfigurationStatus());
      }
      case 'tiny': {
        const ok = !!(process.env.TINY_TOKEN);
        return res.json({ configurado: ok });
      }
      case 'olist': {
        const ok = !!(process.env.OLIST_PARTNER_ID && process.env.OLIST_TOKEN);
        return res.json({ configurado: ok, parceiro: process.env.OLIST_PARTNER_ID ?? null });
      }
      case 'bb': {
        const ok = !!(process.env.BB_CLIENT_ID && process.env.BB_CLIENT_SECRET);
        return res.json({ configurado: ok, sandbox: process.env.BB_SANDBOX !== 'false' });
      }
      case 'bradesco': {
        const ok = !!(process.env.BRADESCO_CLIENT_ID && process.env.BRADESCO_CLIENT_SECRET);
        return res.json({ configurado: ok, sandbox: process.env.BRADESCO_SANDBOX !== 'false' });
      }
      case 'serpro': {
        return res.json({ configurado: Boolean(process.env.SERPRO_BASIC_TOKEN || process.env.BASECTOKEN_SERPRO), viaCep: true });
      }
      case 'clm': {
        const falhos = await IntegrationEventModel.countDocuments({ status: { $in: ['failed', 'dead_letter'] } });
        const pendentes = await IntegrationEventModel.countDocuments({ status: { $in: ['pending', 'retrying'] } });
        return res.json({
          configurado: Boolean(process.env.CLM_BASE_URL && process.env.CLM_API_TOKEN && process.env.CLM_HMAC_SECRET),
          url: process.env.CLM_BASE_URL ? new URL(process.env.CLM_BASE_URL).origin : null,
          eventosPendentes: pendentes,
          eventosComErro: falhos,
        });
      }
      default:
        return res.status(404).json({ message: `Serviço desconhecido: ${servico}` });
    }
  } catch (error) {
    next(error);
  }
});

export { router as configuracoesRouter };
