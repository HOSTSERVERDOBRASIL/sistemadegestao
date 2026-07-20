import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { PortalTokenModel, hashToken } from '../models/portal-token.model.js';
import { PortalLogModel } from '../models/portal-log.model.js';
import { PortalSubmissionModel } from '../models/portal-submission.model.js';
import { PedidoModel } from '../models/pedido.model.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// ─── rate limit agressivo nas rotas públicas ─────────────────────────────────
const portalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: async (req, res) => {
    await PortalLogModel.create({ acao: 'rate_limit', sucesso: false, ip: req.ip, userAgent: req.headers['user-agent'] });
    res.status(429).json({ message: 'Muitas tentativas. Aguarde alguns minutos.' });
  },
});

// ─── upload de documentos do portal ─────────────────────────────────────────
const uploadDir = path.join(process.env.UPLOAD_DIR ?? './uploads', 'portal');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const portalUpload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ─── helper: mascarar CPF/CNPJ ───────────────────────────────────────────────
function mascararDoc(doc?: string): string | undefined {
  if (!doc) return undefined;
  const d = doc.replace(/D/g, '');
  if (d.length === 11) return `***.***.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `**.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return '***';
}

function mascararEmail(email?: string): string | undefined {
  if (!email) return undefined;
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  const visible = user.length > 2 ? user.slice(0, 2) : user[0];
  return `${visible}***@${domain}`;
}

// ─── GET /portal/acesso/:token — validar token e retornar dados do pedido ────
router.get('/acesso/:token', portalLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params;
    const ip = req.ip;
    const ua = Array.isArray(req.headers['user-agent']) ? req.headers['user-agent'][0] : req.headers['user-agent'];

    if (!token || token.length < 32) {
      await PortalLogModel.create({ acao: 'token_invalido', sucesso: false, ip, userAgent: ua });
      return res.status(401).json({ message: 'Token inválido' });
    }

    const hash = hashToken(token as string);
    const portalToken = await PortalTokenModel.findOne({ tokenHash: hash });

    if (!portalToken) {
      await PortalLogModel.create({ acao: 'token_invalido', sucesso: false, ip, userAgent: ua, detalhe: 'hash não encontrado' });
      return res.status(401).json({ message: 'Link inválido ou expirado' });
    }

    // Verificar status
    if (portalToken.status === 'revogado') {
      await PortalLogModel.create({ tokenId: portalToken._id, pedidoId: portalToken.pedidoId, pedidoNumero: portalToken.pedidoNumero, acao: 'token_expirado', sucesso: false, ip, userAgent: ua, detalhe: 'revogado' });
      return res.status(401).json({ message: 'Este link foi revogado' });
    }
    if (portalToken.expiresAt < new Date()) {
      await PortalTokenModel.findByIdAndUpdate(portalToken._id, { status: 'expirado' });
      await PortalLogModel.create({ tokenId: portalToken._id, pedidoId: portalToken.pedidoId, pedidoNumero: portalToken.pedidoNumero, acao: 'token_expirado', sucesso: false, ip, userAgent: ua });
      return res.status(401).json({ message: 'Este link expirou' });
    }
    if (portalToken.maxAcessos && portalToken.acessos >= portalToken.maxAcessos) {
      await PortalTokenModel.findByIdAndUpdate(portalToken._id, { status: 'esgotado' });
      return res.status(401).json({ message: 'Este link atingiu o limite de acessos' });
    }

    // Buscar pedido
    const pedido = await PedidoModel.findById(portalToken.pedidoId)
      .select('numero status etapa clienteId itens dataPrazo historico createdAt')
      .lean();

    if (!pedido) {
      return res.status(404).json({ message: 'Pedido não encontrado' });
    }

    // Registrar acesso
    await PortalTokenModel.findByIdAndUpdate(portalToken._id, { $inc: { acessos: 1 } });
    await PortalLogModel.create({
      tokenId: portalToken._id, pedidoId: portalToken.pedidoId,
      pedidoNumero: portalToken.pedidoNumero, acao: 'acesso', sucesso: true, ip, userAgent: ua,
    });

    // Buscar submissions anteriores
    const submissions = await PortalSubmissionModel.find({ tokenId: portalToken._id }).sort({ createdAt: -1 }).lean();

    res.json({
      token: {
        id: portalToken._id,
        escopo: portalToken.escopo,
        expiresAt: portalToken.expiresAt,
        acessos: portalToken.acessos + 1,
      },
      pedido: {
        numero: pedido.numero,
        status: (pedido as any).status,
        etapa: (pedido as any).etapa,
        dataPrazo: (pedido as any).dataPrazo,
        itens: (pedido as any).itens?.map((item: any) => ({
          descricao: item.descricao,
          quantidade: item.quantidade,
        })),
        historico: ((pedido as any).historico ?? []).map((h: any) => ({
          data: h.data,
          etapa: h.etapa,
          descricao: h.descricao,
          tipo: h.tipo,
        })),
        createdAt: (pedido as any).createdAt,
      },
      cliente: {
        nome: portalToken.clienteNome,
        email: mascararEmail(portalToken.clienteEmail),
      },
      submissions: submissions.map(s => ({
        _id: s._id,
        tipo: s.tipo,
        status: s.status,
        createdAt: (s as any).createdAt,
        arquivos: s.arquivos.length,
        observacao: s.observacao,
      })),
    });
  } catch (e) { next(e); }
});

