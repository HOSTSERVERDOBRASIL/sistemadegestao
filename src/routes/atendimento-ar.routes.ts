import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { AtendimentoARModel, StatusAtendimento } from '../models/atendimento-ar.model.js';
import { nextSeq } from '../models/counter.model.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { parsePage, parseLimit, escapeRegex } from '../utils/query.js';
import { env } from '../config/env.js';

const router = Router();

// ─── Upload ───────────────────────────────────────────────────────────────────

const UPLOAD_DIR = env.UPLOAD_DIR ?? './uploads';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${Date.now()}-${name}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`Tipo de arquivo não permitido: ${ext}`));
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function gerarNumeroAR(): Promise<string> {
  const ano = new Date().getFullYear();
  const seq = await nextSeq('atendimento_ar');
  return `AR-${ano}-${String(seq).padStart(4, '0')}`;
}

function startOfDay(dateStr: string): Date {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(dateStr: string): Date {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d;
}

// ─── GET / — listagem paginada com KPIs ───────────────────────────────────────

router.get('/', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { status, modalidade, data, agente, busca } = req.query as Record<string, string>;
    const page  = parsePage(req.query.page as string);
    const limit = parseLimit(req.query.limit as string, 20, 100);

    const filter: Record<string, unknown> = {};
    if (status)    filter.status    = status;
    if (modalidade) filter.modalidade = modalidade;
    if (agente)    filter.agenteResponsavelNome = new RegExp(escapeRegex(agente), 'i');
    if (data) {
      filter.dataAgendamento = { $gte: startOfDay(data), $lte: endOfDay(data) };
    }
    if (busca) {
      const re = new RegExp(escapeRegex(busca), 'i');
      filter.$or = [
        { 'titular.nomeCompleto': re },
        { numeroAtendimento: re },
      ];
    }

    const hoje = new Date();
    const inicioHoje = new Date(hoje); inicioHoje.setHours(0, 0, 0, 0);
    const fimHoje    = new Date(hoje); fimHoje.setHours(23, 59, 59, 999);
    const inicioMes  = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const fimMes     = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59, 999);

    const [data_list, total, kpiRaw] = await Promise.all([
      AtendimentoARModel.find(filter)
        .sort({ dataAgendamento: -1, horaInicio: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AtendimentoARModel.countDocuments(filter),
      AtendimentoARModel.aggregate([
        {
          $facet: {
            agendadosHoje: [
              { $match: { dataAgendamento: { $gte: inicioHoje, $lte: fimHoje }, status: 'Agendado' } },
              { $count: 'n' },
            ],
            confirmados: [
              { $match: { status: 'Confirmado' } },
              { $count: 'n' },
            ],
            emAtendimento: [
              { $match: { status: 'Em Atendimento' } },
              { $count: 'n' },
            ],
            concluidosMes: [
              { $match: { status: 'Concluído', emitidoEm: { $gte: inicioMes, $lte: fimMes } } },
              { $count: 'n' },
            ],
            faltas: [
              { $match: { status: 'Falta', dataAgendamento: { $gte: inicioMes, $lte: fimMes } } },
              { $count: 'n' },
            ],
          },
        },
      ]),
    ]);

    const k = kpiRaw[0] ?? {};
    const kpis = {
      agendadosHoje:  k.agendadosHoje?.[0]?.n  ?? 0,
      confirmados:    k.confirmados?.[0]?.n     ?? 0,
      emAtendimento:  k.emAtendimento?.[0]?.n   ?? 0,
      concluidosMes:  k.concluidosMes?.[0]?.n   ?? 0,
      faltas:         k.faltas?.[0]?.n          ?? 0,
    };

    res.json({ data: data_list, total, page, limit, pages: Math.ceil(total / limit), kpis });
  } catch (e) { next(e); }
});

// ─── GET /agenda/:data — atendimentos do dia ordenados por hora ───────────────

router.get('/agenda/:data', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const data = req.params.data as string;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return res.status(400).json({ message: 'Data inválida. Use YYYY-MM-DD.' });
    }
    const atendimentos = await AtendimentoARModel.find({
      dataAgendamento: { $gte: startOfDay(data), $lte: endOfDay(data) },
    }).sort({ horaInicio: 1 }).lean();
    res.json(atendimentos);
  } catch (e) { next(e); }
});

// ─── GET /:id — detalhe ───────────────────────────────────────────────────────

router.get('/:id', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const at = await AtendimentoARModel.findById(req.params.id);
    if (!at) return res.status(404).json({ message: 'Atendimento não encontrado' });
    res.json(at);
  } catch (e) { next(e); }
});

// ─── POST / — criar ───────────────────────────────────────────────────────────

