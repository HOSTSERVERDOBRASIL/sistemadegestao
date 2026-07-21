import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { ContaPagarModel } from '../models/conta-pagar.model.js';
import { escapeRegex, parseLimit, parsePage } from '../utils/query.js';
import type { Request, Response, NextFunction } from 'express';

// ─── Multer — comprovantes de contas a pagar ──────────────────────────────────
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${Date.now()}-${name}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`Tipo de arquivo não permitido: ${ext}`));
  },
});

// ─── Router ───────────────────────────────────────────────────────────────────
const router = Router();

// ─── GET / — lista paginada com KPIs ─────────────────────────────────────────
router.get(
  '/',
  authenticate,
  authorize('admin', 'operador', 'financeiro'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        busca,
        status,
        tipo,
        centroCusto,
        vencendo,
        page: pgRaw,
        limit: lmRaw,
      } = req.query as Record<string, string | undefined>;

      const page = parsePage(pgRaw);
      const limit = parseLimit(lmRaw, 20, 100);
      const skip = (page - 1) * limit;

      const filter: Record<string, unknown> = {};

      if (busca) {
        filter.descricao = { $regex: escapeRegex(busca), $options: 'i' };
      }
      if (status) filter.status = status;
      if (tipo) filter.tipo = tipo;
      if (centroCusto) filter.centroCusto = centroCusto;

      if (vencendo === 'true' || vencendo === '1') {
        const hoje = new Date();
        const limite = new Date();
        limite.setDate(limite.getDate() + 7);
        filter.dataVencimento = { $lte: limite };
        filter.status = { $nin: ['Paga', 'Cancelada'] };
      }

      const agora = new Date();
      const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
      const fimMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59, 999);

      const [data, total, kpiAgg] = await Promise.all([
        ContaPagarModel.find(filter)
          .sort({ dataVencimento: 1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        ContaPagarModel.countDocuments(filter),
        ContaPagarModel.aggregate([
          {
            $facet: {
              pendente: [
                { $match: { status: { $in: ['Pendente', 'Aprovada'] } } },
                { $group: { _id: null, total: { $sum: '$valor' } } },
              ],
              vencido: [
                {
                  $match: {
                    status: { $nin: ['Paga', 'Cancelada'] },
                    dataVencimento: { $lt: agora },
                  },
                },
                { $group: { _id: null, total: { $sum: '$valor' } } },
              ],
              pagoMes: [
                {
                  $match: {
                    status: { $in: ['Paga', 'Parcialmente Paga'] },
                    dataPagamento: { $gte: inicioMes, $lte: fimMes },
                  },
                },
                { $group: { _id: null, total: { $sum: '$valorPago' } } },
              ],
            },
          },
        ]),
      ]);

      const facet = kpiAgg[0] as {
        pendente: Array<{ total: number }>;
        vencido: Array<{ total: number }>;
        pagoMes: Array<{ total: number }>;
      };

      const kpis = {
        totalPendente: facet.pendente[0]?.total ?? 0,
        totalVencido: facet.vencido[0]?.total ?? 0,
        totalPagoMes: facet.pagoMes[0]?.total ?? 0,
      };

      res.json({ data, total, page, limit, kpis });
    } catch (error) {
      next(error);
    }
  }
);

// ─── GET /:id — detalhe ───────────────────────────────────────────────────────
router.get(
  '/:id',
  authenticate,
  authorize('admin', 'operador', 'financeiro'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const conta = await ContaPagarModel.findById(req.params.id);
      if (!conta) return res.status(404).json({ message: 'Conta a pagar não encontrada' });
      res.json(conta);
    } catch (error) {
      next(error);
    }
  }
);

// ─── POST / — cria ────────────────────────────────────────────────────────────
router.post(
  '/',
  authenticate,
  authorize('admin', 'operador', 'financeiro'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        descricao,
        tipo,
        fornecedor,
        valor,
        dataVencimento,
        recorrencia,
        centroCusto,
        observacoes,
      } = req.body as {
        descricao?: string;
        tipo?: string;
        fornecedor?: string;
        valor?: number;
        dataVencimento?: string;
        recorrencia?: string;
        centroCusto?: string;
        observacoes?: string;
      };

      if (!descricao) return res.status(400).json({ message: 'Descrição é obrigatória' });
      if (!tipo) return res.status(400).json({ message: 'Tipo é obrigatório' });
      if (valor === undefined || valor === null) {
        return res.status(400).json({ message: 'Valor é obrigatório' });
      }
      if (!dataVencimento) return res.status(400).json({ message: 'Data de vencimento é obrigatória' });

      const criadorNome = (req as Request & { user?: { nome?: string } }).user?.nome;

      const conta = await ContaPagarModel.create({
        descricao,
        tipo,
        fornecedor: fornecedor || undefined,
        valor: Number(valor),
        valorPago: 0,
        dataVencimento: new Date(dataVencimento),
        status: 'Pendente',
        recorrencia: recorrencia || 'Única',
        centroCusto: centroCusto || undefined,
        observacoes: observacoes || undefined,
        criadorNome: criadorNome || undefined,
      });

      res.status(201).json(conta);
    } catch (error) {
      next(error);
    }
  }
);

