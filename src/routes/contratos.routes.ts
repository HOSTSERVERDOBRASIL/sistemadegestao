import { Router } from 'express';
import { ContratoModel } from '../models/contrato.model.js';
import { OrdemFornecimentoModel } from '../models/ordem-fornecimento.model.js';
import { PedidoModel } from '../models/pedido.model.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { broadcast } from '../services/events.service.js';
import { escapeRegex, parseLimit, parsePage } from '../utils/query.js';
import { ContratoFluxoError, contratoEstaVigente, validarNovaOrdem, validarPeriodo, valorTotalComDireito } from '../services/contrato.service.js';
import { registrarAuditoria } from '../services/auditoria.service.js';

const router = Router();

router.get('/', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const { clienteId, ativo, modalidade, busca } = req.query as Record<string, string>;
    const page = parsePage(req.query.page as string);
    const limit = parseLimit(req.query.limit as string);
    const filter: Record<string, unknown> = {};
    if (clienteId) filter.clienteId = clienteId;
    if (ativo !== undefined) filter.ativo = ativo === 'true';
    if (modalidade) filter.modalidade = modalidade;
    if (busca) filter.numero = { $regex: escapeRegex(busca), $options: 'i' };

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      ContratoModel.find(filter).populate('clienteId', 'nome documento').sort({ createdAt: -1 }).skip(skip).limit(limit),
      ContratoModel.countDocuments(filter)
    ]);
    res.json({ data, total, page, limit });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const contrato = await ContratoModel.findById(req.params.id).populate('clienteId', 'nome documento email');
    if (!contrato) return res.status(404).json({ message: 'Contrato não encontrado' });
    res.json(contrato);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const dataInicio = new Date(req.body.dataInicio);
    const dataFim = new Date(req.body.dataFim);
    validarPeriodo(dataInicio, dataFim);
    const valorTotal = Number(req.body.valorTotal);
    if (!Number.isFinite(valorTotal) || valorTotal <= 0) {
      throw new ContratoFluxoError('O valor total do contrato deve ser maior que zero', 400);
    }
    const contrato = await ContratoModel.create({ ...req.body, dataInicio, dataFim, valorTotal });
    res.status(201).json(contrato);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const atual = await ContratoModel.findById(req.params.id);
    if (!atual) return res.status(404).json({ message: 'Contrato não encontrado' });
    const dataInicio = new Date(req.body.dataInicio ?? atual.dataInicio);
    const dataFim = new Date(req.body.dataFim ?? atual.dataFim);
    validarPeriodo(dataInicio, dataFim);
    const valorTotal = Number(req.body.valorTotal ?? atual.valorTotal);
    if (!Number.isFinite(valorTotal) || valorTotal < atual.valorFaturado) {
      throw new ContratoFluxoError('O valor total não pode ser menor que o valor já faturado', 400);
    }
    const contrato = await ContratoModel.findByIdAndUpdate(
      req.params.id,
      { ...req.body, dataInicio, dataFim, valorTotal, valorFaturado: atual.valorFaturado },
      { new: true, runValidators: true },
    );
    if (!contrato) return res.status(404).json({ message: 'Contrato não encontrado' });
    res.json(contrato);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const contrato = await ContratoModel.findByIdAndUpdate(req.params.id, { ativo: false }, { new: true });
    if (!contrato) return res.status(404).json({ message: 'Contrato não encontrado' });
    res.json({ message: 'Contrato encerrado', contrato });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/faturar-total', authenticate, authorize('admin', 'financeiro'), async (req, res, next) => {
  try {
    const contrato = await ContratoModel.findById(req.params.id);
    if (!contrato) return res.status(404).json({ message: 'Contrato não encontrado' });
    if (!contrato.ativo || !contratoEstaVigente(contrato)) {
      throw new ContratoFluxoError('Contrato encerrado ou fora da vigência');
    }
    if (contrato.modalidade !== 'Total') {
      throw new ContratoFluxoError('O faturamento direto só é permitido para contratos de modalidade Total');
    }
    const totalComDireito = valorTotalComDireito(contrato);
    if (contrato.valorFaturado >= totalComDireito) {
      return res.status(409).json({ message: 'Contrato já totalmente faturado' });
    }
    contrato.valorFaturado = totalComDireito;
    await contrato.save();
    broadcast({ type: 'contrato:faturado', payload: { contratoId: contrato._id, numero: contrato.numero } });
    res.json(contrato);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/ordens-fornecimento', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const ordens = await OrdemFornecimentoModel.find({ contratoId: req.params.id }).sort({ createdAt: -1 });
    res.json(ordens);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/resumo-financeiro', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const contrato = await ContratoModel.findById(req.params.id).lean();
    if (!contrato) return res.status(404).json({ message: 'Contrato não encontrado' });
    const consumo = await PedidoModel.aggregate<{ _id: string; total: number }>([
      { $match: { contratoId: contrato._id, saldoStatus: { $ne: 'Estornado' } } },
      { $group: {
        _id: { $cond: [{ $eq: ['$saldoStatus', 'Confirmado'] }, 'confirmado', 'reservado'] },
        total: { $sum: '$valorTotal' },
      } },
    ]);
    const valorAditivos = (contrato.aditivos ?? []).reduce((total, aditivo) => total + aditivo.valor, 0);
    const totalComDireito = contrato.valorTotal + valorAditivos;
    const reservado = consumo.find(item => item._id === 'reservado')?.total ?? 0;
    const confirmado = consumo.find(item => item._id === 'confirmado')?.total ?? 0;
    res.json({
      valorOriginal: contrato.valorTotal,
      valorAditivos,
      valorTotalComDireito: totalComDireito,
      reservado,
      confirmado,
      faturado: contrato.valorFaturado,
      disponivel: Math.max(0, totalComDireito - contrato.valorFaturado - reservado - Math.max(0, confirmado - contrato.valorFaturado)),
    });
  } catch (error) { next(error); }
});

