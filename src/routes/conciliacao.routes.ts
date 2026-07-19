import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { LancamentoBancarioModel } from '../models/lancamento-bancario.model.js';
import { ConciliacaoLoteModel } from '../models/conciliacao-lote.model.js';
import { CobrancaModel } from '../models/cobranca.model.js';
import { PedidoModel } from '../models/pedido.model.js';
import { parseOfx } from '../services/ofx.service.js';
import { bbAdapter } from '../services/bb.service.js';
import { bradescoAdapter } from '../services/bradesco.service.js';
import { env } from '../config/env.js';

const router = Router();
router.use(authenticate, authorize('admin', 'financeiro'));

function toFilter(v: string | undefined) {
  if (!v) return undefined
  const arr = v.split(',').map(s => s.trim()).filter(Boolean)
  return arr.length === 1 ? arr[0] : { $in: arr }
}

// Multer para comprovante manual e arquivo OFX
const uploadDir = path.resolve(env.UPLOAD_DIR);
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename:    (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${Date.now()}-${name}${ext}`);
  },
});
const uploadComprovante = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ['.pdf', '.jpg', '.jpeg', '.png'].includes(ext));
  },
}).single('comprovante');

const uploadOfx = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ['.ofx', '.ofc', '.qfx'].includes(ext));
  },
}).single('arquivo');

// ─── GET /conciliacao/lancamentos ─────────────────────────────────────────────
router.get('/lancamentos', async (req, res, next) => {
  try {
    const {
      banco, status, tipo, dataInicio, dataFim,
      page = '1', limit = '30',
    } = req.query as Record<string, string>;

    const filter: Record<string, unknown> = {};
    const bancoFilter = toFilter(banco)
    if (bancoFilter) filter.banco = bancoFilter;
    const statusFilter = toFilter(status)
    if (statusFilter) filter.status = statusFilter;
    const tipoFilter = toFilter(tipo)
    if (tipoFilter) filter.tipo = tipoFilter;
    if (dataInicio || dataFim) {
      const range: Record<string, Date> = {};
      if (dataInicio) range.$gte = new Date(dataInicio);
      if (dataFim)    range.$lte = new Date(`${dataFim}T23:59:59.999Z`);
      filter.data = range;
    }

    const pageNum  = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, parseInt(limit) || 30);
    const skip     = (pageNum - 1) * limitNum;

    const [data, total] = await Promise.all([
      LancamentoBancarioModel.find(filter)
        .populate('pedidoId', 'numero valorTotal status')
        .populate('cobrancaId', 'tipo valor status txid')
        .sort({ data: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      LancamentoBancarioModel.countDocuments(filter),
    ]);

    res.json({ data, total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) });
  } catch (error) { next(error); }
});

// ─── GET /conciliacao/resumo ──────────────────────────────────────────────────
router.get('/resumo', async (req, res, next) => {
  try {
    const { dataInicio, dataFim } = req.query as Record<string, string>;
    const match: Record<string, unknown> = { tipo: 'credito' };
    if (dataInicio || dataFim) {
      const range: Record<string, Date> = {};
      if (dataInicio) range.$gte = new Date(dataInicio);
      if (dataFim)    range.$lte = new Date(`${dataFim}T23:59:59.999Z`);
      match.data = range;
    }

    const [porStatus, porBanco, totalCreditos, lotes] = await Promise.all([
      LancamentoBancarioModel.aggregate([
        { $match: match },
        { $group: { _id: '$status', count: { $sum: 1 }, valor: { $sum: '$valor' } } },
      ]),
      LancamentoBancarioModel.aggregate([
        { $match: match },
        { $group: { _id: '$banco', count: { $sum: 1 }, valor: { $sum: '$valor' } } },
        { $sort: { valor: -1 } },
      ]),
      LancamentoBancarioModel.aggregate([
        { $match: { ...match, status: 'conciliado' } },
        { $group: { _id: null, soma: { $sum: '$valor' } } },
      ]),
      ConciliacaoLoteModel.find().sort({ createdAt: -1 }).limit(10).lean(),
    ]);

    res.json({
      porStatus: porStatus.reduce((acc, s) => { acc[s._id] = { count: s.count, valor: s.valor }; return acc; }, {} as Record<string, unknown>),
      porBanco,
      totalConciliado: totalCreditos[0]?.soma ?? 0,
      lotes,
    });
  } catch (error) { next(error); }
});

// ─── POST /conciliacao/lancamentos ───────────────────────────────────────────
// Lançamento manual com upload opcional de comprovante
router.post('/lancamentos', (req, res, next) => {
  uploadComprovante(req, res, async (err) => {
    if (err) return next(err);
    try {
      const { banco, tipo, valor, data, descricao, documento, txid, nossoNumero, observacoes } =
        req.body as Record<string, string>;

      if (!banco || !tipo || !valor || !data || !descricao) {
        return res.status(400).json({ message: 'banco, tipo, valor, data e descricao são obrigatórios' });
      }

      const comprovanteUrl = req.file
        ? `/uploads/${req.file.filename}`
        : undefined;

      const lancamento = await LancamentoBancarioModel.create({
        banco, tipo,
        valor:    parseFloat(valor),
        data:     new Date(data),
        descricao, documento, txid, nossoNumero,
        comprovanteUrl,
        observacoes,
        origem: 'manual',
        status: 'pendente',
      });

      res.status(201).json(lancamento);
    } catch (error) { next(error); }
  });
});

// ─── POST /conciliacao/importar-ofx ──────────────────────────────────────────
router.post('/importar-ofx', (req, res, next) => {
  uploadOfx(req, res, async (err) => {
    if (err) return next(err);
    try {
      if (!req.file) return res.status(400).json({ message: 'Arquivo OFX é obrigatório' });

      const { banco } = req.body as { banco?: string };
      const conteudo  = fs.readFileSync(req.file.path, 'latin1');
      const parsed    = parseOfx(conteudo);

      const bancoFinal = banco ?? parsed.banco ?? 'Manual';
      const userId     = (req as { user?: { id: string } }).user?.id;

      // Cria lote
      const lote = await ConciliacaoLoteModel.create({
        banco:         bancoFinal,
        origem:        'ofx',
        arquivoNome:   req.file.originalname,
        arquivoUrl:    `/uploads/${req.file.filename}`,
        periodoInicio: parsed.periodoInicio,
        periodoFim:    parsed.periodoFim,
        totalLancamentos: parsed.transacoes.length,
        importadoPor:  userId,
      });

      // Insere lançamentos — ignora duplicatas por FITID
      let inseridos = 0;
      let duplicatas = 0;
      for (const tx of parsed.transacoes) {
        const existe = await LancamentoBancarioModel.findOne({
          banco: bancoFinal, data: tx.data, valor: tx.valor, descricao: tx.descricao,
        });
        if (existe) { duplicatas++; continue; }
        await LancamentoBancarioModel.create({
          banco: bancoFinal, origem: 'ofx',
          tipo: tx.tipo, valor: tx.valor, data: tx.data,
          descricao: tx.descricao,
          documento: tx.checknum,
          loteId: lote._id, status: 'pendente',
        });
        inseridos++;
      }

      await lote.updateOne({ totalLancamentos: inseridos });
      res.json({ ok: true, loteId: lote._id, inseridos, duplicatas, total: parsed.transacoes.length });
    } catch (error) { next(error); }
  });
});

// ─── POST /conciliacao/importar-bb ───────────────────────────────────────────
router.post('/importar-bb', async (req, res, next) => {
  try {
    if (!bbAdapter.bbConfigurado()) {
      return res.status(503).json({ message: 'Integração BB não configurada. Acesse Configurações → BB.' });
    }
    const { dataInicio, dataFim } = req.body as { dataInicio: string; dataFim: string };
    if (!dataInicio || !dataFim) {
      return res.status(400).json({ message: 'dataInicio e dataFim são obrigatórios (YYYY-MM-DD)' });
    }

    const userId   = (req as { user?: { id: string } }).user?.id;
    const txs      = await bbAdapter.consultarExtratoBB(dataInicio, dataFim);
    const lote     = await ConciliacaoLoteModel.create({
      banco: 'BB', origem: 'api_bb',
      periodoInicio: new Date(dataInicio), periodoFim: new Date(dataFim),
      totalLancamentos: txs.length, importadoPor: userId,
    });

    let inseridos = 0;
    for (const tx of txs) {
      const existe = await LancamentoBancarioModel.findOne({ banco: 'BB', data: tx.data, valor: tx.valor, descricao: tx.descricao });
      if (existe) continue;
      await LancamentoBancarioModel.create({
        banco: 'BB', origem: 'api_bb',
        tipo: tx.tipo, valor: tx.valor, data: tx.data,
        descricao: tx.descricao, documento: tx.documento, txid: tx.txid,
        loteId: lote._id, status: 'pendente',
      });
      inseridos++;
    }

    await lote.updateOne({ totalLancamentos: inseridos });
    res.json({ ok: true, loteId: lote._id, inseridos, total: txs.length });
  } catch (error) { next(error); }
});

// ─── POST /conciliacao/importar-bradesco ─────────────────────────────────────
router.post('/importar-bradesco', async (req, res, next) => {
  try {
    if (!bradescoAdapter.bradescoConfigurado()) {
      return res.status(503).json({ message: 'Integração Bradesco não configurada. Acesse Configurações → Bradesco.' });
    }
    const { dataInicio, dataFim } = req.body as { dataInicio: string; dataFim: string };
    if (!dataInicio || !dataFim) {
      return res.status(400).json({ message: 'dataInicio e dataFim são obrigatórios (YYYY-MM-DD)' });
    }

    const userId = (req as { user?: { id: string } }).user?.id;
    const txs    = await bradescoAdapter.consultarExtratoBradesco(dataInicio, dataFim);
    const lote   = await ConciliacaoLoteModel.create({
      banco: 'Bradesco', origem: 'api_bradesco',
      periodoInicio: new Date(dataInicio), periodoFim: new Date(dataFim),
      totalLancamentos: txs.length, importadoPor: userId,
    });

    let inseridos = 0;
    for (const tx of txs) {
      const existe = await LancamentoBancarioModel.findOne({ banco: 'Bradesco', data: tx.data, valor: tx.valor, descricao: tx.descricao });
      if (existe) continue;
      await LancamentoBancarioModel.create({
        banco: 'Bradesco', origem: 'api_bradesco',
        tipo: tx.tipo, valor: tx.valor, data: tx.data,
        descricao: tx.descricao, documento: tx.documento, txid: tx.txid,
        loteId: lote._id, status: 'pendente',
      });
      inseridos++;
    }

    await lote.updateOne({ totalLancamentos: inseridos });
    res.json({ ok: true, loteId: lote._id, inseridos, total: txs.length });
  } catch (error) { next(error); }
});

// ─── POST /conciliacao/auto ───────────────────────────────────────────────────
// Tenta conciliar automaticamente por txid, valor+data, nossoNumero
router.post('/auto', async (req, res, next) => {
  try {
    const pendentes = await LancamentoBancarioModel.find({ status: 'pendente', tipo: 'credito' });
    let conciliados = 0;

    for (const lanc of pendentes) {
      // 1. Match por txid (PIX)
      if (lanc.txid) {
        const cob = await CobrancaModel.findOne({ txid: lanc.txid });
        if (cob) {
          await lanc.updateOne({ status: 'conciliado', cobrancaId: cob._id, conciliadoEm: new Date() });
          await cob.updateOne({ status: 'CONCLUIDA', pagoEm: lanc.data });
          conciliados++;
          continue;
        }
      }

      // 2. Match por nossoNumero (boleto)
      if (lanc.nossoNumero) {
        const cob = await CobrancaModel.findOne({ nossoNumero: lanc.nossoNumero });
        if (cob) {
          await lanc.updateOne({ status: 'conciliado', cobrancaId: cob._id, conciliadoEm: new Date() });
          await cob.updateOne({ status: 'CONCLUIDA', pagoEm: lanc.data });
          conciliados++;
          continue;
        }
      }

      // 3. Match por valor + data (tolerância ±1 dia)
      const dataMin = new Date(lanc.data); dataMin.setDate(dataMin.getDate() - 1);
      const dataMax = new Date(lanc.data); dataMax.setDate(dataMax.getDate() + 1);
      const cob = await CobrancaModel.findOne({
        valor: lanc.valor,
        status: 'ATIVA',
        vencimento: { $gte: dataMin, $lte: dataMax },
      });
      if (cob) {
        await lanc.updateOne({ status: 'conciliado', cobrancaId: cob._id, conciliadoEm: new Date() });
        await cob.updateOne({ status: 'CONCLUIDA', pagoEm: lanc.data });
        conciliados++;
      }
    }

    res.json({ ok: true, conciliados, total: pendentes.length });
  } catch (error) { next(error); }
});

// ─── PATCH /conciliacao/lancamentos/:id/conciliar ─────────────────────────────
router.patch('/lancamentos/:id/conciliar', (req, res, next) => {
  uploadComprovante(req, res, async (err) => {
    if (err) return next(err);
    try {
    const lanc = await LancamentoBancarioModel.findById(req.params.id);
    if (!lanc) return res.status(404).json({ message: 'Lançamento não encontrado' });
    if (lanc.status === 'conciliado') return res.status(409).json({ message: 'Lançamento já conciliado' });

    const { pedidoId, cobrancaId } = req.body as { pedidoId?: string; cobrancaId?: string };
    if (!pedidoId && !cobrancaId) {
      return res.status(400).json({ message: 'Informe pedidoId ou cobrancaId' });
    }

    const comprovanteUrl = req.file ? `/uploads/${req.file.filename}` : undefined;
    const userId = (req as { user?: { id: string } }).user?.id;
    const update: Record<string, unknown> = {
      status: 'conciliado',
      pedidoId:    pedidoId    ?? undefined,
      cobrancaId:  cobrancaId  ?? undefined,
      conciliadoEm: new Date(),
      conciliadoPor: userId,
    };
    if (comprovanteUrl) update.comprovanteUrl = comprovanteUrl;
    await lanc.updateOne(update);

    // Atualiza cobrança se informada
    if (cobrancaId) {
      await CobrancaModel.findByIdAndUpdate(cobrancaId, { status: 'CONCLUIDA', pagoEm: lanc.data });
    }
    // Marca pedido como comprovante aprovado se for compra direta
    if (pedidoId) {
      const pedido = await PedidoModel.findById(pedidoId);
      if (pedido?.vinculo.tipo === 'CompraDireta') {
        pedido.vinculo.comprovantePagamentoAprovado = true;
        await pedido.save();
      }
    }

    const atualizado = await LancamentoBancarioModel.findById(req.params.id)
      .populate('pedidoId', 'numero valorTotal')
      .populate('cobrancaId', 'tipo valor status');
    res.json(atualizado);
    } catch (error) { next(error); }
  });
});

// ─── PATCH /conciliacao/lancamentos/:id/ignorar ──────────────────────────────
router.patch('/lancamentos/:id/ignorar', async (req, res, next) => {
  try {
    const lanc = await LancamentoBancarioModel.findById(req.params.id);
    if (!lanc) return res.status(404).json({ message: 'Lançamento não encontrado' });
    await lanc.updateOne({ status: 'ignorado', observacoes: req.body.observacoes });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// ─── PATCH /conciliacao/lancamentos/:id/reabrir ──────────────────────────────
router.patch('/lancamentos/:id/reabrir', async (req, res, next) => {
  try {
    const lanc = await LancamentoBancarioModel.findById(req.params.id);
    if (!lanc) return res.status(404).json({ message: 'Lançamento não encontrado' });
    await lanc.updateOne({ status: 'pendente', pedidoId: null, cobrancaId: null, conciliadoEm: null, conciliadoPor: null });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// ─── GET /conciliacao/lotes ───────────────────────────────────────────────────
router.get('/lotes', async (req, res, next) => {
  try {
    const lotes = await ConciliacaoLoteModel.find().sort({ createdAt: -1 }).limit(50).lean();
    res.json(lotes);
  } catch (error) { next(error); }
});

export { router as conciliacaoRouter };