// ─── PUT /:id — atualiza campos editáveis ─────────────────────────────────────
router.put(
  '/:id',
  authenticate,
  authorize('admin', 'operador', 'financeiro'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const conta = await ContaPagarModel.findById(req.params.id);
      if (!conta) return res.status(404).json({ message: 'Conta a pagar não encontrada' });

      if (conta.status === 'Paga' || conta.status === 'Cancelada') {
        return res
          .status(409)
          .json({ message: `Conta com status "${conta.status}" não pode ser alterada` });
      }

      const { descricao, tipo, fornecedor, valor, dataVencimento, centroCusto, observacoes } =
        req.body as {
          descricao?: string;
          tipo?: string;
          fornecedor?: string;
          valor?: number;
          dataVencimento?: string;
          centroCusto?: string;
          observacoes?: string;
        };

      if (descricao !== undefined) conta.descricao = descricao;
      if (tipo !== undefined) conta.tipo = tipo as typeof conta.tipo;
      if (fornecedor !== undefined) conta.fornecedor = fornecedor || undefined;
      if (valor !== undefined) conta.valor = Number(valor);
      if (dataVencimento !== undefined) conta.dataVencimento = new Date(dataVencimento);
      if (centroCusto !== undefined) conta.centroCusto = centroCusto || undefined;
      if (observacoes !== undefined) conta.observacoes = observacoes || undefined;

      await conta.save();
      res.json(conta);
    } catch (error) {
      next(error);
    }
  }
);

// ─── PATCH /:id/pagar — registra pagamento ────────────────────────────────────
router.patch(
  '/:id/pagar',
  authenticate,
  authorize('admin', 'financeiro'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const conta = await ContaPagarModel.findById(req.params.id);
      if (!conta) return res.status(404).json({ message: 'Conta a pagar não encontrada' });

      if (conta.status === 'Paga') {
        return res.status(409).json({ message: 'Conta já está paga' });
      }
      if (conta.status === 'Cancelada') {
        return res.status(409).json({ message: 'Conta cancelada não pode ser paga' });
      }

      const { dataPagamento, valorPago: valorPagoRaw } = req.body as {
        dataPagamento?: string;
        valorPago?: number;
      };

      const valorPago = valorPagoRaw !== undefined ? Number(valorPagoRaw) : conta.valor;
      const aprovadoPor = (req as Request & { user?: { nome?: string } }).user?.nome;

      conta.valorPago = valorPago;
      conta.dataPagamento = dataPagamento ? new Date(dataPagamento) : new Date();
      conta.status = valorPago < conta.valor ? 'Parcialmente Paga' : 'Paga';
      if (aprovadoPor) conta.aprovadoPor = aprovadoPor;

      await conta.save();
      res.json(conta);
    } catch (error) {
      next(error);
    }
  }
);

// ─── PATCH /:id/aprovar — aprova conta pendente ───────────────────────────────
router.patch(
  '/:id/aprovar',
  authenticate,
  authorize('admin', 'financeiro'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const conta = await ContaPagarModel.findById(req.params.id);
      if (!conta) return res.status(404).json({ message: 'Conta a pagar não encontrada' });

      if (conta.status !== 'Pendente') {
        return res
          .status(409)
          .json({ message: `Apenas contas Pendentes podem ser aprovadas. Status atual: ${conta.status}` });
      }

      conta.status = 'Aprovada';
      await conta.save();
      res.json(conta);
    } catch (error) {
      next(error);
    }
  }
);

// ─── PATCH /:id/cancelar — cancela conta ─────────────────────────────────────
router.patch(
  '/:id/cancelar',
  authenticate,
  authorize('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const conta = await ContaPagarModel.findById(req.params.id);
      if (!conta) return res.status(404).json({ message: 'Conta a pagar não encontrada' });

      if (conta.status === 'Paga') {
        return res.status(409).json({ message: 'Conta já paga não pode ser cancelada' });
      }
      if (conta.status === 'Cancelada') {
        return res.status(409).json({ message: 'Conta já está cancelada' });
      }

      conta.status = 'Cancelada';
      await conta.save();
      res.json(conta);
    } catch (error) {
      next(error);
    }
  }
);

// ─── POST /:id/comprovante — upload de arquivo ────────────────────────────────
router.post(
  '/:id/comprovante',
  authenticate,
  authorize('admin', 'operador', 'financeiro'),
  upload.single('arquivo'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'Nenhum arquivo enviado' });

      const conta = await ContaPagarModel.findById(req.params.id);
      if (!conta) return res.status(404).json({ message: 'Conta a pagar não encontrada' });

      const url = `/uploads/${req.file.filename}`;
      conta.comprovante = url;
      await conta.save();

      res.json({ url, message: 'Comprovante enviado com sucesso' });
    } catch (error) {
      next(error);
    }
  }
);

export { router as contasPagarRouter };
