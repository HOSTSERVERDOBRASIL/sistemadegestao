import { Router } from 'express';
import { PedidoCompraModel, StatusPedidoCompra } from '../models/pedido-compra.model.js';
import { EstoqueItemModel } from '../models/estoque-item.model.js';
import { MovimentoEstoqueModel } from '../models/movimento-estoque.model.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { parsePage, parseLimit } from '../utils/query.js';

const router = Router();

async function gerarNumero(): Promise<string> {
  const ano = new Date().getFullYear();
  const ultimo = await PedidoCompraModel.findOne({ numero: new RegExp(`^COMPRA-${ano}-`) })
    .sort({ numero: -1 }).lean();
  let seq = 1;
  if (ultimo) {
    const parts = ultimo.numero.split('-');
    seq = (parseInt(parts[2], 10) || 0) + 1;
  }
  return `COMPRA-${ano}-${String(seq).padStart(4, '0')}`;
}

// GET /pedidos-compra
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status } = req.query as Record<string, string>;
    const page = parsePage(req.query.page as string);
    const limit = parseLimit(req.query.limit as string, 20, 100);
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;

    const [data, total] = await Promise.all([
      PedidoCompraModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      PedidoCompraModel.countDocuments(filter),
    ]);
    res.json({ data, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (e) { next(e); }
});

// GET /pedidos-compra/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const p = await PedidoCompraModel.findById(req.params.id);
    if (!p) return res.status(404).json({ message: 'Pedido não encontrado' });
    res.json(p);
  } catch (e) { next(e); }
});

// POST /pedidos-compra
router.post('/', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { fornecedor, fornecedorCnpj, itens, dataPrevisaoEntrega, observacoes } = req.body;
    if (!fornecedor) return res.status(400).json({ message: 'Fornecedor é obrigatório' });
    if (!itens || !Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ message: 'Informe ao menos um item' });
    }

    // Buscar dados dos itens de estoque e calcular totais
    const itensCompletos = await Promise.all(itens.map(async (item: any) => {
      const estoqueItem = await EstoqueItemModel.findById(item.estoqueItemId).lean();
      if (!estoqueItem) throw new Error(`Item de estoque não encontrado: ${item.estoqueItemId}`);
      const qtd = Number(item.quantidade);
      const custo = Number(item.custoUnitario) || estoqueItem.custoUnitario;
      return {
        estoqueItemId: estoqueItem._id,
        estoqueItemCodigo: estoqueItem.codigo,
        estoqueItemNome: estoqueItem.nome,
        quantidade: qtd,
        quantidadeRecebida: 0,
        custoUnitario: custo,
        custoTotal: qtd * custo,
      };
    }));

    const valorTotal = itensCompletos.reduce((s, i) => s + i.custoTotal, 0);
    const numero = await gerarNumero();
    const usuario = (req as any).user;

    const pedido = await PedidoCompraModel.create({
      numero, fornecedor, fornecedorCnpj,
      itens: itensCompletos,
      valorTotal,
      status: 'Rascunho',
      dataPrevisaoEntrega: dataPrevisaoEntrega ? new Date(dataPrevisaoEntrega) : undefined,
      observacoes,
      responsavelId: usuario?.id,
      responsavelNome: usuario?.nome,
      historico: [{ data: new Date(), status: 'Rascunho', usuarioId: usuario?.id, usuarioNome: usuario?.nome }],
    });

    res.status(201).json(pedido);
  } catch (e) { next(e); }
});

// PATCH /pedidos-compra/:id/status
router.patch('/:id/status', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { status, observacao } = req.body as { status: StatusPedidoCompra; observacao?: string };
    const usuario = (req as any).user;
    const pedido = await PedidoCompraModel.findById(req.params.id);
    if (!pedido) return res.status(404).json({ message: 'Pedido não encontrado' });

    if (status === 'Aprovado') {
      pedido.aprovadoPorId = usuario?.id;
      pedido.aprovadoPorNome = usuario?.nome;
    }

    pedido.status = status;
    pedido.historico.push({ data: new Date(), status, observacao, usuarioId: usuario?.id, usuarioNome: usuario?.nome });
    await pedido.save();
    res.json(pedido);
  } catch (e) { next(e); }
});

