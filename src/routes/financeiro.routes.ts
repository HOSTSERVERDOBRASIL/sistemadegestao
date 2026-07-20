import { Router } from 'express';
import axios from 'axios';
import { NotaFiscalModel } from '../models/nota-fiscal.model.js';
import { PedidoModel } from '../models/pedido.model.js';
import { TinySyncModel } from '../models/tiny-sync.model.js';
import { tinyAdapter } from '../services/tiny.service.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { broadcast } from '../services/events.service.js';

const router = Router();

function toFilter(v: string | undefined) {
  if (!v) return undefined
  const arr = v.split(',').map(s => s.trim()).filter(Boolean)
  return arr.length === 1 ? arr[0] : { $in: arr }
}

router.get('/notas', authenticate, authorize('admin', 'financeiro'), async (req, res, next) => {
  try {
    const { page = '1', limit = '20', status, emissor, pedidoId, tipoFaturamento } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = {};
    const statusFilter = toFilter(status)
    if (statusFilter) filter.status = statusFilter;
    const emissorFilter = toFilter(emissor)
    if (emissorFilter) filter.emissor = emissorFilter;
    const tipoFatFilter = toFilter(tipoFaturamento)
    if (tipoFatFilter) filter.tipoFaturamento = tipoFatFilter;
    if (pedidoId) filter.pedidoId = pedidoId;

    const skip = (Number(page) - 1) * Number(limit);
    const [notas, total] = await Promise.all([
      NotaFiscalModel.find(filter)
        .populate('pedidoId', 'numero clienteId valorTotal')
        .populate('clienteId', 'nome documento')
        .sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      NotaFiscalModel.countDocuments(filter)
    ]);
    res.json({ data: notas, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    next(error);
  }
});

// POST /financeiro/notas/avulsa — NF avulsa sem pedido vinculado
router.post('/notas/avulsa', authenticate, authorize('admin', 'financeiro'), async (req, res, next) => {
  try {
    const {
      numero, valor, emissor, descricao, observacoes, pedidoId,
      tipoFaturamento, clienteId, competencia, dataVencimento,
      codigoServico, aliquotaISS, municipioPrestacao, itensCertificados,
    } = req.body;

    if (!numero || !valor || !emissor) {
      return res.status(400).json({ message: 'Número, valor e emissor são obrigatórios' });
    }
    if (!clienteId) {
      return res.status(400).json({ message: 'Cliente é obrigatório' });
    }
    if (!['XDigital', 'Revendedor'].includes(emissor)) {
      return res.status(400).json({ message: 'Emissor deve ser XDigital ou Revendedor' });
    }
    if (Number(valor) <= 0) {
      return res.status(400).json({ message: 'Valor deve ser maior que zero' });
    }
    if (tipoFaturamento && !['Total', 'Demanda', 'Fechamento'].includes(tipoFaturamento)) {
      return res.status(400).json({ message: 'tipoFaturamento deve ser Total, Demanda ou Fechamento' });
    }

    const existe = await NotaFiscalModel.findOne({ numero });
    if (existe) return res.status(409).json({ message: `Já existe uma nota com o número ${numero}` });

    const nota = await NotaFiscalModel.create({
      numero,
      valor: Number(valor),
      emissor,
      clienteId: clienteId || undefined,
      descricao: descricao || undefined,
      observacoes: observacoes || undefined,
      pedidoId: pedidoId || undefined,
      tipoFaturamento: tipoFaturamento || undefined,
      competencia: competencia || undefined,
      dataVencimento: dataVencimento ? new Date(dataVencimento) : undefined,
      codigoServico: codigoServico || undefined,
      aliquotaISS: aliquotaISS ? Number(aliquotaISS) : undefined,
      municipioPrestacao: municipioPrestacao || undefined,
      itensCertificados: Array.isArray(itensCertificados) ? itensCertificados : undefined,
      tipo: 'Fiscal',
      status: 'Emitida',
    });

    broadcast({ type: 'nota:avulsa_criada', payload: { notaId: nota._id, numero, valor: nota.valor } });
    res.status(201).json(nota);
  } catch (error) {
    next(error);
  }
});

router.get('/notas/:id', authenticate, authorize('admin', 'financeiro'), async (req, res, next) => {
  try {
    const nota = await NotaFiscalModel.findById(req.params.id).populate('pedidoId');
    if (!nota) return res.status(404).json({ message: 'Nota fiscal não encontrada' });
    res.json(nota);
  } catch (error) {
    next(error);
  }
});

// ─── POST /financeiro/notas/:id/retentar ─────────────────────────────────────
// Retenta emissão NF-e no Tiny/SEFAZ para notas com status Pendente ou Erro.
router.post('/notas/:id/retentar', authenticate, authorize('admin', 'financeiro'), async (req, res, next) => {
  try {
    const nota = await NotaFiscalModel.findById(req.params.id);
    if (!nota) return res.status(404).json({ message: 'Nota fiscal não encontrada' });
    if (nota.status === 'Cancelada') return res.status(409).json({ message: 'Nota cancelada não pode ser reemitida' });
    if (nota.situacaoTiny === 'Autorizada') return res.status(409).json({ message: 'NF-e já autorizada no SEFAZ', chaveAcesso: nota.chaveAcesso });

    if (!process.env.TINY_TOKEN) {
      return res.status(503).json({ message: 'TINY_TOKEN não configurado' });
    }

    const sync = await TinySyncModel.findOne({ tipo: 'pedido', localId: nota.pedidoId, status: 'sincronizado' });
    if (!sync?.tinyId) {
      return res.status(422).json({ message: 'Pedido não sincronizado com o Tiny — sincronize primeiro em /tiny/pedidos' });
    }

    const resultado = await tinyAdapter.gerarNotaFiscalTiny({ tinyPedidoId: sync.tinyId });

    if (resultado.situacao === 'Autorizada') {
      await nota.updateOne({
        tinyNfeId: resultado.tinyNfeId,
        chaveAcesso: resultado.chaveAcesso,
        linkAcesso: resultado.linkAcesso,
        situacaoTiny: 'Autorizada',
        status: 'Emitida',
        erroEmissao: undefined,
      });
      return res.json({ ok: true, chaveAcesso: resultado.chaveAcesso, linkAcesso: resultado.linkAcesso });
    }

    await nota.updateOne({
      tinyNfeId: resultado.tinyNfeId || nota.tinyNfeId,
      situacaoTiny: 'Erro',
      erroEmissao: resultado.erroMsg,
      status: 'Pendente',
    });
    return res.status(502).json({ ok: false, erro: resultado.erroMsg });
  } catch (error) {
    next(error);
  }
});

// ─── GET /financeiro/notas/:id/pdf ────────────────────────────────────────────
// Faz proxy do PDF/DANFE diretamente do Tiny para o cliente.
// Redireciona para o linkAcesso salvo ou busca link atualizado no Tiny.
router.get('/notas/:id/pdf', authenticate, authorize('admin', 'financeiro', 'operador'), async (req, res, next) => {
  try {
    const nota = await NotaFiscalModel.findById(req.params.id);
    if (!nota) return res.status(404).json({ message: 'Nota fiscal não encontrada' });
    if (nota.status === 'Cancelada') return res.status(409).json({ message: 'Nota cancelada não possui PDF' });
    if (nota.situacaoTiny !== 'Autorizada') {
      return res.status(422).json({ message: 'NF-e ainda não autorizada no SEFAZ — PDF indisponível', situacao: nota.situacaoTiny });
    }

    // Usa linkAcesso salvo ou busca no Tiny
    let link = nota.linkAcesso;
    if (!link && nota.tinyNfeId) {
      link = await tinyAdapter.obterLinkNFeTiny(nota.tinyNfeId);
      await nota.updateOne({ linkAcesso: link });
    }
    if (!link) return res.status(503).json({ message: 'Link PDF não disponível para esta NF-e' });

    // Proxy: baixa do Tiny e envia ao cliente com headers corretos
    const pdfRes = await axios.get<Buffer>(link, { responseType: 'arraybuffer', timeout: 20000 });
    const contentType = String(pdfRes.headers['content-type'] ?? 'application/pdf');
    const nomeArquivo = `NF-${nota.numero}-${req.params.id}.pdf`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    res.setHeader('Content-Length', String(pdfRes.data.length));
    res.send(Buffer.from(pdfRes.data));
  } catch (error) {
    next(error);
  }
});

// ─── GET /financeiro/notas/:id/xml ────────────────────────────────────────────
// Retorna o XML da NF-e autorizada para conferência ou arquivo contábil.
router.get('/notas/:id/xml', authenticate, authorize('admin', 'financeiro'), async (req, res, next) => {
  try {
    const nota = await NotaFiscalModel.findById(req.params.id);
    if (!nota) return res.status(404).json({ message: 'Nota fiscal não encontrada' });
    if (nota.situacaoTiny !== 'Autorizada') {
      return res.status(422).json({ message: 'NF-e ainda não autorizada no SEFAZ', situacao: nota.situacaoTiny });
    }
    if (!nota.tinyNfeId) return res.status(503).json({ message: 'ID Tiny não disponível para esta NF-e' });

    const xml = await tinyAdapter.obterXmlNFeTiny(nota.tinyNfeId);
    const nomeArquivo = `NF-${nota.numero}-${req.params.id}.xml`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
    res.send(xml);
  } catch (error) {
    next(error);
  }
});

router.patch('/notas/:id/cancelar', authenticate, authorize('admin', 'financeiro'), async (req, res, next) => {
  try {
    const nota = await NotaFiscalModel.findById(req.params.id);
    if (!nota) return res.status(404).json({ message: 'Nota fiscal não encontrada' });
    if (nota.status === 'Cancelada') return res.status(409).json({ message: 'Nota já cancelada' });

    nota.status = 'Cancelada';
    if (req.body.observacoes) nota.observacoes = req.body.observacoes;
    await nota.save();

    await PedidoModel.findByIdAndUpdate(nota.pedidoId, { nfEmitida: false });
    broadcast({ type: 'nota:cancelada', payload: { notaId: nota._id, pedidoId: nota.pedidoId } });
    res.json(nota);
  } catch (error) {
    next(error);
  }
});

router.get('/conciliacao', authenticate, authorize('admin', 'financeiro'), async (req, res, next) => {
  try {
    const { dataInicio, dataFim } = req.query as Record<string, string>;
    const match: Record<string, unknown> = { status: 'Emitida' };
    if (dataInicio || dataFim) {
      const range: Record<string, Date> = {};
      if (dataInicio) range.$gte = new Date(dataInicio);
      if (dataFim) range.$lte = new Date(dataFim + 'T23:59:59.999Z');
      match.createdAt = range;
    }

    const [por_emissor, por_mes] = await Promise.all([
      NotaFiscalModel.aggregate([
        { $match: match },
        { $group: { _id: '$emissor', total: { $sum: '$valor' }, quantidade: { $sum: 1 } } },
        { $sort: { total: -1 } }
      ]),
      NotaFiscalModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: { ano: { $year: '$createdAt' }, mes: { $month: '$createdAt' } },
            total: { $sum: '$valor' },
            quantidade: { $sum: 1 }
          }
        },
        { $sort: { '_id.ano': -1, '_id.mes': -1 } }
      ])
    ]);

    res.json({ por_emissor, por_mes });
  } catch (error) {
    next(error);
  }
});

