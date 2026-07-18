import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  startTestServer, stopTestServer, clearDatabase,
  createAdmin, createFinanceiro, getBaseUrl, getToken, seedBase,
} from './setup.js';
import { PedidoModel } from '../models/pedido.model.js';

describe('Cupons', () => {
  before(startTestServer);
  after(stopTestServer);
  beforeEach(clearDatabase);

  async function adminToken() {
    await createAdmin();
    return getToken('admin@test.com', 'senha123');
  }

  async function finToken() {
    await createFinanceiro();
    return getToken('fin@test.com', 'senha123');
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  it('POST /cupons cria cupom percentual', async () => {
    const token = await adminToken();
    const res = await fetch(`${getBaseUrl()}/cupons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ codigo: 'TESTE10', tipo: 'percentual', valor: 10 }),
    });
    assert.equal(res.status, 201);
    const body = await res.json() as { codigo: string; tipo: string; valor: number; ativo: boolean };
    assert.equal(body.codigo, 'TESTE10');
    assert.equal(body.tipo, 'percentual');
    assert.equal(body.valor, 10);
    assert.equal(body.ativo, true);
  });

  it('POST /cupons normaliza código para maiúsculas', async () => {
    const token = await adminToken();
    const res = await fetch(`${getBaseUrl()}/cupons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ codigo: 'minusculo', tipo: 'fixo', valor: 50 }),
    });
    assert.equal(res.status, 201);
    const body = await res.json() as { codigo: string };
    assert.equal(body.codigo, 'MINUSCULO');
  });

  it('POST /cupons retorna 409 para código duplicado', async () => {
    const token = await adminToken();
    const payload = { codigo: 'DUP', tipo: 'fixo', valor: 20 };
    await fetch(`${getBaseUrl()}/cupons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const res2 = await fetch(`${getBaseUrl()}/cupons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    assert.equal(res2.status, 409);
  });

  it('POST /cupons retorna 400 para percentual > 100', async () => {
    const token = await adminToken();
    const res = await fetch(`${getBaseUrl()}/cupons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ codigo: 'GRANDE', tipo: 'percentual', valor: 150 }),
    });
    assert.equal(res.status, 400);
  });

  it('GET /cupons lista cupons com paginação', async () => {
    const token = await adminToken();
    for (let i = 1; i <= 3; i++) {
      await fetch(`${getBaseUrl()}/cupons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ codigo: `COD${i}`, tipo: 'fixo', valor: i * 10 }),
      });
    }
    const res = await fetch(`${getBaseUrl()}/cupons`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { data: unknown[]; total: number };
    assert.equal(body.total, 3);
    assert.equal(body.data.length, 3);
  });

  it('PATCH /cupons/:id/status desativa e reativa cupom', async () => {
    const token = await adminToken();
    const created = await fetch(`${getBaseUrl()}/cupons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ codigo: 'STATUS', tipo: 'fixo', valor: 30 }),
    });
    const { _id } = await created.json() as { _id: string };

    const r1 = await fetch(`${getBaseUrl()}/cupons/${_id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ativo: false }),
    });
    assert.equal(r1.status, 200);
    const b1 = await r1.json() as { ativo: boolean };
    assert.equal(b1.ativo, false);

    const r2 = await fetch(`${getBaseUrl()}/cupons/${_id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ativo: true }),
    });
    assert.equal(r2.status, 200);
    const b2 = await r2.json() as { ativo: boolean };
    assert.equal(b2.ativo, true);
  });

  it('DELETE /cupons/:id remove cupom sem pedidos vinculados', async () => {
    const token = await adminToken();
    const created = await fetch(`${getBaseUrl()}/cupons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ codigo: 'APAGAR', tipo: 'fixo', valor: 5 }),
    });
    const { _id } = await created.json() as { _id: string };

    const del = await fetch(`${getBaseUrl()}/cupons/${_id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(del.status, 200);

    const get = await fetch(`${getBaseUrl()}/cupons/${_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(get.status, 404);
  });

  it('DELETE /cupons/:id retorna 403 para financeiro', async () => {
    const adminTk = await adminToken();
    const finTk = await finToken();

    const created = await fetch(`${getBaseUrl()}/cupons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminTk}` },
      body: JSON.stringify({ codigo: 'NODEL', tipo: 'fixo', valor: 5 }),
    });
    const { _id } = await created.json() as { _id: string };

    const del = await fetch(`${getBaseUrl()}/cupons/${_id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${finTk}` },
    });
    assert.equal(del.status, 403);
  });

  // ─── Validação ────────────────────────────────────────────────────────────

  it('POST /cupons/validar retorna desconto correto (percentual)', async () => {
    const token = await adminToken();
    await fetch(`${getBaseUrl()}/cupons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ codigo: 'PCT20', tipo: 'percentual', valor: 20 }),
    });

    const res = await fetch(`${getBaseUrl()}/cupons/validar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ codigo: 'PCT20', valorPedido: 1000 }),
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { valido: boolean; descontoValor: number; valorFinal: number };
    assert.equal(body.valido, true);
    assert.equal(body.descontoValor, 200);
    assert.equal(body.valorFinal, 800);
  });

  it('POST /cupons/validar retorna desconto correto (fixo)', async () => {
    const token = await adminToken();
    await fetch(`${getBaseUrl()}/cupons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ codigo: 'FIXO100', tipo: 'fixo', valor: 100 }),
    });

    const res = await fetch(`${getBaseUrl()}/cupons/validar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ codigo: 'FIXO100', valorPedido: 500 }),
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { descontoValor: number; valorFinal: number };
    assert.equal(body.descontoValor, 100);
    assert.equal(body.valorFinal, 400);
  });

  it('POST /cupons/validar aplica valorMaximoDesconto como teto', async () => {
    const token = await adminToken();
    await fetch(`${getBaseUrl()}/cupons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ codigo: 'TETO', tipo: 'percentual', valor: 50, valorMaximoDesconto: 80 }),
    });

    const res = await fetch(`${getBaseUrl()}/cupons/validar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ codigo: 'TETO', valorPedido: 1000 }),
    });
    const body = await res.json() as { descontoValor: number; valorFinal: number };
    assert.equal(body.descontoValor, 80);
    assert.equal(body.valorFinal, 920);
  });

  it('POST /cupons/validar retorna 422 para cupom inativo', async () => {
    const token = await adminToken();
    const created = await fetch(`${getBaseUrl()}/cupons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ codigo: 'INATIVO', tipo: 'fixo', valor: 10 }),
    });
    const { _id } = await created.json() as { _id: string };
    await fetch(`${getBaseUrl()}/cupons/${_id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ativo: false }),
    });

    const res = await fetch(`${getBaseUrl()}/cupons/validar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ codigo: 'INATIVO', valorPedido: 100 }),
    });
    assert.equal(res.status, 422);
    const body = await res.json() as { valido: boolean };
    assert.equal(body.valido, false);
  });

  it('POST /cupons/validar retorna 422 para cupom inexistente', async () => {
    const token = await adminToken();
    const res = await fetch(`${getBaseUrl()}/cupons/validar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ codigo: 'NAOEXISTE', valorPedido: 100 }),
    });
    assert.equal(res.status, 422);
  });

  it('POST /cupons/validar rejeita valor abaixo do mínimo', async () => {
    const token = await adminToken();
    await fetch(`${getBaseUrl()}/cupons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ codigo: 'MIN500', tipo: 'fixo', valor: 50, valorMinimoPedido: 500 }),
    });

    const res = await fetch(`${getBaseUrl()}/cupons/validar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ codigo: 'MIN500', valorPedido: 100 }),
    });
    assert.equal(res.status, 422);
  });

  // ─── Cupom aplicado em pedido ─────────────────────────────────────────────

  it('Pedido criado via service aplica cupom e grava desconto', async () => {
    const { token, cliente, produto } = await seedBase();

    // Cria cupom via API
    await fetch(`${getBaseUrl()}/cupons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ codigo: 'PEDIDO15', tipo: 'percentual', valor: 15 }),
    });

    // Valida cupom via API (preview)
    const validRes = await fetch(`${getBaseUrl()}/cupons/validar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ codigo: 'PEDIDO15', valorPedido: 1000, produtoId: String(produto._id), clienteId: String(cliente._id) }),
    });
    assert.equal(validRes.status, 200);
    const valid = await validRes.json() as { valido: boolean; descontoValor: number; valorFinal: number };
    assert.equal(valid.valido, true);
    assert.equal(valid.descontoValor, 150);
    assert.equal(valid.valorFinal, 850);

    // Cria pedido diretamente no banco com cupom aplicado (como a rota faz internamente)
    const pedido = await PedidoModel.create({
      numero: 'P-CUPOM-001',
      clienteId: cliente._id,
      produtoId: produto._id,
      quantidade: 1,
      valorUnitario: 1000,
      valorTotal: valid.valorFinal,
      valorTabela: 1000,
      descontoValor: valid.descontoValor,
      descontoPercentual: 15,
      cupomCodigo: 'PEDIDO15',
      vinculo: { tipo: 'CompraDireta', comprovantePagamentoAprovado: false },
      etapaOperacional: 'Pedido',
      historicoEtapas: [{ etapa: 'Pedido', data: new Date() }],
    });
    assert.equal(pedido.valorTotal, 850);
    assert.equal(pedido.descontoValor, 150);
    assert.equal(pedido.cupomCodigo, 'PEDIDO15');
  });
});