// ─── POST /portal/acesso/:token/documentos — enviar documentos ───────────────
router.post('/acesso/:token/documentos', portalLimiter, portalUpload.array('arquivos', 10), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hash = hashToken(req.params.token as string);
    const portalToken = await PortalTokenModel.findOne({ tokenHash: hash, status: 'ativo' });
    if (!portalToken || portalToken.expiresAt < new Date()) {
      return res.status(401).json({ message: 'Token inválido ou expirado' });
    }
    if (!['envio_documentos', 'formulario_icp', 'completo'].includes(portalToken.escopo)) {
      return res.status(403).json({ message: 'Este link não permite envio de documentos' });
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ message: 'Nenhum arquivo enviado' });
    }

    const submission = await PortalSubmissionModel.create({
      tokenId: portalToken._id,
      pedidoId: portalToken.pedidoId,
      pedidoNumero: portalToken.pedidoNumero,
      clienteId: portalToken.clienteId,
      clienteNome: portalToken.clienteNome,
      tipo: 'documentos',
      status: 'recebido',
      observacao: (req.body.observacao as string) || undefined,
      arquivos: files.map(f => ({
        nomeOriginal: f.originalname,
        nomeArquivo: f.filename,
        tamanho: f.size,
        mimetype: f.mimetype,
      })),
      ip: req.ip,
    });

    await PortalLogModel.create({
      tokenId: portalToken._id, pedidoId: portalToken.pedidoId,
      pedidoNumero: portalToken.pedidoNumero, acao: 'upload_doc',
      sucesso: true, ip: req.ip, detalhe: `${files.length} arquivo(s)`,
    });

    res.status(201).json({ message: 'Documentos recebidos com sucesso', submissionId: submission._id });
  } catch (e) { next(e); }
});

// ─── POST /portal/acesso/:token/aceite — registrar aceite ────────────────────
router.post('/acesso/:token/aceite', portalLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const hash = hashToken(req.params.token as string);
    const portalToken = await PortalTokenModel.findOne({ tokenHash: hash, status: 'ativo' });
    if (!portalToken || portalToken.expiresAt < new Date()) {
      return res.status(401).json({ message: 'Token inválido ou expirado' });
    }
    if (!['aceite', 'completo'].includes(portalToken.escopo)) {
      return res.status(403).json({ message: 'Este link não permite aceite' });
    }

    const submission = await PortalSubmissionModel.create({
      tokenId: portalToken._id,
      pedidoId: portalToken.pedidoId,
      pedidoNumero: portalToken.pedidoNumero,
      clienteId: portalToken.clienteId,
      clienteNome: portalToken.clienteNome,
      tipo: 'aceite',
      status: 'recebido',
      dados: { ip: req.ip, aceiteEm: new Date(), userAgent: req.headers['user-agent'] },
      arquivos: [],
      ip: req.ip,
    });

    await PortalLogModel.create({
      tokenId: portalToken._id, pedidoId: portalToken.pedidoId,
      pedidoNumero: portalToken.pedidoNumero, acao: 'aceite', sucesso: true, ip: req.ip,
    });

    res.status(201).json({ message: 'Aceite registrado com sucesso', submissionId: submission._id });
  } catch (e) { next(e); }
});

export { router as portalRouter };
