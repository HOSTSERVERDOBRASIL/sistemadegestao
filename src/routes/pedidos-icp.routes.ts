import { Router } from 'express';
import mongoose from 'mongoose';
import { PedidoICPModel, StatusPedidoICP } from '../models/pedido-icp.model.js';
import { EstoqueItemModel } from '../models/estoque-item.model.js';
import { MovimentoEstoqueModel } from '../models/movimento-estoque.model.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { parsePage, parseLimit } from '../utils/query.js';

const router = Router();

const MIDIA_HARDWARE = new Set(['A3-Token', 'A3-Cartão']);

// ─── helpers ─────────────────────────────────────────────────────────────────

async function gerarNumero(): Promise<string> {
  const ano = new Date().getFullYear();
  const ultimo = await PedidoICPModel.findOne({ numero: new RegExp(`^ICP-${ano}-`) })
    .sort({ numero: -1 }).lean();
  let seq = 1;
  if (ultimo) {
    const parts = ultimo.numero.split('-');
    seq = (parseInt(parts[2], 10) || 0) + 1;
  }
  return `ICP-${ano}-${String(seq).padStart(4, '0')}`;
}

async function criarReserva(
  estoqueItemId: string,
  pedidoNumero: string,
  pedidoId: string,
  clienteNome: string | undefined,
  quantidade: number,
  responsavelId: string | undefined,
  responsavelNome: string | undefined,
  observacoes?: string,
) {
  const item = await EstoqueItemModel.findById(estoqueItemId);
  if (!item) throw new Error('Item de estoque não encontrado');
  const disponivel = item.quantidadeAtual - item.quantidadeReservada;
  if (disponivel < quantidade) {
    throw new Error(`Estoque insuficiente para reserva. Disponível: ${disponivel}`);
  }
  const mov = await MovimentoEstoqueModel.create({
    itemId: estoqueItemId,
    tipo: 'reserva',
    quantidade,
    pedidoId: new mongoose.Types.ObjectId(pedidoId),
    pedidoNumero,
    clienteNome,
    saldoAnterior: item.quantidadeAtual,
    saldoPosterior: item.quantidadeAtual,
    responsavelId: responsavelId ? new mongoose.Types.ObjectId(responsavelId) : undefined,
    responsavelNome,
    observacoes: observacoes ?? `Reserva automática para pedido ICP ${pedidoNumero}`,
    dataMovimento: new Date(),
  });
  await EstoqueItemModel.findByIdAndUpdate(estoqueItemId, {
    $inc: { quantidadeReservada: quantidade },
  });
  return mov;
}

async function concretizarSaida(
  estoqueItemId: string,
  pedidoNumero: string,
  pedidoId: string,
  clienteNome: string | undefined,
  quantidade: number,
  responsavelId: string | undefined,
  responsavelNome: string | undefined,
) {
  const item = await EstoqueItemModel.findById(estoqueItemId);
  if (!item) throw new Error('Item de estoque não encontrado');
  if (item.quantidadeReservada < quantidade) {
    throw new Error('Reserva não encontrada ou quantidade divergente');
  }
  const mov = await MovimentoEstoqueModel.create({
    itemId: estoqueItemId,
    tipo: 'entrega_reserva',
    quantidade,
    pedidoId: new mongoose.Types.ObjectId(pedidoId),
    pedidoNumero,
    clienteNome,
    saldoAnterior: item.quantidadeAtual,
    saldoPosterior: item.quantidadeAtual - quantidade,
    responsavelId: responsavelId ? new mongoose.Types.ObjectId(responsavelId) : undefined,
    responsavelNome,
    observacoes: `Saída automática — despacho pedido ICP ${pedidoNumero}`,
    dataMovimento: new Date(),
  });
  await EstoqueItemModel.findByIdAndUpdate(estoqueItemId, {
    $inc: { quantidadeAtual: -quantidade, quantidadeReservada: -quantidade },
  });
  return mov;
}

