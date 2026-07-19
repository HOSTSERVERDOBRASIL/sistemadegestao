import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { CupomModel } from '../models/cupom.model.js';
import { PedidoModel } from '../models/pedido.model.js';
import { validarCupom, registrarUsoCupom, CupomInvalidoError } from '../services/cupom.service.js';
import type { Types } from 'mongoose';
import { escapeRegex, parseLimit, parsePage } from '../utils/query.js';

const router = Router();

// ─── Listar cupons (admin/financeiro) ─────────────────────────────────────────
router.get('/', authenticate, authorize('admin', 'financeiro', 'operador'), async (req, res, next) => {
  try {
    const { busca, status, tipo } = req.query as Record<string, string>;
    const page = parsePage(req.query.page as string);
    const limit = parseLimit(req.query.limit as string);
    const filter: Record<string, unknown> = {};

    if (busca) filter.codigo = { $regex: escapeRegex(busca.toUpperCase()), $options: 'i' };
    if (tipo) filter.tipo = tipo;
    if (status === 'ativo') filter.ativo = true;
    else if (status === 'inativo') filter.ativo = false;
    else if (status === 'expirado') {
      filter.ativo = true;
      filter.validoAte = { $lt: new Date() };
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      CupomModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      CupomModel.countDocuments(filter),
    ]);

    res.json({ data, total, page, limit });
  } catch (error) { next(error); }
});

// ─── Buscar um cupom ──────────────────────────────────────────────────────────
router.get('/:id', authenticate, authorize('admin', 'financeiro', 'operador'), async (req, res, next) => {
  try {
    const cupom = await CupomModel.findById(req.params.id).lean();
    if (!cupom) return res.status(404).json({ message: 'Cupom não encontrado' });
    res.json(cupom);
  } catch (error) { next(error); }
});

// ─── Criar cupom ──────────────────────────────────────────────────────────────
router.post('/', authenticate, authorize('admin', 'financeiro'), async (req, res, next) => {
  try {
    const body = req.body as {
      codigo: string;
      descricao?: string;
      tipo: 'percentual' | 'fixo';
      valor: number;
      valorMinimoPedido?: number;
      valorMaximoDesconto?: number;
      usosMaximos?: number;
      validoDe?: string;
      validoAte?: string;
      produtoIds?: string[];
      clienteIds?: string[];
      ativo?: boolean;
    };

    if (!body.codigo || !body.tipo || body.valor === undefined) {
      return res.status(400).json({ message: 'Campos obrigatórios: codigo, tipo, valor' });
    }
    if (body.tipo === 'percentual' && (body.valor <= 0 || body.valor > 100)) {
      return res.status(400).json({ message: 'Percentual deve ser entre 0 e 100' });
    }

    const cupom = await CupomModel.create({
      ...body,
      codigo: body.codigo.toUpperCase().trim(),
      validoDe: body.validoDe ? new Date(body.validoDe) : undefined,
      validoAte: body.validoAte ? new Date(body.validoAte) : undefined,
    });

    res.status(201).json(cupom);
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 11000) {
      return res.status(409).json({ message: 'Já existe um cupom com este código' });
    }
    next(error);
  }
});

