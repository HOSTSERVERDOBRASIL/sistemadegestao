import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { TinySyncModel } from '../models/tiny-sync.model.js';
import { PedidoModel } from '../models/pedido.model.js';
import { ProdutoModel } from '../models/produto.model.js';
import { ClienteModel } from '../models/cliente.model.js';
import { broadcast } from '../services/events.service.js';
import { tinyAdapter } from '../services/tiny.service.js';

const router = Router();

// ─── Status geral da integração ───────────────────────────────────────────────
router.get('/status', authenticate, authorize('admin'), async (_req, res, next) => {
  try {
    const [total, sincronizados, erros, pendentes] = await Promise.all([
      TinySyncModel.countDocuments(),
      TinySyncModel.countDocuments({ status: 'sincronizado' }),
      TinySyncModel.countDocuments({ status: 'erro' }),
      TinySyncModel.countDocuments({ status: 'pendente' }),
    ]);
    res.json({
      configurado: !!process.env.TINY_TOKEN,
      stats: { total, sincronizados, erros, pendentes },
    });
  } catch (error) {
    next(error);
  }
});

// ─── Listar registros de sincronização ────────────────────────────────────────
router.get('/syncs', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { tipo, status, page = '1', limit = '20' } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = {};
    if (tipo) filter.tipo = tipo;
    if (status) filter.status = status;
    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      TinySyncModel.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      TinySyncModel.countDocuments(filter),
    ]);
    res.json({ data, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    next(error);
  }
});

// ─── Sincronizar produto local → Tiny ─────────────────────────────────────────
router.post('/produtos/:id/sincronizar', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const produto = await ProdutoModel.findById(req.params.id).lean();
    if (!produto) return res.status(404).json({ message: 'Produto não encontrado' });

    let syncRecord = await TinySyncModel.findOne({ tipo: 'produto', localId: produto._id });

    try {
      const result = await tinyAdapter.sincronizarProdutoTiny({
        codigo: produto.codigo,
        nome: produto.nome,
        preco: produto.preco,
        estoque: produto.estoque,
        descricao: produto.descricao,
      });

      if (syncRecord) {
        syncRecord.tinyId = result.id;
        syncRecord.status = 'sincronizado';
        syncRecord.erro = undefined;
        syncRecord.ultimaSync = new Date();
      } else {
        syncRecord = await TinySyncModel.create({
          tipo: 'produto',
          localId: produto._id,
          tinyId: result.id,
          status: 'sincronizado',
          ultimaSync: new Date(),
        });
      }
      await syncRecord.save();
      broadcast({ type: 'tiny_sync', payload: { tipo: 'produto', id: produto._id, status: 'sincronizado' } });
      res.json({ message: 'Produto sincronizado com Tiny', sync: syncRecord });
    } catch (err) {
      const erroMsg = err instanceof Error ? err.message : String(err);
      if (syncRecord) {
        syncRecord.status = 'erro';
        syncRecord.erro = erroMsg;
        await syncRecord.save();
      } else {
        syncRecord = await TinySyncModel.create({
          tipo: 'produto', localId: produto._id, status: 'erro', erro: erroMsg,
        });
      }
      res.status(502).json({ message: `Erro ao sincronizar com Tiny: ${erroMsg}`, sync: syncRecord });
    }
  } catch (error) {
    next(error);
  }
});

// ─── Sincronizar todos os produtos ────────────────────────────────────────────
router.post('/produtos/sincronizar-todos', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const produtos = await ProdutoModel.find({ ativo: true }).lean();
    const resultados: Array<{ id: string; status: string; erro?: string }> = [];

    for (const produto of produtos) {
      try {
        const result = await tinyAdapter.sincronizarProdutoTiny({
          codigo: produto.codigo,
          nome: produto.nome,
          preco: produto.preco,
          estoque: produto.estoque,
          descricao: produto.descricao,
        });
        await TinySyncModel.findOneAndUpdate(
          { tipo: 'produto', localId: produto._id },
          { tinyId: result.id, status: 'sincronizado', ultimaSync: new Date(), erro: undefined },
          { upsert: true, new: true }
        );
        resultados.push({ id: String(produto._id), status: 'sincronizado' });
      } catch (err) {
        const erroMsg = err instanceof Error ? err.message : String(err);
        await TinySyncModel.findOneAndUpdate(
          { tipo: 'produto', localId: produto._id },
          { status: 'erro', erro: erroMsg },
          { upsert: true }
        );
        resultados.push({ id: String(produto._id), status: 'erro', erro: erroMsg });
      }
    }

    res.json({ sincronizados: resultados.filter(r => r.status === 'sincronizado').length, erros: resultados.filter(r => r.status === 'erro').length, resultados });
  } catch (error) {
    next(error);
  }
});

