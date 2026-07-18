import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { CobrancaModel } from '../models/cobranca.model.js';
import { PedidoModel } from '../models/pedido.model.js';
import { broadcast } from '../services/events.service.js';
import { efiAdapter } from '../services/efi.service.js';
import type { Request, Response, NextFunction } from 'express';

const router = Router();

// ─── Criar cobrança PIX imediato ──────────────────────────────────────────────
router.post('/pix', authenticate, authorize('admin', 'financeiro', 'operador'), async (req, res, next) => {
  try {
    const { pedidoId, valor, expiracaoSegundos } = req.body as {
      pedidoId: string; valor: number; expiracaoSegundos?: number;
    };

    const pedido = await PedidoModel.findById(pedidoId).populate('clienteId', 'nome documento');
    if (!pedido) return res.status(404).json({ message: 'Pedido não encontrado' });

    const cliente = pedido.clienteId as unknown as { nome?: string; documento?: string };
    const documento = (cliente?.documento ?? '').replace(/\D/g, '');
    const devedor = documento.length === 11
      ? { nome: cliente?.nome ?? 'Cliente', cpf: documento }
      : documento.length === 14
        ? { nome: cliente?.nome ?? 'Cliente', cnpj: documento }
        : undefined;

    const result = await efiAdapter.criarPixImediato(valor ?? pedido.valorTotal, {
      solicitacaoPagador: `Pedido ${pedido.numero}`,
      expiracaoSegundos,
      devedor,
    });

    const cobranca = await CobrancaModel.create({
      pedidoId,
      tipo: 'pix',
      valor: valor ?? pedido.valorTotal,
      status: 'ATIVA',
      txid: result.txid,
      loc: result.loc,
      qrCode: result.qrCode,
      qrCodeBase64: result.qrCodeBase64,
      pixCopiaECola: result.pixCopiaECola,
      efiResponse: result.raw,
    });

    broadcast({ type: 'cobranca_criada', payload: { pedidoId, tipo: 'pix', txid: result.txid } });

    res.status(201).json(cobranca);
  } catch (error) {
    next(error);
  }
});

// ─── Criar cobrança PIX com vencimento ────────────────────────────────────────
router.post('/pix-vencimento', authenticate, authorize('admin', 'financeiro', 'operador'), async (req, res, next) => {
  try {
    const { pedidoId, valor, vencimento } = req.body as {
      pedidoId: string; valor: number; vencimento: string;
    };

    const pedido = await PedidoModel.findById(pedidoId).populate('clienteId', 'nome documento');
    if (!pedido) return res.status(404).json({ message: 'Pedido não encontrado' });

    const cliente = pedido.clienteId as unknown as { nome: string; documento: string };
    const cpfCnpj = (cliente?.documento ?? '').replace(/\D/g, '');
    const devedor = {
      nome: cliente?.nome ?? 'Cliente',
      ...(cpfCnpj.length === 11 ? { cpf: cpfCnpj } : { cnpj: cpfCnpj }),
    };

    const result = await efiAdapter.criarPixVencimento(
      valor ?? pedido.valorTotal,
      new Date(vencimento),
      devedor
    );

    const cobranca = await CobrancaModel.create({
      pedidoId,
      tipo: 'pix_vencimento',
      valor: valor ?? pedido.valorTotal,
      status: 'ATIVA',
      txid: result.txid,
      loc: result.loc,
      qrCode: result.qrCode,
      qrCodeBase64: result.qrCodeBase64,
      pixCopiaECola: result.pixCopiaECola,
      vencimento: new Date(vencimento),
      efiResponse: result.raw,
    });

    broadcast({ type: 'cobranca_criada', payload: { pedidoId, tipo: 'pix_vencimento', txid: result.txid } });

    res.status(201).json(cobranca);
  } catch (error) {
    next(error);
  }
});

// ─── Criar boleto ─────────────────────────────────────────────────────────────
router.post('/boleto', authenticate, authorize('admin', 'financeiro', 'operador'), async (req, res, next) => {
  try {
    const { pedidoId, valor, vencimento } = req.body as {
      pedidoId: string; valor: number; vencimento: string;
    };

    const pedido = await PedidoModel.findById(pedidoId).populate('clienteId', 'nome documento email telefone');
    if (!pedido) return res.status(404).json({ message: 'Pedido não encontrado' });

    const cliente = pedido.clienteId as unknown as { nome: string; documento: string; email?: string; telefone?: string };

    const result = await efiAdapter.criarBoleto(
      valor ?? pedido.valorTotal,
      new Date(vencimento),
      {
        nome: cliente?.nome ?? 'Cliente',
        cpfCnpj: cliente?.documento ?? '',
        email: cliente?.email,
        telefone: cliente?.telefone,
      }
    );

    const cobranca = await CobrancaModel.create({
      pedidoId,
      tipo: 'boleto',
      valor: valor ?? pedido.valorTotal,
      status: 'ATIVA',
      nossoNumero: result.nossoNumero,
      boletoUrl: result.boletoUrl,
      boletoBarcode: result.boletoBarcode,
      vencimento: new Date(vencimento),
      efiResponse: result.raw,
    });

    broadcast({ type: 'cobranca_criada', payload: { pedidoId, tipo: 'boleto', nossoNumero: result.nossoNumero } });

    res.status(201).json(cobranca);
  } catch (error) {
    next(error);
  }
});

