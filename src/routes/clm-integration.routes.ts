import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { authenticateClmEvent } from '../middleware/clm.middleware.js';
import { IntegrationEventModel } from '../models/integration-event.model.js';
import { enviarPedidoAoClm, processarEventoClm, retentarEventoClm } from '../services/clm-integration.service.js';

const router = Router();

router.post('/eventos', authenticateClmEvent, async (req, res, next) => {
  try { res.json(await processarEventoClm(req.body)); } catch (error) { next(error); }
});

router.post('/pedidos/:id/enviar', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try { res.json(await enviarPedidoAoClm(String(req.params.id))); } catch (error) { next(error); }
});

router.get('/pedidos/:id/eventos', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const eventos = await IntegrationEventModel.find({
      $or: [{ 'payload.erpOrderId': req.params.id }, { 'payload.orderId': req.params.id }, { 'payload.data.orderId': req.params.id }],
    }).select('-payload').sort({ createdAt: -1 }).limit(50).lean();
    res.json(eventos);
  } catch (error) { next(error); }
});

router.get('/resumo', authenticate, authorize('admin'), async (_req, res, next) => {
  try {
    const [porStatus, ultimos] = await Promise.all([
      IntegrationEventModel.aggregate([{ $group: { _id: '$status', total: { $sum: 1 } } }]),
      IntegrationEventModel.find().select('-payload').sort({ createdAt: -1 }).limit(20).lean(),
    ]);
    res.json({ porStatus: Object.fromEntries(porStatus.map(item => [item._id, item.total])), ultimos });
  } catch (error) { next(error); }
});

router.post('/eventos/:eventId/retentar', authenticate, authorize('admin'), async (req, res, next) => {
  try { res.json(await retentarEventoClm(String(req.params.eventId))); } catch (error) { next(error); }
});

export { router as clmIntegrationRouter };