// ─── Sincronizar pedido local → Tiny ──────────────────────────────────────────
router.post('/pedidos/:id/sincronizar', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const pedido = await PedidoModel.findById(req.params.id)
      .populate('clienteId', 'nome documento email')
      .populate('produtoId', 'codigo nome preco')
      .lean();

    if (!pedido) return res.status(404).json({ message: 'Pedido não encontrado' });

    const cliente = pedido.clienteId as unknown as { nome: string; documento: string; email?: string };
    const produto = pedido.produtoId as unknown as { codigo: string; nome: string; preco: number };

    let syncRecord = await TinySyncModel.findOne({ tipo: 'pedido', localId: pedido._id });

    try {
      // Se já existe no Tiny, apenas atualiza situação
      if (syncRecord?.tinyId) {
        const situacao = tinyAdapter.etapaParaSituacaoTiny(pedido.etapaOperacional);
        await tinyAdapter.atualizarSituacaoPedidoTiny(syncRecord.tinyId, situacao);
        syncRecord.status = 'sincronizado';
        syncRecord.ultimaSync = new Date();
        syncRecord.erro = undefined;
        await syncRecord.save();
        return res.json({ message: 'Situação do pedido atualizada no Tiny', sync: syncRecord });
      }

      // Cria novo pedido no Tiny
      const result = await tinyAdapter.criarPedidoTiny({
        numero: pedido.numero,
        data: new Date((pedido as unknown as { createdAt: Date }).createdAt).toISOString().slice(0, 10),
        clienteNome: cliente?.nome ?? '',
        clienteDocumento: cliente?.documento ?? '',
        clienteEmail: cliente?.email,
        itens: [{
          codigo: produto?.codigo ?? '',
          nome: produto?.nome ?? '',
          quantidade: 1,
          valor: pedido.valorTotal,
        }],
        observacoes: `Pedido ${pedido.numero} — vínculo ${pedido.vinculo.tipo}`,
      });

      if (syncRecord) {
        syncRecord.tinyId = result.id;
        syncRecord.tinyNumero = result.numero;
        syncRecord.status = 'sincronizado';
        syncRecord.ultimaSync = new Date();
        syncRecord.erro = undefined;
      } else {
        syncRecord = new TinySyncModel({
          tipo: 'pedido',
          localId: pedido._id,
          tinyId: result.id,
          tinyNumero: result.numero,
          status: 'sincronizado',
          ultimaSync: new Date(),
        });
      }
      await syncRecord.save();
      broadcast({ type: 'tiny_sync', payload: { tipo: 'pedido', id: pedido._id, status: 'sincronizado' } });
      res.json({ message: 'Pedido enviado para o Tiny', sync: syncRecord });
    } catch (err) {
      const erroMsg = err instanceof Error ? err.message : String(err);
      if (syncRecord) {
        syncRecord.status = 'erro';
        syncRecord.erro = erroMsg;
        await syncRecord.save();
      } else {
        syncRecord = await TinySyncModel.create({
          tipo: 'pedido', localId: pedido._id, status: 'erro', erro: erroMsg,
        });
      }
      res.status(502).json({ message: `Erro ao sincronizar pedido com Tiny: ${erroMsg}`, sync: syncRecord });
    }
  } catch (error) {
    next(error);
  }
});

// ─── Sincronizar cliente local → Tiny ─────────────────────────────────────────
router.post('/clientes/:id/sincronizar', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const cliente = await ClienteModel.findById(req.params.id).lean();
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado' });

    try {
      const result = await tinyAdapter.sincronizarClienteTiny({
        nome: cliente.nome,
        documento: cliente.documento,
        email: cliente.email,
        tipo: cliente.tipo as 'pessoa-fisica' | 'pessoa-juridica',
      });
      const sync = await TinySyncModel.findOneAndUpdate(
        { tipo: 'cliente', localId: cliente._id },
        { tinyId: result.id, status: 'sincronizado', ultimaSync: new Date(), erro: undefined },
        { upsert: true, new: true }
      );
      res.json({ message: 'Cliente sincronizado com Tiny', sync });
    } catch (err) {
      const erroMsg = err instanceof Error ? err.message : String(err);
      await TinySyncModel.findOneAndUpdate(
        { tipo: 'cliente', localId: cliente._id },
        { status: 'erro', erro: erroMsg },
        { upsert: true }
      );
      res.status(502).json({ message: `Erro ao sincronizar cliente: ${erroMsg}` });
    }
  } catch (error) {
    next(error);
  }
});

