import { Router } from 'express';
import { PedidoModel, ETAPAS_OPERACIONAIS, EtapaOperacional } from '../models/pedido.model.js';
import { emitirNotaFiscal } from '../services/faturamento.service.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { broadcast } from '../services/events.service.js';
import { validarCupom, registrarUsoCupom, estornarUsoCupom, CupomInvalidoError } from '../services/cupom.service.js';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import type { Types } from 'mongoose';
import { escapeRegex, parseLimit, parsePage } from '../utils/query.js';
import { montarItensPedido } from '../services/pedido.service.js';
import { ContratoFluxoError, validarVinculoContrato } from '../services/contrato.service.js';
import { ClienteModel } from '../models/cliente.model.js';
import { NotaFiscalModel } from '../models/nota-fiscal.model.js';
import { nextSeq } from '../models/counter.model.js';
import { registrarAuditoria } from '../services/auditoria.service.js';
import { estornarSaldoNotaEmpenho, reservarSaldoNotaEmpenho } from '../services/nota-empenho.service.js';

const router = Router();

router.get('/', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const { clienteId, produtoId, contratoId, parceiroId, status, etapa, nfEmitida, busca, vinculoTipo } = req.query as Record<string, string>;
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
    if (vinculoTipo === 'Contrato') filter.contratoId = { $exists: true };
    if (vinculoTipo === 'Revenda') filter.parceiroId = { $exists: true };
    if (vinculoTipo === 'EmpenhoSF') filter.$or = [
      { notaEmpenhoId: { $exists: true } }, { numeroEmpenhoNoContrato: { $exists: true, $ne: '' } }, { 'vinculo.empenho': { $exists: true, $ne: '' } },
    ];
    if (vinculoTipo === 'CompraDireta') filter.$and = [
      { contratoId: { $exists: false } }, { parceiroId: { $exists: false } }, { notaEmpenhoId: { $exists: false } },
      { numeroEmpenhoNoContrato: { $in: [null, ''] } },
    ];

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      PedidoModel.find(filter)
        .populate('clienteId', 'nome documento')
        .populate('produtoId', 'codigo nome')
        .populate('itens.produtoId', 'codigo nome')
        .populate('ordemFornecimentoId', 'numero valor valorFaturado status')
        .populate('notaEmpenhoId', 'numero valor valorUtilizado status')
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
      .populate('itens.produtoId', 'codigo nome preco')
      .populate('contratoId', 'numero modalidade valorTotal valorFaturado')
      .populate('ordemFornecimentoId', 'numero valor valorFaturado status dataFim')
      .populate('parceiroId', 'nome documento emissorNFPadrao')
      .populate('notaEmpenhoId', 'numero valor valorUtilizado status descricao')
      .populate('historicoEtapas.usuarioId', 'nome email');
    if (!pedido) return res.status(404).json({ message: 'Pedido não encontrado' });
    res.json(pedido);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const body = { ...req.body } as {
      cupomCodigo?: string;
      valorTotal?: number;
      valorTabela?: number;
      produtoId?: string;
      clienteId?: string;
      contratoId?: string;
      ordemFornecimentoId?: string;
      notaEmpenhoId?: string;
      numeroEmpenhoNoContrato?: string;
      itens?: Array<{
        produtoId?: string | Types.ObjectId;
        quantidade?: number;
        precoUnitario?: number;
        valorTabelaUnitario?: number;
      }>;
      vinculo?: { tipo?: string; empenho?: string; emissorNF?: 'XDigital' | 'Revendedor' };
      historicoEtapas?: unknown[];
      [key: string]: unknown;
    };

    if (!body.clienteId) throw new ContratoFluxoError('Selecione o cliente', 400);
    body.vinculo ??= {};
    if (body.vinculo.empenho && !body.notaEmpenhoId) body.numeroEmpenhoNoContrato = body.vinculo.empenho;
    // Mantido como classificação principal para compatibilidade e filtros.
    // Os vínculos reais são independentes e podem coexistir.
    body.vinculo.tipo = body.contratoId
      ? 'Contrato'
      : body.parceiroId
        ? 'Revenda'
        : (body.numeroEmpenhoNoContrato || body.notaEmpenhoId) ? 'EmpenhoSF' : 'CompraDireta';

    // Lei 4.320/64: cliente de esfera pública exige empenho
    const cliente = await ClienteModel.findById(body.clienteId).select('esferaPublica').lean();
    if (cliente?.esferaPublica) {
      const temEmpenho = body.numeroEmpenhoNoContrato || body.vinculo.empenho || body.notaEmpenhoId;
      if (!temEmpenho) {
        throw new ContratoFluxoError(
          'Cliente de esfera pública requer número de empenho ou nota de empenho vinculada (Lei 4.320/64, art. 60)',
          422
        );
      }
    }
    if (body.numeroEmpenhoNoContrato && body.notaEmpenhoId) {
      throw new ContratoFluxoError('Use número de empenho no contrato OU Nota de Empenho, não os dois', 422);
    }

    // Pedidos antigos enviam um único produto e os totais. Eles continuam
    // aceitos, mas são normalizados para a nova estrutura de itens.
    const itensEntrada = body.itens?.length
      ? body.itens.map(item => ({ ...item, produtoId: String(item.produtoId ?? '') }))
      : [{
          produtoId: body.produtoId,
          quantidade: 1,
          precoUnitario: body.valorTotal,
          valorTabelaUnitario: body.valorTabela ?? body.valorTotal,
        }];
    const calculado = await montarItensPedido(itensEntrada);
    body.itens = calculado.itens;
    body.produtoId = String(calculado.produtoId);
    body.valorTotal = calculado.valorTotal;
    body.valorTabela = calculado.valorTabela;

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
      } catch (err) {
        if (err instanceof CupomInvalidoError) {
          return res.status(422).json({ message: err.message });
        }
        throw err;
      }
    }

    if (body.contratoId) {
      await validarVinculoContrato({
        contratoId: body.contratoId,
        clienteId: body.clienteId,
        valor: body.valorTotal,
        ordemFornecimentoId: body.ordemFornecimentoId,
      });
    }

    let notaReservada = false;
    if (body.notaEmpenhoId) {
      await reservarSaldoNotaEmpenho({
        notaEmpenhoId: body.notaEmpenhoId,
        clienteId: body.clienteId,
        valor: body.valorTotal,
      });
      notaReservada = true;
    }
    let pedido;
    try {
      pedido = await PedidoModel.create(body);
    } catch (error) {
      if (notaReservada) await estornarSaldoNotaEmpenho(body.notaEmpenhoId, body.valorTotal);
      throw error;
    }
    if (body.cupomId) await registrarUsoCupom(body.cupomId as Types.ObjectId);

    res.status(201).json(pedido);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const pedido = await PedidoModel.findById(req.params.id);
    if (!pedido) return res.status(404).json({ message: 'Pedido não encontrado' });
    const financeiros = ['clienteId', 'produtoId', 'contratoId', 'ordemFornecimentoId', 'itens', 'valorTotal', 'valorTabela', 'cupomId', 'cupomCodigo'];
    if (financeiros.some(campo => Object.prototype.hasOwnProperty.call(req.body, campo))) {
      return res.status(409).json({ message: 'Itens, valores e vínculos financeiros não podem ser alterados; cancele e crie um novo pedido' });
    }
    if (pedido.nfEmitida && Object.keys(req.body).some(campo => campo !== 'observacoes')) {
      return res.status(409).json({ message: 'Pedido faturado permite alterar somente observações' });
    }
    if (req.body.vinculo?.tipo && req.body.vinculo.tipo !== pedido.vinculo.tipo) {
      return res.status(409).json({ message: 'O tipo de vínculo não pode ser alterado' });
    }
    if (typeof req.body.numero === 'string') pedido.numero = req.body.numero;
    if (typeof req.body.observacoes === 'string') pedido.observacoes = req.body.observacoes;
    if (req.body.parceiroId !== undefined) pedido.parceiroId = req.body.parceiroId;
    if (req.body.valorRevenda !== undefined) pedido.valorRevenda = Number(req.body.valorRevenda);
    if (req.body.vinculo) {
      pedido.vinculo = { ...pedido.vinculo, ...req.body.vinculo, tipo: pedido.vinculo.tipo };
    }
    await pedido.save();
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
    if (pedido.status === 'Cancelado') {
      return res.status(409).json({ message: 'Pedido cancelado não pode avançar de etapa' });
    }

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

