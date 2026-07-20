import { Router } from 'express';
import { PortalTokenModel, gerarTokenSeguro, EscopoToken } from '../models/portal-token.model.js';
import { PortalLogModel } from '../models/portal-log.model.js';
import { PortalSubmissionModel } from '../models/portal-submission.model.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { sendMail, templatePortalToken } from '../services/email.service.js';
import { parsePage, parseLimit } from '../utils/query.js';

const router = Router();

function portalUrl(token: string): string {
  const base = process.env.PORTAL_BASE_URL ?? process.env.ALLOWED_ORIGINS?.split(',')[0] ?? 'http://localhost:5173';
  return `${base}/portal/${token}`;
}

// ─── POST /portal-admin/tokens — gerar token para um pedido ─────────────────
router.post('/tokens', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const {
      pedidoId, pedidoNumero, clienteId, clienteNome, clienteEmail,
      escopo, expiracaoHoras, maxAcessos, observacoes, enviarEmail,
    } = req.body;

    if (!pedidoId || !pedidoNumero || !clienteId || !clienteNome || !clienteEmail) {
      return res.status(400).json({ message: 'pedidoId, pedidoNumero, clienteId, clienteNome e clienteEmail são obrigatórios' });
    }

    const usuario = (req as any).user;
    const { plain, hash } = gerarTokenSeguro();

    const horas = Number(expiracaoHoras) || 72;
    const expiresAt = new Date(Date.now() + horas * 60 * 60 * 1000);

    const portalToken = await PortalTokenModel.create({
      tokenHash: hash,
      pedidoId, pedidoNumero, clienteId, clienteNome, clienteEmail,
      escopo: (escopo as EscopoToken) ?? 'acompanhamento',
      expiresAt,
      maxAcessos: maxAcessos ? Number(maxAcessos) : undefined,
      geradoPorId: usuario?.id,
      geradoPorNome: usuario?.nome,
      observacoes,
    });

    const url = portalUrl(plain);

    // Enviar e-mail se solicitado
    let emailResult: { ok: boolean; error?: string } = { ok: false, error: 'não solicitado' };
    if (enviarEmail) {
      const tpl = templatePortalToken({
        clienteNome, pedidoNumero, portalUrl: url,
        expiresAt, escopo: escopo ?? 'acompanhamento',
      });
      emailResult = await sendMail({ to: clienteEmail, ...tpl });
      if (emailResult.ok) {
        await PortalTokenModel.findByIdAndUpdate(portalToken._id, { emailEnviado: true, emailEnviadoEm: new Date() });
      }
    }

    res.status(201).json({
      tokenId: portalToken._id,
      url,                    // plain text — só retornado na criação
      expiresAt,
      escopo: portalToken.escopo,
      email: emailResult,
    });
  } catch (e) { next(e); }
});

// ─── GET /portal-admin/tokens/pedido/:pedidoId — tokens de um pedido ─────────
router.get('/tokens/pedido/:pedidoId', authenticate, async (req, res, next) => {
  try {
    const tokens = await PortalTokenModel.find({ pedidoId: req.params.pedidoId })
      .select('-tokenHash')
      .sort({ createdAt: -1 })
      .lean();
    res.json(tokens);
  } catch (e) { next(e); }
});

// ─── PATCH /portal-admin/tokens/:id/revogar ───────────────────────────────────
router.patch('/tokens/:id/revogar', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const usuario = (req as any).user;
    const { motivo } = req.body;
    const t = await PortalTokenModel.findByIdAndUpdate(req.params.id, {
      status: 'revogado',
      revogadoPorId: usuario?.id,
      revogadoPorNome: usuario?.nome,
      revogadoEm: new Date(),
      motivoRevogacao: motivo || 'Revogado manualmente',
    }, { new: true }).select('-tokenHash');
    if (!t) return res.status(404).json({ message: 'Token não encontrado' });
    res.json(t);
  } catch (e) { next(e); }
});

// ─── POST /portal-admin/tokens/:id/reenviar-email ─────────────────────────────
router.post('/tokens/:id/reenviar-email', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const t = await PortalTokenModel.findById(req.params.id).select('-tokenHash');
    if (!t) return res.status(404).json({ message: 'Token não encontrado' });
    if (t.status !== 'ativo') return res.status(400).json({ message: 'Token não está ativo' });
    if (t.expiresAt < new Date()) return res.status(400).json({ message: 'Token expirado' });

    const novaUrl = req.body.url as string | undefined;
    if (!novaUrl) return res.status(400).json({ message: 'URL do portal é obrigatória para reenvio (o plain token não fica armazenado)' });

    const tpl = templatePortalToken({
      clienteNome: t.clienteNome, pedidoNumero: t.pedidoNumero,
      portalUrl: novaUrl, expiresAt: t.expiresAt, escopo: t.escopo,
    });
    const result = await sendMail({ to: t.clienteEmail, ...tpl });
    if (result.ok) {
      await PortalTokenModel.findByIdAndUpdate(t._id, { emailEnviado: true, emailEnviadoEm: new Date() });
    }
    res.json(result);
  } catch (e) { next(e); }
});

// ─── GET /portal-admin/submissions/pedido/:pedidoId ───────────────────────────
router.get('/submissions/pedido/:pedidoId', authenticate, async (req, res, next) => {
  try {
    const page = parsePage(req.query.page as string);
    const limit = parseLimit(req.query.limit as string, 20, 100);
    const [data, total] = await Promise.all([
      PortalSubmissionModel.find({ pedidoId: req.params.pedidoId })
        .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      PortalSubmissionModel.countDocuments({ pedidoId: req.params.pedidoId }),
    ]);
    res.json({ data, total, page, limit });
  } catch (e) { next(e); }
});

// ─── PATCH /portal-admin/submissions/:id/status ───────────────────────────────
router.patch('/submissions/:id/status', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { status, observacaoInterna } = req.body;
    const usuario = (req as any).user;
    const s = await PortalSubmissionModel.findByIdAndUpdate(req.params.id, {
      status, observacaoInterna,
      revisadoPorId: usuario?.id,
      revisadoPorNome: usuario?.nome,
      revisadoEm: new Date(),
    }, { new: true });
    if (!s) return res.status(404).json({ message: 'Submission não encontrada' });
    res.json(s);
  } catch (e) { next(e); }
});

// ─── GET /portal-admin/logs/pedido/:pedidoId ──────────────────────────────────
router.get('/logs/pedido/:pedidoId', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const logs = await PortalLogModel.find({ pedidoId: req.params.pedidoId })
      .sort({ dataAcao: -1 }).limit(100).lean();
    res.json(logs);
  } catch (e) { next(e); }
});

export { router as portalAdminRouter };
