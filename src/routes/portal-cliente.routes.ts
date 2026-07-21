import { Router, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import rateLimit from 'express-rate-limit';
import { UserModel } from '../models/user.model.js';
import { ClienteModel } from '../models/cliente.model.js';
import { ContratoModel } from '../models/contrato.model.js';
import { PedidoModel } from '../models/pedido.model.js';
import { CobrancaModel } from '../models/cobranca.model.js';
import { NotaEmpenhoModel } from '../models/nota-empenho.model.js';
import { authenticate } from '../middleware/auth.middleware.js';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { env } from '../config/env.js';

const router = Router();

// ─── Rate limit: 20 req / 10 min ─────────────────────────────────────────────
const portalClienteRateLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Muitas requisições — tente novamente em instantes' },
});

router.use(portalClienteRateLimit);

// ─── Helper: retorna clienteId do usuário autenticado ────────────────────────
async function getClienteId(userId: string): Promise<string | null> {
  const user = await UserModel.findById(userId).select('clienteId role').lean();
  if (!user) return null;
  if (user.role === 'admin') return null; // admin não tem clienteId fixo
  return user.clienteId?.toString() ?? null;
}

// ─── POST /portal-cliente/login ───────────────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const { email, senha } = req.body as { email?: string; senha?: string };
    if (!email || !senha) {
      return res.status(400).json({ message: 'E-mail e senha são obrigatórios' });
    }

    const user = await UserModel.findOne({ email: email.toLowerCase(), role: 'cliente' });
    if (!user || !user.ativo) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    const ok = await bcrypt.compare(senha, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: 'Credenciais inválidas' });
    }

    const jti = randomUUID();
    const payload: Record<string, unknown> = {
      sub: user._id.toString(),
      role: user.role,
      jti,
    };
    if (user.clienteId) payload.clienteId = user.clienteId.toString();

    const token = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });

    return res.json({
      token,
      user: {
        id: user._id.toString(),
        nome: user.nome,
        email: user.email,
        role: user.role,
        clienteId: user.clienteId?.toString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// ─── Middleware: exige role 'cliente' ou 'admin' ──────────────────────────────
function requireClienteOrAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ message: 'Não autenticado' });
  if (req.user.role !== 'cliente' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Sem permissão' });
  }
  next();
}

// ─── GET /portal-cliente/meus-dados ──────────────────────────────────────────
router.get('/meus-dados', authenticate, requireClienteOrAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    const clienteId = await getClienteId(req.user!.id);
    if (!clienteId) {
      return res.status(400).json({ message: 'Usuário não vinculado a um cliente' });
    }

    const cliente = await ClienteModel.findById(clienteId)
      .select('nome email documento telefone tipo ativo statusCadastro address')
      .lean();

    if (!cliente) {
      return res.status(404).json({ message: 'Cliente não encontrado' });
    }

    return res.json(cliente);
  } catch (error) {
    next(error);
  }
});

// ─── GET /portal-cliente/meus-contratos ───────────────────────────────────────
router.get('/meus-contratos', authenticate, requireClienteOrAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    const clienteId = await getClienteId(req.user!.id);
    if (!clienteId) {
      return res.status(400).json({ message: 'Usuário não vinculado a um cliente' });
    }

    const contratos = await ContratoModel.find({ clienteId })
      .select('numero valorTotal valorFaturado ativo dataInicio dataFim modalidade documentos')
      .sort({ dataInicio: -1 })
      .lean();

    return res.json(contratos);
  } catch (error) {
    next(error);
  }
});

// ─── GET /portal-cliente/meus-pedidos ─────────────────────────────────────────
router.get('/meus-pedidos', authenticate, requireClienteOrAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    const clienteId = await getClienteId(req.user!.id);
    if (!clienteId) {
      return res.status(400).json({ message: 'Usuário não vinculado a um cliente' });
    }

    const pedidos = await PedidoModel.find({ clienteId })
      .select('numero produtoId etapaOperacional status valorTotal createdAt')
      .populate('produtoId', 'nome codigo')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.json(pedidos);
  } catch (error) {
    next(error);
  }
});

// ─── GET /portal-cliente/minhas-cobrancas ─────────────────────────────────────
// CobrancaModel não tem clienteId direto — buscamos via pedidoId dos pedidos do cliente
router.get('/minhas-cobrancas', authenticate, requireClienteOrAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    const clienteId = await getClienteId(req.user!.id);
    if (!clienteId) {
      return res.status(400).json({ message: 'Usuário não vinculado a um cliente' });
    }

    // Busca os pedidos do cliente para obter os IDs
    const pedidos = await PedidoModel.find({ clienteId }).select('_id').lean();
    const pedidoIds = pedidos.map((p) => p._id);

    const cobrancas = await CobrancaModel.find({ pedidoId: { $in: pedidoIds } })
      .select('pedidoId tipo valor status vencimento pagoEm pixCopiaECola boletoUrl boletoBarcode createdAt')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    return res.json(cobrancas);
  } catch (error) {
    next(error);
  }
});

// ─── GET /portal-cliente/meus-empenhos ────────────────────────────────────────
router.get('/meus-empenhos', authenticate, requireClienteOrAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    const clienteId = await getClienteId(req.user!.id);
    if (!clienteId) {
      return res.status(400).json({ message: 'Usuário não vinculado a um cliente' });
    }

    const empenhos = await NotaEmpenhoModel.find({ clienteId })
      .select('numero valor valorUtilizado status dataEmissao dataVencimento descricao')
      .sort({ dataEmissao: -1 })
      .lean();

    return res.json(empenhos);
  } catch (error) {
    next(error);
  }
});

export { router as portalClienteRouter };
