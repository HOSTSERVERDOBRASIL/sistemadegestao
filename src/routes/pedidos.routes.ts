import { Router } from 'express';
import { PedidoModel, ETAPAS_OPERACIONAIS, EtapaOperacional } from '../models/pedido.model.js';
import { emitirNotaFiscal } from '../services/faturamento.service.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { broadcast } from '../services/events.service.js';
import { validarCupom, registrarUsoCupom, estornarUsoCupom, CupomInvalidoError } from '../services/cupom.service.js';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import type { Types } from 'mongoose';
import { escapeRegex, parseLimit, parsePage } from '../utils/query.js';

const router = Router();

router.get('/', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const { clienteId, produtoId, contratoId, parceiroId, status, etapa, nfEmitida, busca } = req.query as Record<string, string>;
    const page = parsePage(req.query.page as string);
    const limit = parseLimit(req.query.limit as string);

    const filter: Record<string, unknown> = {};
    if (clienteId) filter.clienteId = clienteId;
    if (produtoId) filter.produtoId = produtoId;
    if (contratoId) filter.contratoId = contratoId;
    if (parceiroId) filter.parceiroId = parceiroId;
    if (status) filter.status = status;
    if (etapa) filter.etapaOperacional = etapa;
    if (nfEmitida !== undefined) filter.nfEmitida = nfEmitida === 'true';
    if (busca) filter.numero = { $regex: escapeRegex(busca), $options: 'i' };

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      PedidoModel.find(filter)
        .populate('clienteId', 'nome documento')
        .populate('produtoId', 'codigo nome')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      PedidoModel.countDocuments(filter)
    ]);
    res.json({ data, total, page, limit });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const pedido = await PedidoModel.findById(req.params.id)
      .populate('clienteId', 'nome documento email telefone')
      .populate('produtoId', 'codigo nome preco')
      .populate('contratoId', 'numero modalidade valorTotal valorFaturado')
      .populate('parceiroId', 'nome documento emissorNFPadrao')
      .populate('historicoEtapas.usuarioId', 'nome email');
    if (!pedido) return res.status(404).json({ message: 'Pedido não encontrado' });
    res.json(pedido);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const body = req.body as {
      cupomCodigo?: string;
      valorTotal?: number;
      produtoId?: string;
      clienteId?: string;
      historicoEtapas?: unknown[];
      [key: string]: unknown;
    };

    if (!body.historicoEtapas) {
      body.historicoEtapas = [{ etapa: 'Pedido', data: new Date() }];
    }

    // Aplicar cupom se fornecido
    if (body.cupomCodigo && body.valorTotal) {
      try {
        const aplicacao = await validarCupom(body.cupomCodigo, body.valorTotal, {
          produtoId: body.produtoId as unknown as Types.ObjectId,
          clienteId: body.clienteId as unknown as Types.ObjectId,
        });
        body.cupomId = aplicacao.cupom._id;
        body.cupomCodigo = aplicacao.cupom.codigo;
        body.descontoValor = aplicacao.descontoValor;
        body.descontoPercentual = aplicacao.descontoPercentual;
        body.valorTotal = aplicacao.valorFinal;
        const pedido = await PedidoModel.create(body);
        await registrarUsoCupom(aplicacao.cupom._id as Types.ObjectId);
        return res.status(201).json(pedido);
      } catch (err) {
        if (err instanceof CupomInvalidoError) {
          return res.status(422).json({ message: err.message });
        }
        throw err;
      }
    }

    const pedido = await PedidoModel.create(body);
    res.status(201).json(pedido);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { etapaOperacional, historicoEtapas, ...rest } = req.body;
    const pedido = await PedidoModel.findByIdAndUpdate(req.params.id, rest, { new: true, runValidators: true });
    if (!pedido) return res.status(404).json({ message: 'Pedido não encontrado' });
    res.json(pedido);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/etapa', authenticate, authorize('admin', 'operador', 'financeiro'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { etapa, observacao } = req.body as { etapa: EtapaOperacional; observacao?: string };

    if (!ETAPAS_OPERACIONAIS.includes(etapa)) {
      return res.status(400).json({
        message: `Etapa inválida. Use uma de: ${ETAPAS_OPERACIONAIS.join(', ')}`
      });
    }

    const pedido = await PedidoModel.findById(req.params.id);
    if (!pedido) return res.status(404).json({ message: 'Pedido não encontrado' });

    const indiceAtual = ETAPAS_OPERACIONAIS.indexOf(pedido.etapaOperacional);
    const indiceNovo = ETAPAS_OPERACIONAIS.indexOf(etapa);

    if (indiceNovo <= indiceAtual) {
      return res.status(409).json({ message: 'Não é possível regredir ou repetir a etapa atual' });
    }

    pedido.etapaOperacional = etapa;
    pedido.historicoEtapas.push({
      etapa,
      data: new Date(),
      usuarioId: req.user ? (req.user.id as unknown as import('mongoose').Types.ObjectId) : undefined,
      observacao
    });

    if (etapa === 'Conclusao') pedido.status = 'Concluido';
    else if (indiceNovo > 0) pedido.status = 'Em processo';

    await pedido.save();
    broadcast({ type: 'pedido:etapa', payload: { pedidoId: pedido._id, etapa, numero: pedido.numero } });
    res.json(pedido);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const pedido = await PedidoModel.findByIdAndDelete(req.params.id);
    if (!pedido) return res.status(404).json({ message: 'Pedido não encontrado' });
    if (pedido.cupomId) {
      await estornarUsoCupom(pedido.cupomId as Types.ObjectId);
    }
    res.json({ message: 'Pedido removido', pedido });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/emitir-nf', authenticate, authorize('admin', 'financeiro'), async (req, res, next) => {
  try {
    const pedidoId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const nota = await emitirNotaFiscal(pedidoId);
    broadcast({ type: 'pedido:nf_emitida', payload: { pedidoId, notaId: (nota as { _id: unknown })._id } });
    res.status(201).json(nota);
  } catch (error) {
    next(error);
  }
});

export { router as pedidosRouter };