router.get('/resumo', authenticate, authorize('admin', 'financeiro'), async (req, res, next) => {
  try {
    const { dataInicio, dataFim } = req.query as Record<string, string>;
    const match: Record<string, unknown> = {};
    if (dataInicio || dataFim) {
      const range: Record<string, Date> = {};
      if (dataInicio) range.$gte = new Date(dataInicio);
      if (dataFim) range.$lte = new Date(dataFim + 'T23:59:59.999Z');
      match.createdAt = range;
    }

    const [notas, totalFaturado, pedidosFaturados, pendentes] = await Promise.all([
      NotaFiscalModel.countDocuments({ ...match, status: 'Emitida' }),
      NotaFiscalModel.aggregate([
        { $match: { ...match, status: 'Emitida' } },
        { $group: { _id: null, soma: { $sum: '$valor' } } }
      ]),
      PedidoModel.countDocuments({ ...match, nfEmitida: true }),
      NotaFiscalModel.countDocuments({ ...match, status: 'Pendente' })
    ]);

    res.json({
      notasEmitidas: notas,
      totalFaturado: totalFaturado[0]?.soma ?? 0,
      pedidosFaturados,
      notasPendentes: pendentes
    });
  } catch (error) {
    next(error);
  }
});

export { router as financeiroRouter };
