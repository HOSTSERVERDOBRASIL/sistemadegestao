import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { olistAdapter } from '../services/olist.service.js';
import type { OlistVolume } from '../services/olist.service.js';

const router = Router();

// ─── POST /fretes/cotar ───────────────────────────────────────────────────────
// Cota fretes via Olist para um CEP de destino.
// Body: { cepOrigem, cepDestino, valorDeclarado, volumes[], servicos? }
router.post('/cotar', authenticate, authorize('admin', 'financeiro', 'operador'), async (req, res, next) => {
  try {
    const { cepOrigem, cepDestino, valorDeclarado, volumes, servicos } = req.body as {
      cepOrigem: string;
      cepDestino: string;
      valorDeclarado: number;
      volumes: OlistVolume[];
      servicos?: string[];
    };

    if (!cepOrigem || !cepDestino) {
      return res.status(400).json({ message: 'cepOrigem e cepDestino são obrigatórios' });
    }
    if (!volumes?.length) {
      return res.status(400).json({ message: 'Informe pelo menos um volume' });
    }
    if (!valorDeclarado || valorDeclarado <= 0) {
      return res.status(400).json({ message: 'valorDeclarado deve ser maior que zero' });
    }

    const result = await olistAdapter.cotarFrete({ cepOrigem, cepDestino, valorDeclarado, volumes, servicos });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ─── GET /fretes/status ───────────────────────────────────────────────────────
// Verifica se a integração Olist está configurada.
router.get('/status', authenticate, authorize('admin'), (_req, res) => {
  const configurado = !!(process.env.OLIST_PARTNER_ID && process.env.OLIST_TOKEN);
  res.json({
    configurado,
    parceiro: configurado ? process.env.OLIST_PARTNER_ID : null,
  });
});

export { router as fretesRouter };
