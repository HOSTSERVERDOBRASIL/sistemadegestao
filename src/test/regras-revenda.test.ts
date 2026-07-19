import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clearDatabase, getBaseUrl, seedBase, startTestServer, stopTestServer } from './setup.js';

describe('Regras de cobrança por revenda', () => {
  before(startTestServer);
  after(stopTestServer);
  beforeEach(clearDatabase);

  it('aplica a regra global e permite uma regra personalizada por revenda', async () => {
    const { token, parceiro } = await seedBase();
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    const config = await fetch(`${getBaseUrl()}/configuracoes/revendas`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        REVENDAS_FORMA_PAGAMENTO_PADRAO: 'Pos-pago',
        REVENDAS_COBRANCA_INTERNACIONAL: 'Fatura mensal',
        REVENDAS_COBRANCA_ICP_BRASIL: 'Por emissao',
        REVENDAS_DIA_VENCIMENTO: '15',
        REVENDAS_LIMITE_CREDITO_PADRAO: '5000.00',
      }),
    });
    assert.equal(config.status, 200);

    const regraGlobal = await fetch(`${getBaseUrl()}/parceiros/${parceiro._id}/regras-cobranca`, { headers });
    assert.equal(regraGlobal.status, 200);
    assert.deepEqual(await regraGlobal.json(), {
      origem: 'padrao',
      regras: {
        formaPagamento: 'Pos-pago',
        certificadosInternacionais: 'Fatura mensal',
        certificadosIcpBrasil: 'Por emissao',
        diaVencimento: 15,
        limiteCredito: 5000,
      },
    });

    const update = await fetch(`${getBaseUrl()}/parceiros/${parceiro._id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        usarRegraCobrancaPadrao: false,
        regrasCobranca: {
          formaPagamento: 'Pre-pago',
          certificadosInternacionais: 'Por pedido',
          certificadosIcpBrasil: 'Fatura mensal',
          diaVencimento: 8,
          limiteCredito: 1200,
        },
      }),
    });
    assert.equal(update.status, 200);

    const regraRevenda = await fetch(`${getBaseUrl()}/parceiros/${parceiro._id}/regras-cobranca`, { headers });
    assert.equal(regraRevenda.status, 200);
    assert.deepEqual(await regraRevenda.json(), {
      origem: 'revenda',
      regras: {
        formaPagamento: 'Pre-pago',
        certificadosInternacionais: 'Por pedido',
        certificadosIcpBrasil: 'Fatura mensal',
        diaVencimento: 8,
        limiteCredito: 1200,
      },
    });
  });

  it('exige recarga antes do pedido pré-pago, consome e estorna os créditos', async () => {
    const { token, parceiro, cliente, produto } = await seedBase();
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    await fetch(`${getBaseUrl()}/configuracoes/revendas`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ REVENDAS_FORMA_PAGAMENTO_PADRAO: 'Pre-pago' }),
    });
    await fetch(`${getBaseUrl()}/parceiros/${parceiro._id}/creditos`, {
      method: 'POST', headers,
      body: JSON.stringify({ valor: -100000, tipo: 'Ajuste', descricao: 'Zerar saldo para o teste' }),
    });

    const semSaldo = await fetch(`${getBaseUrl()}/pedidos`, {
      method: 'POST', headers,
      body: JSON.stringify({ numero: 'PRE-001', clienteId: cliente._id, produtoId: produto._id, parceiroId: parceiro._id, vinculo: { tipo: 'Revenda' } }),
    });
    assert.equal(semSaldo.status, 422);

    const recarga = await fetch(`${getBaseUrl()}/parceiros/${parceiro._id}/creditos`, {
      method: 'POST', headers,
      body: JSON.stringify({ valor: 5000, descricao: 'PIX confirmado' }),
    });
    assert.equal(recarga.status, 201);

    const pedidoRes = await fetch(`${getBaseUrl()}/pedidos`, {
      method: 'POST', headers,
      body: JSON.stringify({ numero: 'PRE-002', clienteId: cliente._id, produtoId: produto._id, parceiroId: parceiro._id, vinculo: { tipo: 'Revenda' } }),
    });
    assert.equal(pedidoRes.status, 201);
    const pedido = await pedidoRes.json() as { _id: string; cobrancaRevenda: { situacao: string } };
    assert.equal(pedido.cobrancaRevenda.situacao, 'Pago com creditos');

    const consumida = await fetch(`${getBaseUrl()}/parceiros/${parceiro._id}/creditos`, { headers });
    assert.equal((await consumida.json() as { saldo: number }).saldo, 0);

    const cancelada = await fetch(`${getBaseUrl()}/pedidos/${pedido._id}`, { method: 'DELETE', headers });
    assert.equal(cancelada.status, 200);
    const estornada = await fetch(`${getBaseUrl()}/parceiros/${parceiro._id}/creditos`, { headers });
    assert.equal((await estornada.json() as { saldo: number }).saldo, 5000);
  });
});