async function cancelarReserva(
  estoqueItemId: string,
  pedidoNumero: string,
  pedidoId: string,
  quantidade: number,
  responsavelId: string | undefined,
  responsavelNome: string | undefined,
) {
  const item = await EstoqueItemModel.findById(estoqueItemId);
  if (!item) return;
  const mov = await MovimentoEstoqueModel.create({
    itemId: estoqueItemId,
    tipo: 'cancelamento_reserva',
    quantidade,
    pedidoId: new mongoose.Types.ObjectId(pedidoId),
    pedidoNumero,
    saldoAnterior: item.quantidadeAtual,
    saldoPosterior: item.quantidadeAtual,
    responsavelId: responsavelId ? new mongoose.Types.ObjectId(responsavelId) : undefined,
    responsavelNome,
    observacoes: `Cancelamento de reserva — pedido ICP ${pedidoNumero} cancelado`,
    dataMovimento: new Date(),
  });
  await EstoqueItemModel.findByIdAndUpdate(estoqueItemId, {
    $inc: { quantidadeReservada: -Math.min(quantidade, item.quantidadeReservada) },
  });
  return mov;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

// GET /pedidos-icp
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, clienteId, midia } = req.query as Record<string, string>;
    const page = parsePage(req.query.page as string);
    const limit = parseLimit(req.query.limit as string, 20, 100);
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (clienteId) filter.clienteId = clienteId;
    if (midia) filter.midia = midia;

    const [data, total] = await Promise.all([
      PedidoICPModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      PedidoICPModel.countDocuments(filter),
    ]);
    res.json({ data, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (e) { next(e); }
});

// GET /pedidos-icp/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const p = await PedidoICPModel.findById(req.params.id);
    if (!p) return res.status(404).json({ message: 'Pedido não encontrado' });
    res.json(p);
  } catch (e) { next(e); }
});

// POST /pedidos-icp
router.post('/', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const {
      clienteId, clienteNome, tipoCert, midia, prazoAnos, quantidade,
      titularNome, titularCpfCnpj, titularEmail, titularTelefone,
      hardware, valorUnitario, valorTotal, observacoes,
    } = req.body;

    if (!clienteId || !tipoCert || !midia) {
      return res.status(400).json({ message: 'clienteId, tipoCert e midia são obrigatórios' });
    }

    const numero = await gerarNumero();
    const usuario = (req as any).user;
    const qtd = Number(quantidade) || 1;

    const pedido = await PedidoICPModel.create({
      numero,
      clienteId,
      clienteNome,
      tipoCert,
      midia,
      prazoAnos: Number(prazoAnos) || 1,
      quantidade: qtd,
      titularNome, titularCpfCnpj, titularEmail, titularTelefone,
      valorUnitario: valorUnitario ? Number(valorUnitario) : undefined,
      valorTotal: valorTotal ? Number(valorTotal) : undefined,
      status: 'Rascunho',
      responsavelId: usuario?.id,
      responsavelNome: usuario?.nome,
      observacoes,
      historico: [{ data: new Date(), status: 'Rascunho', usuarioId: usuario?.id, usuarioNome: usuario?.nome }],
    });

    // Se hardware, reservar estoque automaticamente
    if (MIDIA_HARDWARE.has(midia) && hardware?.estoqueItemId) {
      try {
        const mov = await criarReserva(
          hardware.estoqueItemId,
          numero,
          String(pedido._id),
          clienteNome,
          qtd,
          usuario?.id,
          usuario?.nome,
        );
        const estoqueItem = await EstoqueItemModel.findById(hardware.estoqueItemId).lean();
        await PedidoICPModel.findByIdAndUpdate(pedido._id, {
          hardware: {
            estoqueItemId: hardware.estoqueItemId,
            estoqueItemCodigo: estoqueItem?.codigo,
            estoqueItemNome: estoqueItem?.nome,
            estoqueMovimentoReservaId: mov._id,
            numeroSerie: hardware.numeroSerie,
            fabricante: estoqueItem?.fabricante ?? hardware.fabricante,
            modelo: estoqueItem?.modelo ?? hardware.modelo,
          },
        });
      } catch (estoqueErr: any) {
        // Pedido criado mas reserva falhou — retornar aviso
        const updated = await PedidoICPModel.findById(pedido._id);
        return res.status(201).json({
          ...updated?.toObject(),
          aviso: `Pedido criado, mas reserva de estoque falhou: ${estoqueErr.message}`,
        });
      }
    }

    const final = await PedidoICPModel.findById(pedido._id);
    res.status(201).json(final);
  } catch (e) { next(e); }
});

