import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  startTestServer, stopTestServer, clearDatabase,
  getBaseUrl, seedBase, createAdmin, createFinanceiro, getToken, criarPedidoTeste,
} from './setup.js';
import { ProdutoModel } from '../models/produto.model.js';
import { tinyAdapter } from '../services/tiny.service.js';
import { TinySyncModel } from '../models/tiny-sync.model.js';

let sincronizarProdutoCalls = 0;
let criarPedidoCalls = 0;

function stubTiny() {
  tinyAdapter.sincronizarProdutoTiny = async () => {
    sincronizarProdutoCalls++;
    return { id: 'tiny-prod-001' };
  };
  tinyAdapter.criarPedidoTiny = async () => {
    criarPedidoCalls++;
    return { id: 'tiny-ped-001', numero: 'T-001' };
  };
  tinyAdapter.atualizarSituacaoPedidoTiny = async () => undefined;
  tinyAdapter.listarProdutosTiny = async () => [
    { id: 'ext-1', codigo: 'SSL-EXT', nome: 'SSL Externo', preco: '199.00', estoque_atual: '50', situacao: 'A' },
  ];
  tinyAdapter.sincronizarClienteTiny = async () => ({ id: 'tiny-cli-001' });
  tinyAdapter.etapaParaSituacaoTiny = (etapa: string) => {
    const map: Record<string, string> = {
      Pedido: 'Em andamento', Pagamento: 'Aprovado', Validacao: 'Aprovado',
      Preparacao: 'Preparando envio', Processamento: 'Faturado',
      Entrega: 'Enviado', Conclusao: 'Entregue',
    };
    return map[etapa] as ReturnType<typeof tinyAdapter.etapaParaSituacaoTiny>;
  };
}

describe('Integração Tiny', () => {
  before(async () => {
    stubTiny();
    await startTestServer();
  });
  after(stopTestServer);
  beforeEach(() => {
    sincronizarProdutoCalls = 0;
    criarPedidoCalls = 0;
    return clearDatabase();
  });

  it('GET /tiny/status retorna configurado=false sem TINY_TOKEN', async () => {
    const saved = process.env.TINY_TOKEN;
    delete process.env.TINY_TOKEN;

    await createAdmin();
    const token = await getToken('admin@test.com', 'senha123');
    const res = await fetch(`${getBaseUrl()}/tiny/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { configurado: boolean };
    assert.equal(body.configurado, false);

    if (saved) process.env.TINY_TOKEN = saved;
  });

  it('GET /tiny/status retorna configurado=true com TINY_TOKEN', async () => {
    process.env.TINY_TOKEN = 'test-token-fake';
    await createAdmin();
    const token = await getToken('admin@test.com', 'senha123');
    const res = await fetch(`${getBaseUrl()}/tiny/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { configurado: boolean; stats: Record<string, number> };
    assert.equal(body.configurado, true);
    assert.ok('total' in body.stats);
  });

  it('POST /tiny/produtos/:id/sincronizar cria registro de sync com status sincronizado', async () => {
    process.env.TINY_TOKEN = 'test-token-fake';
    await createAdmin();
    const token = await getToken('admin@test.com', 'senha123');

    const produto = await ProdutoModel.create({
      codigo: 'SSL-TEST', nome: 'SSL Teste', preco: 200, estoque: 10,
    });

    const res = await fetch(`${getBaseUrl()}/tiny/produtos/${produto._id}/sincronizar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { sync: { status: string; tinyId: string } };
    assert.equal(body.sync.status, 'sincronizado');
    assert.equal(body.sync.tinyId, 'tiny-prod-001');
    assert.equal(sincronizarProdutoCalls, 1);
  });

  it('POST /tiny/produtos/:id/sincronizar retorna 404 para produto inexistente', async () => {
    process.env.TINY_TOKEN = 'test-token-fake';
    await createAdmin();
    const token = await getToken('admin@test.com', 'senha123');
    const res = await fetch(`${getBaseUrl()}/tiny/produtos/000000000000000000000000/sincronizar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 404);
  });

  it('POST /tiny/pedidos/:id/sincronizar cria pedido no Tiny', async () => {
    process.env.TINY_TOKEN = 'test-token-fake';
    const { token, cliente, produto } = await seedBase();

    const pedido = await criarPedidoTeste(cliente._id, produto._id, 500);

    const res = await fetch(`${getBaseUrl()}/tiny/pedidos/${pedido._id}/sincronizar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { sync: { status: string; tinyId: string } };
    assert.equal(body.sync.status, 'sincronizado');
    assert.equal(body.sync.tinyId, 'tiny-ped-001');
    assert.equal(criarPedidoCalls, 1);
  });

  it('POST /tiny/produtos/importar importa produto novo do Tiny', async () => {
    process.env.TINY_TOKEN = 'test-token-fake';
    await createAdmin();
    const token = await getToken('admin@test.com', 'senha123');

    const res = await fetch(`${getBaseUrl()}/tiny/produtos/importar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pagina: 1 }),
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { importados: string[]; existentes: string[] };
    assert.ok(Array.isArray(body.importados));
    assert.ok(Array.isArray(body.existentes));
    assert.ok(
      body.importados.includes('SSL-EXT') || body.existentes.includes('SSL-EXT'),
      'produto SSL-EXT deve ter sido importado ou já existir'
    );
  });

  it('POST /tiny/webhook/tiny avança etapa ao receber situação "Enviado"', async () => {
    const { token, cliente, produto } = await seedBase();

    const pedido = await criarPedidoTeste(cliente._id, produto._id, 300);

    for (const etapa of ['Pagamento', 'Validacao', 'Preparacao', 'Processamento']) {
      await fetch(`${getBaseUrl()}/pedidos/${pedido._id}/etapa`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ etapa }),
      });
    }

    // Cria registro de sync como se o pedido já tivesse sido enviado ao Tiny
    await TinySyncModel.create({
      tipo: 'pedido',
      localId: pedido._id,
      tinyId: 'tiny-ped-webhook-001',
      tinyNumero: pedido.numero,
      status: 'sincronizado',
      ultimaSync: new Date(),
    });

    const webhookRes = await fetch(`${getBaseUrl()}/tiny/webhook/tiny`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: 'pedido',
        dados: JSON.stringify({ numero: pedido.numero, situacao: 'Enviado' }),
      }),
    });
    assert.equal(webhookRes.status, 200);

    const pedidoAtualRes = await fetch(`${getBaseUrl()}/pedidos/${pedido._id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const p = await pedidoAtualRes.json() as { etapaOperacional: string };
    assert.equal(p.etapaOperacional, 'Entrega');
  });

  it('GET /tiny/syncs retorna 401 sem token', async () => {
    const res = await fetch(`${getBaseUrl()}/tiny/syncs`);
    assert.equal(res.status, 401);
  });

  it('GET /tiny/status retorna 403 para financeiro', async () => {
    await createAdmin();
    await createFinanceiro();
    const finToken = await getToken('fin@test.com', 'senha123');
    const res = await fetch(`${getBaseUrl()}/tiny/status`, {
      headers: { Authorization: `Bearer ${finToken}` },
    });
    assert.equal(res.status, 403);
  });
});
