import { Router } from 'express';
import crypto from 'crypto';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { OportunidadeModel } from '../models/oportunidade.model.js';
import { PropostaModel, nextNumeroProposta } from '../models/proposta.model.js';
import { UserModel } from '../models/user.model.js';
import { escapeRegex, parseLimit, parsePage } from '../utils/query.js';

const router = Router();

// ─── Oportunidades ────────────────────────────────────────────────────────────

/** GET /crm/oportunidades — lista paginada + KPIs */
router.get(
  '/oportunidades',
  authenticate,
  authorize('admin', 'operador', 'financeiro'),
  async (req, res, next) => {
    try {
      const { busca, etapa, responsavelId } = req.query as Record<string, string>;
      const page = parsePage(req.query.page as string);
      const limit = parseLimit(req.query.limit as string);

      const filter: Record<string, unknown> = {};

      if (etapa) filter.etapa = etapa;
      if (responsavelId) filter.responsavelId = responsavelId;
      if (busca) {
        const rx = { $regex: escapeRegex(busca), $options: 'i' };
        filter.$or = [{ titulo: rx }, { nomeContato: rx }];
      }

      const skip = (page - 1) * limit;

      const [data, total, kpiAgg] = await Promise.all([
        OportunidadeModel.find(filter)
          .populate('clienteId', 'nome documento')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        OportunidadeModel.countDocuments(filter),
        OportunidadeModel.aggregate<{
          _id: string;
          count: number;
          valor: number;
        }>([
          { $match: { etapa: { $nin: ['Fechado Ganho', 'Fechado Perdido'] } } },
          {
            $group: {
              _id: '$etapa',
              count: { $sum: 1 },
              valor: { $sum: { $ifNull: ['$valor', 0] } },
            },
          },
        ]),
      ]);

      const totalAberto = kpiAgg.reduce((acc, r) => acc + r.count, 0);
      const valorEstimado = kpiAgg.reduce((acc, r) => acc + r.valor, 0);
      const porEtapa = kpiAgg.map(r => ({ etapa: r._id, count: r.count, valor: r.valor }));

      res.json({
        data,
        total,
        page,
        limit,
        kpis: { totalAberto, valorEstimado, porEtapa },
      });
    } catch (error) {
      next(error);
    }
  }
);

/** GET /crm/oportunidades/:id — detalhe */
router.get(
  '/oportunidades/:id',
  authenticate,
  authorize('admin', 'operador', 'financeiro'),
  async (req, res, next) => {
    try {
      const oportunidade = await OportunidadeModel.findById(req.params.id)
        .populate('clienteId', 'nome documento email telefone')
        .populate('produtoIds', 'codigo nome');
      if (!oportunidade) return res.status(404).json({ message: 'Oportunidade não encontrada' });
      res.json(oportunidade);
    } catch (error) {
      next(error);
    }
  }
);

/** POST /crm/oportunidades — cria */
router.post(
  '/oportunidades',
  authenticate,
  authorize('admin', 'operador', 'financeiro'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = req.body as Record<string, unknown>;

      const probabilidade = Number(body.probabilidade ?? 0);
      if (isNaN(probabilidade) || probabilidade < 0 || probabilidade > 100) {
        return res.status(400).json({ message: 'probabilidade deve ser um número entre 0 e 100' });
      }
      body.probabilidade = probabilidade;

      const oportunidade = await OportunidadeModel.create(body);
      res.status(201).json(oportunidade);
    } catch (error) {
      next(error);
    }
  }
);

/** PUT /crm/oportunidades/:id — atualiza */
router.put(
  '/oportunidades/:id',
  authenticate,
  authorize('admin', 'operador', 'financeiro'),
  async (req, res, next) => {
    try {
      const body = req.body as Record<string, unknown>;

      if (body.probabilidade !== undefined) {
        const probabilidade = Number(body.probabilidade);
        if (isNaN(probabilidade) || probabilidade < 0 || probabilidade > 100) {
          return res.status(400).json({ message: 'probabilidade deve ser um número entre 0 e 100' });
        }
      }

      const oportunidade = await OportunidadeModel.findByIdAndUpdate(
        req.params.id,
        body,
        { new: true, runValidators: true }
      ).populate('clienteId', 'nome documento');

      if (!oportunidade) return res.status(404).json({ message: 'Oportunidade não encontrada' });
      res.json(oportunidade);
    } catch (error) {
      next(error);
    }
  }
);