// ─── Listar cobranças de um pedido ────────────────────────────────────────────
router.get('/pedido/:pedidoId', authenticate, authorize('admin', 'financeiro', 'operador'), async (req, res, next) => {
  try {
    const cobras = await CobrancaModel.find({ pedidoId: req.params.pedidoId }).sort({ createdAt: -1 });
    res.json(cobras);
  } catch (error) {
    next(error);
  }
});

// ─── Consultar status de uma cobrança ────────────────────────────────────────
router.get('/:id', authenticate, authorize('admin', 'financeiro', 'operador'), async (req, res, next) => {
  try {
    const cobranca = await CobrancaModel.findById(req.params.id);
    if (!cobranca) return res.status(404).json({ message: 'Cobrança não encontrada' });

    if (cobranca.txid && (cobranca.tipo === 'pix' || cobranca.tipo === 'pix_vencimento')) {
      try {
        const pixStatus = await efiAdapter.consultarPix(cobranca.txid);
        const newStatus = (pixStatus as { status?: string }).status as string | undefined;
        if (newStatus && newStatus !== cobranca.status) {
          cobranca.status = newStatus as typeof cobranca.status;
          if (newStatus === 'CONCLUIDA') cobranca.pagoEm = new Date();
          await cobranca.save();
          broadcast({ type: 'cobranca_paga', payload: { cobrancaId: cobranca._id, pedidoId: cobranca.pedidoId } });
        }
      } catch { /* continua com status local */ }
    }

    res.json(cobranca);
  } catch (error) {
    next(error);
  }
});

// ─── Cancelar cobrança ────────────────────────────────────────────────────────
router.delete('/:id', authenticate, authorize('admin', 'financeiro'), async (req, res, next) => {
  try {
    const cobranca = await CobrancaModel.findById(req.params.id);
    if (!cobranca) return res.status(404).json({ message: 'Cobrança não encontrada' });
    if (cobranca.status === 'CONCLUIDA') {
      return res.status(409).json({ message: 'Não é possível cancelar uma cobrança já paga' });
    }
    await efiAdapter.cancelarCobrancaEfi({
      tipo: cobranca.tipo,
      txid: cobranca.txid,
      nossoNumero: cobranca.nossoNumero,
    });
    cobranca.status = 'REMOVIDA_PELO_USUARIO_RECEBEDOR';
    await cobranca.save();
    res.json({ message: 'Cobrança cancelada', cobranca });
  } catch (error) {
    next(error);
  }
});

// ─── Webhook Efi Bank (PIX) ───────────────────────────────────────────────────
// Endpoint público — a Efi chama este endpoint ao confirmar pagamento PIX
const efiWebhookHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const signature = String(
      req.query.hmac
      ?? req.headers['x-webhook-token']
      ?? req.headers['x-efi-signature']
      ?? '',
    ) || undefined;

    if (!efiAdapter.validarWebhookEfi(signature)) {
      return res.status(401).json({ message: 'Webhook não autorizado' });
    }

    const payload = req.body as {
      pix?: Array<{ txid: string; valor: string; horario: string; status?: string }>;
    };

    if (payload.pix && Array.isArray(payload.pix)) {
      for (const pix of payload.pix) {
        const cobranca = await CobrancaModel.findOne({ txid: pix.txid });
        if (!cobranca) continue;
        if (cobranca.status !== 'CONCLUIDA') {
          cobranca.status = 'CONCLUIDA';
          cobranca.pagoEm = new Date(pix.horario);
          await cobranca.save();

          // Avança pedido automaticamente para etapa Pagamento se ainda estiver em Pedido
          const pedido = await PedidoModel.findById(cobranca.pedidoId);
          if (pedido && pedido.etapaOperacional === 'Pedido') {
            const idx = ['Pedido', 'Pagamento', 'Validacao', 'Preparacao', 'Processamento', 'Entrega', 'Conclusao'].indexOf('Pagamento');
            const current = ['Pedido', 'Pagamento', 'Validacao', 'Preparacao', 'Processamento', 'Entrega', 'Conclusao'].indexOf(pedido.etapaOperacional);
            if (idx > current) {
              pedido.etapaOperacional = 'Pagamento';
              pedido.historicoEtapas.push({ etapa: 'Pagamento', data: new Date(), observacao: 'Pagamento PIX confirmado automaticamente via Efi Bank' });
              await pedido.save();
            }
          }

          broadcast({
            type: 'cobranca_paga',
            payload: { txid: pix.txid, pedidoId: cobranca.pedidoId, valor: pix.valor },
          });
        }
      }
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

// A Efí normalmente acrescenta /pix à URL registrada. O parâmetro `ignorar=`
// evita isso, mas mantemos as duas rotas para tolerar cadastros antigos.
router.post('/webhook/efi', efiWebhookHandler);
router.post('/webhook/efi/pix', efiWebhookHandler);

export { router as cobrancasRouter };