// ─── Editar cupom ─────────────────────────────────────────────────────────────
router.put('/:id', authenticate, authorize('admin', 'financeiro'), async (req, res, next) => {
  try {
    const src = req.body as Record<string, unknown>;
    const allowed: Record<string, unknown> = {};
    if (src.codigo) allowed.codigo = (src.codigo as string).toUpperCase().trim();
    if (src.descricao !== undefined) allowed.descricao = src.descricao;
    if (src.tipo !== undefined) allowed.tipo = src.tipo;
    if (src.valor !== undefined) allowed.valor = Number(src.valor);
    if (src.valorMinimoPedido !== undefined) allowed.valorMinimoPedido = src.valorMinimoPedido !== null ? Number(src.valorMinimoPedido) : undefined;
    if (src.valorMaximoDesconto !== undefined) allowed.valorMaximoDesconto = src.valorMaximoDesconto !== null ? Number(src.valorMaximoDesconto) : undefined;
    if (src.usosMaximos !== undefined) allowed.usosMaximos = src.usosMaximos !== null ? Number(src.usosMaximos) : undefined;
    if (src.validoDe !== undefined) allowed.validoDe = src.validoDe ? new Date(src.validoDe as string) : undefined;
    if (src.validoAte !== undefined) allowed.validoAte = src.validoAte ? new Date(src.validoAte as string) : undefined;
    if (src.produtoIds !== undefined) allowed.produtoIds = src.produtoIds;
    if (src.clienteIds !== undefined) allowed.clienteIds = src.clienteIds;
    if (src.ativo !== undefined) allowed.ativo = src.ativo;

    const cupom = await CupomModel.findByIdAndUpdate(req.params.id, allowed, { new: true, runValidators: true });
    if (!cupom) return res.status(404).json({ message: 'Cupom não encontrado' });
    res.json(cupom);
  } catch (error) { next(error); }
});

// ─── Ativar/desativar cupom ───────────────────────────────────────────────────
router.patch('/:id/status', authenticate, authorize('admin', 'financeiro'), async (req, res, next) => {
  try {
    const { ativo } = req.body as { ativo: boolean };
    const cupom = await CupomModel.findByIdAndUpdate(req.params.id, { ativo }, { new: true });
    if (!cupom) return res.status(404).json({ message: 'Cupom não encontrado' });
    res.json(cupom);
  } catch (error) { next(error); }
});

// ─── Remover cupom ────────────────────────────────────────────────────────────
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const em_uso = await PedidoModel.countDocuments({ cupomId: req.params.id });
    if (em_uso > 0) {
      return res.status(409).json({ message: `Cupom em uso em ${em_uso} pedido(s) — desative-o em vez de remover` });
    }
    const cupom = await CupomModel.findByIdAndDelete(req.params.id);
    if (!cupom) return res.status(404).json({ message: 'Cupom não encontrado' });
    res.json({ message: 'Cupom removido', cupom });
  } catch (error) { next(error); }
});

// ─── Validar cupom (sem aplicar) — usado no frontend para preview ────────────
router.post('/validar', authenticate, async (req, res, next) => {
  try {
    const { codigo, valorPedido, produtoId, clienteId } = req.body as {
      codigo: string; valorPedido: number; produtoId?: string; clienteId?: string;
    };

    if (!codigo || !valorPedido) {
      return res.status(400).json({ message: 'Informe o código do cupom e o valor do pedido' });
    }

    const resultado = await validarCupom(codigo, valorPedido, {
      produtoId: produtoId as unknown as Types.ObjectId,
      clienteId: clienteId as unknown as Types.ObjectId,
    });

    res.json({
      valido: true,
      cupomId: resultado.cupom._id,
      codigo: resultado.cupom.codigo,
      descricao: resultado.cupom.descricao,
      tipo: resultado.cupom.tipo,
      descontoValor: resultado.descontoValor,
      descontoPercentual: resultado.descontoPercentual,
      valorFinal: resultado.valorFinal,
    });
  } catch (error) {
    if (error instanceof CupomInvalidoError) {
      return res.status(422).json({ valido: false, message: error.message });
    }
    next(error);
  }
});

// ─── Listar pedidos de um cupom ───────────────────────────────────────────────
router.get('/:id/pedidos', authenticate, authorize('admin', 'financeiro'), async (req, res, next) => {
  try {
    const pedidos = await PedidoModel.find({ cupomId: req.params.id })
      .populate('clienteId', 'nome documento')
      .populate('produtoId', 'nome codigo')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json(pedidos);
  } catch (error) { next(error); }
});

export { router as cuponsRouter };