router.patch('/:id/protocolo', authenticate, authorize('admin', 'operador'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const protocolo = String(req.body.protocolo ?? '').trim();
    if (!protocolo) return res.status(400).json({ message: 'Protocolo é obrigatório' });
    const pedido = await PedidoModel.findById(req.params.id);
    if (!pedido) return res.status(404).json({ message: 'Pedido não encontrado' });
    if (pedido.status === 'Cancelado') return res.status(409).json({ message: 'Pedido cancelado não pode ser confirmado' });
    pedido.protocolo = protocolo;
    pedido.protocoloConfirmadoEm = new Date();
    pedido.saldoStatus = 'Confirmado';
    pedido.historicoEtapas.push({
      etapa: pedido.etapaOperacional,
      data: new Date(),
      usuarioId: req.user ? (req.user.id as unknown as import('mongoose').Types.ObjectId) : undefined,
      observacao: `Protocolo confirmado: ${protocolo}`,
    });
    await pedido.save();
    await registrarAuditoria({
      entidade: 'Pedido', entidadeId: pedido._id, acao: 'protocolo_clm_confirmado', origem: 'CLM',
      usuarioId: req.user ? (req.user.id as unknown as import('mongoose').Types.ObjectId) : undefined,
      detalhes: { protocolo },
    });
    res.json(pedido);
  } catch (error) { next(error); }
});