/** DELETE /crm/oportunidades/:id — somente admin */
router.delete(
  '/oportunidades/:id',
  authenticate,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const oportunidade = await OportunidadeModel.findByIdAndDelete(req.params.id);
      if (!oportunidade) return res.status(404).json({ message: 'Oportunidade não encontrada' });
      res.json({ message: 'Oportunidade excluída', oportunidade });
    } catch (error) {
      next(error);
    }
  }
);

// ─── Propostas ────────────────────────────────────────────────────────────────

/** GET /crm/propostas — lista paginada */
router.get(
  '/propostas',
  authenticate,
  authorize('admin', 'operador', 'financeiro'),
  async (req, res, next) => {
    try {
      const { busca, clienteId, status } = req.query as Record<string, string>;
      const page = parsePage(req.query.page as string);
      const limit = parseLimit(req.query.limit as string);

      const filter: Record<string, unknown> = {};

      if (clienteId) filter.clienteId = clienteId;
      if (status) filter.status = status;
      if (busca) {
        const rx = { $regex: escapeRegex(busca), $options: 'i' };
        filter.$or = [{ numero: rx }, { titulo: rx }];
      }

      const skip = (page - 1) * limit;

      const [data, total] = await Promise.all([
        PropostaModel.find(filter)
          .populate('clienteId', 'nome documento')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit),
        PropostaModel.countDocuments(filter),
      ]);

      res.json({ data, total, page, limit });
    } catch (error) {
      next(error);
    }
  }
);

/** GET /crm/propostas/:id — detalhe */
router.get(
  '/propostas/:id',
  authenticate,
  authorize('admin', 'operador', 'financeiro'),
  async (req, res, next) => {
    try {
      const proposta = await PropostaModel.findById(req.params.id)
        .populate('clienteId', 'nome documento email telefone')
        .populate('oportunidadeId', 'titulo etapa valor');
      if (!proposta) return res.status(404).json({ message: 'Proposta não encontrada' });
      res.json(proposta);
    } catch (error) {
      next(error);
    }
  }
);

/** POST /crm/propostas — cria */
router.post(
  '/propostas',
  authenticate,
  authorize('admin', 'operador', 'financeiro'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = req.body as {
        clienteId: string;
        oportunidadeId?: string;
        titulo: string;
        itens?: Array<{
          produtoId: string;
          codigo: string;
          nome: string;
          quantidade: number;
          precoUnitario: number;
          desconto?: number;
        }>;
        validade: string;
        observacoes?: string;
        condicoesPagamento?: string;
        responsavelNome?: string;
        [key: string]: unknown;
      };

      // Calcular subtotais e valorTotal
      const itens = (body.itens ?? []).map(item => {
        const desconto = Number(item.desconto ?? 0);
        const subtotal =
          Math.round(
            Number(item.quantidade) * Number(item.precoUnitario) * (1 - desconto / 100) * 100
          ) / 100;
        return { ...item, desconto, subtotal };
      });

      const valorTotal = itens.reduce((acc, i) => acc + i.subtotal, 0);

      // Buscar nome do responsável — req.user.nome não existe na interface, busca via UserModel
      let responsavelNome = body.responsavelNome ?? '';
      if (!responsavelNome && req.user?.id) {
        const userDoc = await UserModel.findById(req.user.id).select('nome').lean();
        responsavelNome = userDoc?.nome ?? '';
      }

      const numero = await nextNumeroProposta();

      const proposta = await PropostaModel.create({
        ...body,
        numero,
        itens,
        valorTotal,
        responsavelNome,
      });

      res.status(201).json(proposta);
    } catch (error) {
      next(error);
    }
  }
);

/** PUT /crm/propostas/:id — atualiza (bloqueia se Aceita/Cancelada) */
router.put(
  '/propostas/:id',
  authenticate,
  authorize('admin', 'operador', 'financeiro'),
  async (req, res, next) => {
    try {
      const proposta = await PropostaModel.findById(req.params.id);
      if (!proposta) return res.status(404).json({ message: 'Proposta não encontrada' });

      if (proposta.status === 'Aceita' || proposta.status === 'Cancelada') {
        return res
          .status(409)
          .json({ message: `Proposta com status "${proposta.status}" não pode ser alterada` });
      }

      const body = req.body as {
        itens?: Array<{
          produtoId: string;
          codigo: string;
          nome: string;
          quantidade: number;
          precoUnitario: number;
          desconto?: number;
        }>;
        [key: string]: unknown;
      };

      // Recalcular se itens forem enviados
      if (body.itens) {
        const itens = body.itens.map(item => {
          const desconto = Number(item.desconto ?? 0);
          const subtotal =
            Math.round(
              Number(item.quantidade) * Number(item.precoUnitario) * (1 - desconto / 100) * 100
            ) / 100;
          return { ...item, desconto, subtotal };
        });
        body.itens = itens;
        body.valorTotal = itens.reduce((acc, i) => acc + i.subtotal, 0);
      }

      // Não permitir alterar campos de aceite via PUT
      delete body.tokenAceite;
      delete body.tokenAceiteExpira;
      delete body.aceiteEm;
      delete body.aceiteIp;
      delete body.aceitePor;
      delete body.numero;

      const atualizada = await PropostaModel.findByIdAndUpdate(
        req.params.id,
        body,
        { new: true, runValidators: true }
      )
        .populate('clienteId', 'nome documento')
        .populate('oportunidadeId', 'titulo etapa');

      res.json(atualizada);
    } catch (error) {
      next(error);
    }
  }
);