router.post('/:id/aditivos', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const contrato = await ContratoModel.findById(req.params.id);
    if (!contrato) return res.status(404).json({ message: 'Contrato não encontrado' });
    const numero = String(req.body.numero ?? '').trim();
    const motivo = String(req.body.motivo ?? '').trim();
    const valor = Number(req.body.valor);
    const dataAssinatura = new Date(req.body.dataAssinatura);
    const vigenciaAte = req.body.vigenciaAte ? new Date(req.body.vigenciaAte) : undefined;
    if (!numero || !motivo || !Number.isFinite(valor) || valor <= 0 || Number.isNaN(dataAssinatura.getTime())) {
      throw new ContratoFluxoError('Número, motivo, valor positivo e data de assinatura são obrigatórios', 400);
    }
    if (contrato.aditivos.some(aditivo => aditivo.numero.toLowerCase() === numero.toLowerCase())) {
      throw new ContratoFluxoError('Já existe um aditivo com este número', 409);
    }
    if (vigenciaAte && Number.isNaN(vigenciaAte.getTime())) throw new ContratoFluxoError('Vigência do aditivo inválida', 400);
    contrato.aditivos.push({ numero, motivo, valor, dataAssinatura, vigenciaAte });
    if (vigenciaAte && vigenciaAte > contrato.dataFim) contrato.dataFim = vigenciaAte;
    await contrato.save();
    await registrarAuditoria({
      entidade: 'Contrato', entidadeId: contrato._id, acao: 'aditivo_criado', origem: 'Painel',
      detalhes: { numero, valor, vigenciaAte: vigenciaAte?.toISOString() },
    });
    res.status(201).json(contrato);
  } catch (error) { next(error); }
});

router.post('/:id/ordens-fornecimento', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const contratoId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const valor = Number(req.body.valor);
    const dataEmissao = req.body.dataEmissao ? new Date(req.body.dataEmissao) : new Date();
    const dataFim = req.body.dataFim ? new Date(req.body.dataFim) : undefined;
    await validarNovaOrdem(contratoId, valor, dataFim, dataEmissao);
    const ordem = await OrdemFornecimentoModel.create({
      numero: req.body.numero,
      contratoId,
      valor,
      dataEmissao,
      dataFim,
      observacoes: req.body.observacoes,
    });
    res.status(201).json(ordem);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/pedidos', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const pedidos = await PedidoModel.find({ contratoId: req.params.id })
      .populate('clienteId', 'nome documento')
      .populate('produtoId', 'codigo nome')
      .sort({ createdAt: -1 });
    res.json(pedidos);
  } catch (error) {
    next(error);
  }
});

export { router as contratosRouter };