router.post('/', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const {
      pedidoICPId, clienteId,
      titular, tipoCertificado, midiaEmissao,
      modalidade, dataAgendamento, horaInicio, duracao,
      agenteResponsavelNome, unidade, linkVideoconferencia, observacoes,
    } = req.body;

    // Validações obrigatórias
    if (!titular?.nomeCompleto) return res.status(400).json({ message: 'titular.nomeCompleto é obrigatório' });
    if (!titular?.cpf)          return res.status(400).json({ message: 'titular.cpf é obrigatório' });
    if (!tipoCertificado)       return res.status(400).json({ message: 'tipoCertificado é obrigatório' });
    if (!modalidade)            return res.status(400).json({ message: 'modalidade é obrigatória' });
    if (!dataAgendamento)       return res.status(400).json({ message: 'dataAgendamento é obrigatório' });
    if (!horaInicio)            return res.status(400).json({ message: 'horaInicio é obrigatório' });

    const numeroAtendimento = await gerarNumeroAR();

    const at = await AtendimentoARModel.create({
      pedidoICPId:           pedidoICPId ? new mongoose.Types.ObjectId(pedidoICPId) : undefined,
      clienteId:             clienteId   ? new mongoose.Types.ObjectId(clienteId)   : undefined,
      numeroAtendimento,
      titular,
      tipoCertificado,
      midiaEmissao,
      modalidade,
      dataAgendamento:       new Date(dataAgendamento),
      horaInicio,
      duracao:               Number(duracao) || 30,
      agenteResponsavelNome,
      unidade,
      linkVideoconferencia,
      observacoes,
      documentos:            [],
      status:                'Agendado',
    });

    res.status(201).json(at);
  } catch (e) { next(e); }
});

// ─── PUT /:id — atualizar ─────────────────────────────────────────────────────

router.put('/:id', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const {
      titular, dataAgendamento, horaInicio, duracao, modalidade,
      agenteResponsavelNome, unidade, linkVideoconferencia, observacoes, midiaEmissao,
    } = req.body;

    const updateFields: Record<string, unknown> = {};
    if (titular)               updateFields.titular               = titular;
    if (dataAgendamento)       updateFields.dataAgendamento       = new Date(dataAgendamento);
    if (horaInicio)            updateFields.horaInicio            = horaInicio;
    if (duracao !== undefined) updateFields.duracao               = Number(duracao);
    if (modalidade)            updateFields.modalidade            = modalidade;
    if (agenteResponsavelNome !== undefined) updateFields.agenteResponsavelNome = agenteResponsavelNome;
    if (unidade !== undefined) updateFields.unidade               = unidade;
    if (linkVideoconferencia !== undefined) updateFields.linkVideoconferencia = linkVideoconferencia;
    if (observacoes !== undefined) updateFields.observacoes       = observacoes;
    if (midiaEmissao !== undefined) updateFields.midiaEmissao     = midiaEmissao;

    const updated = await AtendimentoARModel.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true },
    );
    if (!updated) return res.status(404).json({ message: 'Atendimento não encontrado' });
    res.json(updated);
  } catch (e) { next(e); }
});

// ─── PATCH /:id/status — mudar status ────────────────────────────────────────

router.patch('/:id/status', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { status, observacoes } = req.body as { status: StatusAtendimento; observacoes?: string };
    if (!status) return res.status(400).json({ message: 'status é obrigatório' });

    const at = await AtendimentoARModel.findById(req.params.id);
    if (!at) return res.status(404).json({ message: 'Atendimento não encontrado' });

    at.status = status;

    if (status === 'Concluído') {
      at.emitidoEm = new Date();
    }
    if (status === 'Falta' && observacoes) {
      at.observacoes = observacoes;
    }
    if (observacoes && status !== 'Falta') {
      at.observacoes = observacoes;
    }

    await at.save();
    res.json(at);
  } catch (e) { next(e); }
});

// ─── POST /:id/documento — upload de documento ────────────────────────────────

router.post(
  '/:id/documento',
  authenticate,
  authorize('admin', 'operador'),
  upload.single('arquivo'),
  async (req, res, next) => {
    try {
      const { tipo, observacao } = req.body as { tipo: string; observacao?: string };
      if (!tipo) return res.status(400).json({ message: 'tipo é obrigatório' });

      const at = await AtendimentoARModel.findById(req.params.id);
      if (!at) return res.status(404).json({ message: 'Atendimento não encontrado' });

      const doc = {
        tipo,
        arquivoUrl:   req.file ? `/uploads/${req.file.filename}` : undefined,
        nomeOriginal: req.file?.originalname,
        verificado:   false,
        observacao,
      };

      at.documentos.push(doc);
      await at.save();
      res.json(at);
    } catch (e) { next(e); }
  },
);

// ─── PATCH /:id/documento/:docId/verificar — verificar documento ─────────────

router.patch('/:id/documento/:docId/verificar', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { verificado } = req.body as { verificado: boolean };

    const at = await AtendimentoARModel.findById(req.params.id);
    if (!at) return res.status(404).json({ message: 'Atendimento não encontrado' });

    const doc = at.documentos.find(d => String(d._id) === req.params.docId);
    if (!doc) return res.status(404).json({ message: 'Documento não encontrado' });

    doc.verificado = verificado !== false;
    await at.save();
    res.json(at);
  } catch (e) { next(e); }
});

// ─── DELETE /:id — só admin, só se Agendado/Cancelado ────────────────────────

router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const at = await AtendimentoARModel.findById(req.params.id);
    if (!at) return res.status(404).json({ message: 'Atendimento não encontrado' });
    if (!['Agendado', 'Cancelado'].includes(at.status)) {
      return res.status(400).json({ message: 'Apenas atendimentos Agendados ou Cancelados podem ser excluídos' });
    }
    await at.deleteOne();
    res.json({ message: 'Excluído' });
  } catch (e) { next(e); }
});

export { router as atendimentoARRouter };