// PUT /pedidos-icp/:id — atualizar campos não-status
router.put('/:id', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { status, hardware, ...rest } = req.body;
    const updated = await PedidoICPModel.findByIdAndUpdate(req.params.id, rest, { new: true });
    if (!updated) return res.status(404).json({ message: 'Pedido não encontrado' });
    res.json(updated);
  } catch (e) { next(e); }
});

// PATCH /pedidos-icp/:id/status
router.patch('/:id/status', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { status, observacao } = req.body as { status: StatusPedidoICP; observacao?: string };
    const usuario = (req as any).user;

    const pedido = await PedidoICPModel.findById(req.params.id);
    if (!pedido) return res.status(404).json({ message: 'Pedido não encontrado' });

    const statusAnterior = pedido.status;

    // Ao despachar: concretizar saída de estoque (reserva → saída real)
    if (status === 'Despachado' && pedido.hardware?.estoqueItemId && !pedido.hardware.estoqueMovimentoSaidaId) {
      try {
        const mov = await concretizarSaida(
          String(pedido.hardware.estoqueItemId),
          pedido.numero,
          String(pedido._id),
          pedido.clienteNome,
          pedido.quantidade,
          usuario?.id,
          usuario?.nome,
        );
        pedido.hardware.estoqueMovimentoSaidaId = mov._id as mongoose.Types.ObjectId;
      } catch (estoqueErr: any) {
        return res.status(400).json({ message: `Não foi possível debitar estoque: ${estoqueErr.message}` });
      }
    }

    // Ao cancelar: liberar reserva (se não despachado ainda)
    if (status === 'Cancelado' && pedido.hardware?.estoqueItemId && !pedido.hardware.estoqueMovimentoSaidaId) {
      await cancelarReserva(
        String(pedido.hardware.estoqueItemId),
        pedido.numero,
        String(pedido._id),
        pedido.quantidade,
        usuario?.id,
        usuario?.nome,
      );
    }

    pedido.status = status;
    pedido.historico.push({
      data: new Date(),
      status,
      observacao,
      usuarioId: usuario?.id,
      usuarioNome: usuario?.nome,
    });
    await pedido.save();

    res.json(pedido);
  } catch (e) { next(e); }
});

// DELETE /pedidos-icp/:id — só Rascunho
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const pedido = await PedidoICPModel.findById(req.params.id);
    if (!pedido) return res.status(404).json({ message: 'Pedido não encontrado' });
    if (pedido.status !== 'Rascunho') {
      return res.status(400).json({ message: 'Apenas rascunhos podem ser excluídos' });
    }
    if (pedido.hardware?.estoqueItemId && pedido.hardware.estoqueMovimentoReservaId) {
      await cancelarReserva(
        String(pedido.hardware.estoqueItemId),
        pedido.numero,
        String(pedido._id),
        pedido.quantidade,
        (req as any).user?.id,
        (req as any).user?.nome,
      );
    }
    await pedido.deleteOne();
    res.json({ message: 'Excluído' });
  } catch (e) { next(e); }
});

export { router as pedidosICPRouter };
