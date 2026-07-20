import { Router } from 'express';
import { PedidoSSLModel } from '../models/pedido-ssl.model.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { parsePage, parseLimit } from '../utils/query.js';

const router = Router();

// Contador de sequência simples baseado no ano
async function nextNumeroSSL(): Promise<string> {
  const ano = new Date().getFullYear();
  const count = await PedidoSSLModel.countDocuments({
    numero: { $regex: `^SSL-${ano}-` }
  });
  return `SSL-${ano}-${String(count + 1).padStart(4, '0')}`;
}

// GET /pedidos-ssl
router.get('/', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const clienteId = req.query.clienteId as string | undefined;
    const status = req.query.status as string | undefined;
    const tipo = req.query.tipo as string | undefined;
    const dominio = req.query.dominio as string | undefined;
    const page = parsePage(req.query.page as string);
    const limit = parseLimit(req.query.limit as string, 20, 100);
    const filter: Record<string, unknown> = {};
    if (clienteId) filter.clienteId = clienteId;
    if (status) filter.status = status;
    if (tipo) filter.tipo = tipo;
    if (dominio) filter.dominioPrincipal = { $regex: dominio, $options: 'i' };
    const [data, total] = await Promise.all([
      PedidoSSLModel.find(filter)
        .populate('clienteId', 'nome documento')
        .populate('parceiroId', 'nome')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      PedidoSSLModel.countDocuments(filter),
    ]);
    res.json({ data, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (e) { next(e); }
});

// GET /pedidos-ssl/alertas/vencendo
router.get('/alertas/vencendo', authenticate, async (req, res, next) => {
  try {
    const dias = parseInt(String(req.query.dias ?? '30'), 10);
    const hoje = new Date();
    const limite = new Date();
    limite.setDate(hoje.getDate() + dias);
    const certs = await PedidoSSLModel.find({
      status: 'Emitido',
      fimValidade: { $gte: hoje, $lte: limite },
    }).populate('clienteId', 'nome documento').lean();
    res.json(certs);
  } catch (e) { next(e); }
});

// GET /pedidos-ssl/:id
router.get('/:id', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const p = await PedidoSSLModel.findById(req.params.id)
      .populate('clienteId', 'nome documento email')
      .populate('parceiroId', 'nome');
    if (!p) return res.status(404).json({ message: 'Pedido SSL não encontrado' });
    res.json(p);
  } catch (e) { next(e); }
});

// POST /pedidos-ssl
router.post('/', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const numero = await nextNumeroSSL();
    const pedido = await PedidoSSLModel.create({ ...req.body, numero });
    res.status(201).json(pedido);
  } catch (e) { next(e); }
});

// PUT /pedidos-ssl/:id
router.put('/:id', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const p = await PedidoSSLModel.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!p) return res.status(404).json({ message: 'Pedido SSL não encontrado' });
    res.json(p);
  } catch (e) { next(e); }
});

// PATCH /pedidos-ssl/:id/status
router.patch('/:id/status', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { status, evento, responsavel, detalhes } = req.body;
    const update: Record<string, unknown> = { status };
    if (status === 'Emitido' && req.body.fimValidade) {
      update.fimValidade = new Date(req.body.fimValidade);
      update.inicioValidade = new Date();
    }
    const p = await PedidoSSLModel.findByIdAndUpdate(req.params.id, {
      $set: update,
      $push: { historicoEventos: { evento: evento ?? status, data: new Date(), responsavel, detalhes } },
    }, { new: true });
    if (!p) return res.status(404).json({ message: 'Pedido SSL não encontrado' });
    res.json(p);
  } catch (e) { next(e); }
});

// PATCH /pedidos-ssl/:id/dominios — adicionar ou remover SAN
router.patch('/:id/dominios', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { adicionar, remover, dominioPrincipal } = req.body;
    const update: Record<string, unknown> = {};
    if (dominioPrincipal !== undefined) update.dominioPrincipal = dominioPrincipal.trim().toLowerCase();
    if (adicionar) {
      const novo = adicionar.trim().toLowerCase();
      const pedido = await PedidoSSLModel.findById(req.params.id);
      if (!pedido) return res.status(404).json({ message: 'Pedido SSL não encontrado' });
      if ((pedido.dominiosAdicionais ?? []).includes(novo) || pedido.dominioPrincipal === novo) {
        return res.status(409).json({ message: `Domínio "${novo}" já cadastrado` });
      }
      const p = await PedidoSSLModel.findByIdAndUpdate(req.params.id, { $push: { dominiosAdicionais: novo }, ...( Object.keys(update).length ? { $set: update } : {}) }, { new: true });
      return res.json(p);
    }
    if (remover) {
      const alvo = remover.trim().toLowerCase();
      const p = await PedidoSSLModel.findByIdAndUpdate(req.params.id, { $pull: { dominiosAdicionais: alvo }, ...(Object.keys(update).length ? { $set: update } : {}) }, { new: true });
      return res.json(p);
    }
    if (Object.keys(update).length) {
      const p = await PedidoSSLModel.findByIdAndUpdate(req.params.id, { $set: update }, { new: true });
      return res.json(p);
    }
    res.status(400).json({ message: 'Nenhuma operação especificada' });
  } catch (e) { next(e); }
});

// DELETE /pedidos-ssl/:id
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const p = await PedidoSSLModel.findByIdAndDelete(req.params.id);
    if (!p) return res.status(404).json({ message: 'Pedido SSL não encontrado' });
    res.json({ message: 'Pedido SSL removido' });
  } catch (e) { next(e); }
});

export { router as pedidosSSLRouter };