/** PATCH /crm/propostas/:id/status — muda status */
router.patch(
  '/propostas/:id/status',
  authenticate,
  authorize('admin', 'operador', 'financeiro'),
  async (req, res, next) => {
    try {
      const { status } = req.body as { status: string };
      const statusValidos = [
        'Rascunho',
        'Enviada',
        'Em Negociação',
        'Aceita',
        'Recusada',
        'Expirada',
        'Cancelada',
      ];
      if (!statusValidos.includes(status)) {
        return res.status(400).json({ message: `Status inválido. Use um de: ${statusValidos.join(', ')}` });
      }

      const proposta = await PropostaModel.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true, runValidators: true }
      );
      if (!proposta) return res.status(404).json({ message: 'Proposta não encontrada' });
      res.json(proposta);
    } catch (error) {
      next(error);
    }
  }
);

/** POST /crm/propostas/:id/token-aceite — gera token de aceite público */
router.post(
  '/propostas/:id/token-aceite',
  authenticate,
  authorize('admin', 'operador', 'financeiro'),
  async (req, res, next) => {
    try {
      const proposta = await PropostaModel.findById(req.params.id);
      if (!proposta) return res.status(404).json({ message: 'Proposta não encontrada' });

      if (proposta.status === 'Aceita' || proposta.status === 'Cancelada') {
        return res
          .status(409)
          .json({ message: `Não é possível gerar token para proposta "${proposta.status}"` });
      }

      const tokenPlain = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(tokenPlain).digest('hex');
      const expira = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias

      proposta.tokenAceite = tokenHash;
      proposta.tokenAceiteExpira = expira;
      await proposta.save();

      res.json({
        tokenPlain,
        url: `/proposta-aceite/${tokenPlain}`,
        expira,
      });
    } catch (error) {
      next(error);
    }
  }
);

/** POST /crm/aceite/:token — ROTA PÚBLICA — aceite de proposta por link */
router.post('/aceite/:token', async (req, res, next) => {
  try {
    const tokenPlain = req.params.token;
    if (!tokenPlain) return res.status(400).json({ message: 'Token inválido' });

    const tokenHash = crypto.createHash('sha256').update(tokenPlain).digest('hex');

    const proposta = await PropostaModel.findOne({
      tokenAceite: tokenHash,
      tokenAceiteExpira: { $gt: new Date() },
    }).select('+tokenAceite');

    if (!proposta) {
      return res.status(404).json({ message: 'Link de aceite inválido ou expirado' });
    }

    if (proposta.status === 'Aceita') {
      return res.status(409).json({ message: 'Proposta já foi aceita anteriormente' });
    }

    if (proposta.status === 'Cancelada' || proposta.status === 'Recusada') {
      return res.status(409).json({ message: `Proposta não está disponível para aceite (status: ${proposta.status})` });
    }

    const { nome } = req.body as { nome?: string };

    proposta.status = 'Aceita';
    proposta.aceiteEm = new Date();
    proposta.aceiteIp = req.ip ?? '';
    proposta.aceitePor = nome ?? '';
    await proposta.save();

    res.json({
      message: 'Proposta aceita com sucesso',
      proposta: {
        _id: proposta._id,
        numero: proposta.numero,
        titulo: proposta.titulo,
        clienteId: proposta.clienteId,
        oportunidadeId: proposta.oportunidadeId,
        validade: proposta.validade,
        status: proposta.status,
        aceiteEm: proposta.aceiteEm,
        aceitePor: proposta.aceitePor,
        responsavelNome: proposta.responsavelNome,
        condicoesPagamento: proposta.condicoesPagamento,
        observacoes: proposta.observacoes,
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as crmRouter };