router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const pedido = await PedidoModel.findById(req.params.id);
    if (!pedido) return res.status(404).json({ message: 'Pedido não encontrado' });
    if (pedido.nfEmitida || pedido.saldoStatus === 'Confirmado') {
      return res.status(409).json({ message: 'Pedido confirmado/faturado exige solicitação de cancelamento com nota de crédito' });
    }
    if (pedido.status === 'Cancelado') {
      return res.json({ message: 'Pedido já estava cancelado', pedido });
    }
    pedido.status = 'Cancelado';
    pedido.saldoStatus = 'Estornado';
    await pedido.save();
    await registrarAuditoria({
      entidade: 'Pedido', entidadeId: pedido._id, acao: 'pedido_cancelado_reserva_estornada', origem: 'Painel',
      detalhes: { valor: pedido.valorTotal },
    });
    if (pedido.cupomId) {
      await estornarUsoCupom(pedido.cupomId as Types.ObjectId);
    }
    // Estornar saldo da nota de empenho
    if (pedido.notaEmpenhoId) {
      await estornarSaldoNotaEmpenho(pedido.notaEmpenhoId, pedido.valorTotal);
    }
    res.json({ message: 'Pedido cancelado', pedido });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/solicitar-cancelamento', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const pedido = await PedidoModel.findById(req.params.id);
    if (!pedido) return res.status(404).json({ message: 'Pedido não encontrado' });
    if (!pedido.nfEmitida && pedido.saldoStatus !== 'Confirmado') {
      return res.status(409).json({ message: 'Pedido apenas reservado deve ser cancelado pela operação normal' });
    }
    const existente = await NotaFiscalModel.findOne({ pedidoId: pedido._id, tipo: 'Credito' });
    if (existente) return res.json({ message: 'Cancelamento já solicitado', notaCredito: existente, pedido });
    const original = await NotaFiscalModel.findOne({ pedidoId: pedido._id, tipo: { $ne: 'Credito' } }).sort({ createdAt: -1 });
    const notaCredito = await NotaFiscalModel.create({
      numero: `NC-${String(await nextSeq('nota_credito')).padStart(6, '0')}`,
      pedidoId: pedido._id,
      valor: -Math.abs(pedido.valorTotal),
      emissor: original?.emissor ?? pedido.vinculo.emissorNF ?? 'XDigital',
      status: 'Pendente',
      tipo: 'Credito',
      notaOriginalId: original?._id,
      aprovacaoEstornoSaldo: 'Pendente',
      observacoes: String(req.body.motivo ?? 'Cancelamento solicitado — estorno de saldo sujeito à aprovação manual'),
    });
    pedido.status = 'Cancelado';
    await pedido.save();
    await registrarAuditoria({
      entidade: 'Pedido', entidadeId: pedido._id, acao: 'cancelamento_confirmado_solicitado', origem: 'Painel',
      detalhes: { notaCreditoId: String(notaCredito._id) },
    });
    res.status(201).json({ message: 'Cancelamento registrado; saldo aguarda aprovação', notaCredito, pedido });
  } catch (error) { next(error); }
});

router.post('/:id/aprovar-estorno', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const pedido = await PedidoModel.findById(req.params.id);
    if (!pedido) return res.status(404).json({ message: 'Pedido não encontrado' });
    const notaCredito = await NotaFiscalModel.findOne({
      pedidoId: pedido._id, tipo: 'Credito', aprovacaoEstornoSaldo: 'Pendente',
    });
    if (!notaCredito) return res.status(404).json({ message: 'Solicitação de estorno pendente não encontrada' });
    notaCredito.aprovacaoEstornoSaldo = 'Aprovado';
    notaCredito.status = 'Emitida';
    pedido.saldoStatus = 'Estornado';
    await Promise.all([notaCredito.save(), pedido.save()]);
    if (pedido.cupomId) await estornarUsoCupom(pedido.cupomId as Types.ObjectId);
    if (pedido.notaEmpenhoId) {
      await estornarSaldoNotaEmpenho(pedido.notaEmpenhoId, pedido.valorTotal);
    }
    await registrarAuditoria({
      entidade: 'Pedido', entidadeId: pedido._id, acao: 'estorno_saldo_aprovado', origem: 'Painel',
      detalhes: { notaCreditoId: String(notaCredito._id), valor: pedido.valorTotal },
    });
    res.json({ message: 'Estorno de saldo aprovado', notaCredito, pedido });
  } catch (error) { next(error); }
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