// PATCH /pedidos-compra/:id/receber — registra recebimento e dá entrada no estoque
router.patch('/:id/receber', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { itensRecebidos, notaFiscalFornecedor, observacao } = req.body as {
      itensRecebidos: Array<{ estoqueItemId: string; quantidadeRecebida: number; numerosSerie?: string[] }>;
      notaFiscalFornecedor?: string;
      observacao?: string;
    };
    const usuario = (req as any).user;

    const pedido = await PedidoCompraModel.findById(req.params.id);
    if (!pedido) return res.status(404).json({ message: 'Pedido não encontrado' });
    if (pedido.status === 'Cancelado' || pedido.status === 'Recebido') {
      return res.status(400).json({ message: `Pedido já está ${pedido.status}` });
    }
    if (!['Aprovado', 'Pedido Enviado', 'Parcialmente Recebido'].includes(pedido.status)) {
      return res.status(400).json({ message: 'Pedido precisa estar Aprovado ou Enviado para registrar recebimento' });
    }

    if (!itensRecebidos || itensRecebidos.length === 0) {
      return res.status(400).json({ message: 'Informe os itens recebidos' });
    }

    // Processar cada item recebido
    const erros: string[] = [];
    for (const rec of itensRecebidos) {
      const itemPedido = pedido.itens.find(i => String(i.estoqueItemId) === rec.estoqueItemId);
      if (!itemPedido) { erros.push(`Item ${rec.estoqueItemId} não encontrado no pedido`); continue; }

      const qtdRestante = itemPedido.quantidade - itemPedido.quantidadeRecebida;
      const qtdReceber = Math.min(Number(rec.quantidadeRecebida), qtdRestante);
      if (qtdReceber <= 0) continue;

      // Entrada no estoque
      const estoqueItem = await EstoqueItemModel.findById(rec.estoqueItemId);
      if (!estoqueItem) { erros.push(`Item de estoque ${rec.estoqueItemId} não encontrado`); continue; }

      const saldoAnterior = estoqueItem.quantidadeAtual;
      const saldoPosterior = saldoAnterior + qtdReceber;

      await MovimentoEstoqueModel.create({
        itemId: rec.estoqueItemId,
        tipo: 'entrada_compra',
        quantidade: qtdReceber,
        numerosSerie: rec.numerosSerie ?? [],
        lote: pedido.numero,
        pedidoNumero: pedido.numero,
        custoUnitario: itemPedido.custoUnitario,
        custoTotal: qtdReceber * itemPedido.custoUnitario,
        notaFiscalFornecedor: notaFiscalFornecedor || pedido.notaFiscalFornecedor,
        saldoAnterior,
        saldoPosterior,
        responsavelId: usuario?.id,
        responsavelNome: usuario?.nome,
        observacoes: observacao ?? `Recebimento pedido de compra ${pedido.numero}`,
        dataMovimento: new Date(),
      });

      await EstoqueItemModel.findByIdAndUpdate(rec.estoqueItemId, {
        $inc: { quantidadeAtual: qtdReceber },
        custoUnitario: itemPedido.custoUnitario,
      });

      itemPedido.quantidadeRecebida += qtdReceber;
    }

    // Atualizar NF e status do pedido
    if (notaFiscalFornecedor) pedido.notaFiscalFornecedor = notaFiscalFornecedor;

    const totalPedido = pedido.itens.reduce((s, i) => s + i.quantidade, 0);
    const totalRecebido = pedido.itens.reduce((s, i) => s + i.quantidadeRecebida, 0);
    const novoStatus: StatusPedidoCompra = totalRecebido >= totalPedido ? 'Recebido' : 'Parcialmente Recebido';

    pedido.status = novoStatus;
    pedido.historico.push({
      data: new Date(),
      status: novoStatus,
      observacao: observacao ?? `Recebidos ${totalRecebido}/${totalPedido} itens`,
      usuarioId: usuario?.id,
      usuarioNome: usuario?.nome,
    });
    await pedido.save();

    res.json({ pedido, erros: erros.length ? erros : undefined });
  } catch (e) { next(e); }
});

// DELETE /pedidos-compra/:id — só Rascunho
router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const pedido = await PedidoCompraModel.findById(req.params.id);
    if (!pedido) return res.status(404).json({ message: 'Pedido não encontrado' });
    if (pedido.status !== 'Rascunho') return res.status(400).json({ message: 'Apenas rascunhos podem ser excluídos' });
    await pedido.deleteOne();
    res.json({ message: 'Excluído' });
  } catch (e) { next(e); }
});

export { router as pedidosCompraRouter };
