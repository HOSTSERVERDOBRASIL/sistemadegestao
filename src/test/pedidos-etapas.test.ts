import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, clearDatabase, seedBase, getBaseUrl } from './setup.js';

describe('Fluxo de etapas operacionais', () => {
  before(startTestServer);
  after(stopTestServer);
  beforeEach(clearDatabase);

  async function criarPedido(token: string, clienteId: string, produtoId: string, numero = 'PE-001') {
    const res = await fetch(`${getBaseUrl()}/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        numero,
        clienteId,
        produtoId,
        valorTotal: 1000,
        valorTabela: 1000,
        vinculo: { tipo: 'CompraDireta' },
      }),
    });
    return (await res.json() as { _id: string; etapaOperacional: string });
  }

  it('pedido criado começa na etapa Pedido', async () => {
    const { token, cliente, produto } = await seedBase();
    const pedido = await criarPedido(token, String(cliente._id), String(produto._id));
    assert.equal(pedido.etapaOperacional, 'Pedido');
  });

  it('avança etapa em ordem correta e grava histórico', async () => {
    const { token, cliente, produto } = await seedBase();
    const pedido = await criarPedido(token, String(cliente._id), String(produto._id));

    const res = await fetch(`${getBaseUrl()}/pedidos/${pedido._id}/etapa`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ etapa: 'Pagamento', observacao: 'Pago via boleto' }),
    });
    assert.equal(res.status, 200);
    const atualizado = await res.json() as { etapaOperacional: string; historicoEtapas: { etapa: string; observacao: string }[]; status: string };
    assert.equal(atualizado.etapaOperacional, 'Pagamento');
    assert.equal(atualizado.status, 'Em processo');

    const ultimo = atualizado.historicoEtapas[atualizado.historicoEtapas.length - 1];
    assert.equal(ultimo.etapa, 'Pagamento');
    assert.equal(ultimo.observacao, 'Pago via boleto');
  });

  it('avança do início direto para Preparacao (pulo de etapas permitido)', async () => {
    const { token, cliente, produto } = await seedBase();
    const pedido = await criarPedido(token, String(cliente._id), String(produto._id));

    const res = await fetch(`${getBaseUrl()}/pedidos/${pedido._id}/etapa`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ etapa: 'Preparacao' }),
    });
    assert.equal(res.status, 200);
  });

  it('avançar para Conclusao muda status para Concluido', async () => {
    const { token, cliente, produto } = await seedBase();
    const pedido = await criarPedido(token, String(cliente._id), String(produto._id));

    const res = await fetch(`${getBaseUrl()}/pedidos/${pedido._id}/etapa`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ etapa: 'Conclusao' }),
    });
    const body = await res.json() as { status: string };
    assert.equal(body.status, 'Concluido');
  });

  it('rejeita regressão de etapa (409)', async () => {
    const { token, cliente, produto } = await seedBase();
    const pedido = await criarPedido(token, String(cliente._id), String(produto._id));

    // Avança para Processamento
    await fetch(`${getBaseUrl()}/pedidos/${pedido._id}/etapa`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ etapa: 'Processamento' }),
    });

    // Tenta regredir para Pagamento
    const res = await fetch(`${getBaseUrl()}/pedidos/${pedido._id}/etapa`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ etapa: 'Pagamento' }),
    });
    assert.equal(res.status, 409);
  });

  it('rejeita etapa inválida (400)', async () => {
    const { token, cliente, produto } = await seedBase();
    const pedido = await criarPedido(token, String(cliente._id), String(produto._id));

    const res = await fetch(`${getBaseUrl()}/pedidos/${pedido._id}/etapa`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ etapa: 'EtapaFantasia' }),
    });
    assert.equal(res.status, 400);
  });

  it('etapa atual como nova etapa retorna 409 (não avança)', async () => {
    const { token, cliente, produto } = await seedBase();
    const pedido = await criarPedido(token, String(cliente._id), String(produto._id));

    const res = await fetch(`${getBaseUrl()}/pedidos/${pedido._id}/etapa`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ etapa: 'Pedido' }),
    });
    assert.equal(res.status, 409);
  });
});