// ─── Importar produtos do Tiny ────────────────────────────────────────────────
router.post('/produtos/importar', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { pagina = 1 } = req.body as { pagina?: number };
    const produtosTiny = await tinyAdapter.listarProdutosTiny(pagina);
    const importados: string[] = [];
    const existentes: string[] = [];

    for (const tp of produtosTiny) {
      const existe = await ProdutoModel.findOne({ codigo: tp.codigo });
      if (existe) { existentes.push(tp.codigo); continue; }

      const novo = await ProdutoModel.create({
        codigo: tp.codigo,
        nome: tp.nome,
        preco: Number(tp.preco) || 0,
        estoque: Number(tp.estoque_atual) || 0,
        ativo: tp.situacao === 'A',
      });
      await TinySyncModel.findOneAndUpdate(
        { tipo: 'produto', localId: novo._id },
        { tinyId: tp.id, status: 'sincronizado', ultimaSync: new Date() },
        { upsert: true }
      );
      importados.push(tp.codigo);
    }

    res.json({
      message: `${importados.length} produto(s) importado(s), ${existentes.length} já existiam`,
      importados,
      existentes,
    });
  } catch (error) {
    next(error);
  }
});

// ─── Webhook Tiny → sistema ────────────────────────────────────────────────────
// Autenticação via header x-tiny-secret ou query ?secret=
router.post('/webhook/tiny', async (req, res, next) => {
  const tinySecret = process.env.TINY_WEBHOOK_SECRET;
  if (tinySecret) {
    const provided = req.headers['x-tiny-secret'] ?? req.query.secret;
    if (!provided || provided !== tinySecret) {
      return res.status(401).json({ message: 'Webhook não autorizado' });
    }
  }
  try {
    const payload = req.body as {
      dados?: string;
      tipo?: string;
    };

    if (!payload.dados) return res.json({ ok: true });

    let dados: Record<string, unknown>;
    try {
      dados = JSON.parse(payload.dados) as Record<string, unknown>;
    } catch {
      return res.json({ ok: true });
    }

    // Notificação de atualização de pedido
    if (payload.tipo === 'pedido' || dados.numero) {
      const numeroPedido = String(dados.numero ?? '');
      const situacao = String(dados.situacao ?? '');

      if (numeroPedido && situacao) {
        const syncRecord = await TinySyncModel.findOne({ tipo: 'pedido', tinyNumero: numeroPedido });
        if (syncRecord) {
          // Mapeia situação Tiny de volta para etapa operacional
          const situacaoParaEtapa: Record<string, string> = {
            'Aprovado': 'Validacao',
            'Preparando envio': 'Preparacao',
            'Pronto para envio': 'Preparacao',
            'Faturado': 'Processamento',
            'Enviado': 'Entrega',
            'Entregue': 'Conclusao',
          };
          const novaEtapa = situacaoParaEtapa[situacao];
          if (novaEtapa) {
            const pedido = await PedidoModel.findById(syncRecord.localId);
            if (pedido) {
              const etapas = ['Pedido', 'Pagamento', 'Validacao', 'Preparacao', 'Processamento', 'Entrega', 'Conclusao'];
              const idxAtual = etapas.indexOf(pedido.etapaOperacional);
              const idxNova = etapas.indexOf(novaEtapa);
              if (idxNova > idxAtual) {
                pedido.etapaOperacional = novaEtapa as typeof pedido.etapaOperacional;
                pedido.historicoEtapas.push({
                  etapa: novaEtapa as typeof pedido.etapaOperacional,
                  data: new Date(),
                  observacao: `Atualizado automaticamente via webhook Tiny (${situacao})`,
                });
                await pedido.save();
                broadcast({
                  type: 'etapa_atualizada',
                  payload: { pedidoId: pedido._id, etapa: novaEtapa, origem: 'tiny' },
                });
              }
            }
          }
        }
      }
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

export { router as tinyRouter };
