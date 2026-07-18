import { Router } from 'express';
import { ContratoModel } from '../models/contrato.model.js';
import { OrdemFornecimentoModel } from '../models/ordem-fornecimento.model.js';
import { PedidoModel } from '../models/pedido.model.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { broadcast } from '../services/events.service.js';
import { escapeRegex, parseLimit, parsePage } from '../utils/query.js';

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
    const contrato = await ContratoModel.create(req.body);
    res.status(201).json(contrato);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const contrato = await ContratoModel.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
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
    if (contrato.valorFaturado >= contrato.valorTotal) {
      return res.status(409).json({ message: 'Contrato já totalmente faturado' });
    }
    contrato.valorFaturado = contrato.valorTotal;
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

router.post('/:id/ordens-fornecimento', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const ordem = await OrdemFornecimentoModel.create({ ...req.body, contratoId: req.params.id });
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
