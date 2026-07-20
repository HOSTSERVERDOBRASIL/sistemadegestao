import { Router } from 'express';
import { CertificadoICPModel } from '../models/certificado-icp.model.js';
import { ClienteModel } from '../models/cliente.model.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { escapeRegex, parseLimit, parsePage } from '../utils/query.js';

const router = Router();

// GET /certificados-icp — listagem paginada com filtros
router.get('/', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const { clienteId, status, statusRevogacao, cpfCnpj, vencendoEm } = req.query as Record<string, string>;
    const page = parsePage(req.query.page as string | undefined);
    const limit = parseLimit(req.query.limit as string | undefined, 20, 100);
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (clienteId) filter.clienteId = clienteId;
    if (status) filter.status = status;
    if (statusRevogacao) filter.statusRevogacao = statusRevogacao;
    if (cpfCnpj) filter.cpfCnpj = { $regex: escapeRegex(cpfCnpj), $options: 'i' };
    if (vencendoEm) {
      const diasNum = parseInt(vencendoEm, 10);
      const hoje = new Date();
      const limite = new Date();
      limite.setDate(hoje.getDate() + diasNum);
      // fimValidade está como string YYYY-MM-DD ou DD/MM/YYYY
      // Filtra statusRevogacao === 'ativo' por padrão em alertas
      filter['$expr'] = {
        $and: [
          { $lte: [{ $dateFromString: { dateString: '$fimValidade', onError: null } }, limite] },
          { $gte: [{ $dateFromString: { dateString: '$fimValidade', onError: null } }, hoje] },
        ]
      };
      filter.statusRevogacao = 'ativo';
    }

    const [data, total] = await Promise.all([
      CertificadoICPModel.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }).lean(),
      CertificadoICPModel.countDocuments(filter),
    ]);
    res.json({ data, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (e) { next(e); }
});

// GET /certificados-icp/alertas/vencendo
router.get('/alertas/vencendo', authenticate, async (req, res, next) => {
  try {
    const dias = parseInt(String(req.query.dias ?? '30'), 10);
    const hoje = new Date();
    const limite = new Date();
    limite.setDate(hoje.getDate() + dias);
    // busca com agregação para converter string de data
    const certs = await CertificadoICPModel.find({
      statusRevogacao: 'ativo',
      fimValidade: { $exists: true, $ne: null },
    }).lean();
    // Filtra em memória para suportar múltiplos formatos de data
    const vencendo = certs.filter(c => {
      if (!c.fimValidade) return false;
      const d = new Date(c.fimValidade);
      return !isNaN(d.getTime()) && d >= hoje && d <= limite;
    });
    res.json(vencendo);
  } catch (e) { next(e); }
});

// GET /certificados-icp/:id
router.get('/:id', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const cert = await CertificadoICPModel.findById(req.params.id).lean();
    if (!cert) return res.status(404).json({ message: 'Certificado não encontrado' });
    res.json(cert);
  } catch (e) { next(e); }
});

// POST /certificados-icp
router.post('/', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const body = req.body;
    if (!body.clienteId) return res.status(400).json({ message: 'clienteId é obrigatório' });
    const cert = await CertificadoICPModel.create({ ...body, fonteDados: body.fonteDados ?? 'manual' });
    res.status(201).json(cert);
  } catch (e) { next(e); }
});

// PUT /certificados-icp/:id
router.put('/:id', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const cert = await CertificadoICPModel.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!cert) return res.status(404).json({ message: 'Certificado não encontrado' });
    res.json(cert);
  } catch (e) { next(e); }
});

// PATCH /certificados-icp/:id/revogar
router.patch('/:id/revogar', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { motivo, solicitante } = req.body;
    if (!motivo) return res.status(400).json({ message: 'Motivo de revogação é obrigatório' });
    const cert = await CertificadoICPModel.findByIdAndUpdate(
      req.params.id,
      {
        statusRevogacao: 'revogado',
        dataRevogacao: new Date(),
        motivoRevogacao: motivo,
        solicitanteRevogacao: solicitante,
        $push: { historicoEventos: { evento: 'revogacao', data: new Date(), responsavel: solicitante, detalhes: { motivo } } },
      },
      { new: true }
    );
    if (!cert) return res.status(404).json({ message: 'Certificado não encontrado' });
    res.json(cert);
  } catch (e) { next(e); }
});

// DELETE /certificados-icp/:id
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const cert = await CertificadoICPModel.findByIdAndDelete(req.params.id);
    if (!cert) return res.status(404).json({ message: 'Certificado não encontrado' });
    res.json({ message: 'Certificado removido' });
  } catch (e) { next(e); }
});

export { router as certificadosICPRouter };
