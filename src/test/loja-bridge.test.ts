import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clearDatabase, getBaseUrl, seedBase, startTestServer, stopTestServer } from './setup.js';
import { ContratoModel } from '../models/contrato.model.js';
import { PedidoModel } from '../models/pedido.model.js';
import { NotaFiscalModel } from '../models/nota-fiscal.model.js';

process.env.GESTAO_BRIDGE_API_KEY = 'bridge-test-secret';
const auth = { Authorization: 'Bearer bridge-test-secret', 'Content-Type': 'application/json' };

describe('Ponte Loja → AtlasX', () => {
  before(startTestServer);
  after(stopTestServer);
  beforeEach(clearDatabase);

  it('protege as rotas com API key', async () => {
    const res = await fetch(`${getBaseUrl()}/customers/find-or-create`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(res.status, 401);
  });

  it('find-or-create não duplica cliente pelo documento normalizado', async () => {
    await seedBase();
    const criar = (document: string) => fetch(`${getBaseUrl()}/customers/find-or-create`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({ name: 'Cliente Loja', email: 'loja@teste.com', document }),
    });
    const primeiro = await criar('38.597.881/0001-42');
    assert.equal(primeiro.status, 200);
    const p1 = await primeiro.json() as { id: string; isNovo: boolean };
    assert.equal(p1.isNovo, true);

    const segundo = await criar('38597881000142');
    const p2 = await segundo.json() as { id: string; isNovo: boolean };
    assert.equal(p2.id, p1.id);
    assert.equal(p2.isNovo, false);
  });

  it('cria pedido multi-item com totais reais e trata retry como idempotente', async () => {
    const { cliente, produto } = await seedBase();
    const body = {
      customerId: cliente._id,
      modules: [{ moduleId: String(produto._id), name: produto.nome, price: 125.5, quantity: 2 }],
      metadata: { orderNumber: 'SITE-001' },
    };
    const primeiro = await fetch(`${getBaseUrl()}/subscriptions/assign`, {
      method: 'POST', headers: auth, body: JSON.stringify(body),
    });
    assert.equal(primeiro.status, 200);
    const criado = await primeiro.json() as { pedidoId: string; idempotente: boolean };
    assert.equal(criado.idempotente, false);
    const pedido = await PedidoModel.findById(criado.pedidoId).lean();
    assert.equal(pedido?.valorTotal, 251);
    assert.equal(pedido?.itens[0].quantidade, 2);
    assert.equal(pedido?.vinculo.tipo, 'CompraDireta');
    assert.equal(pedido?.nfEmitida, true);
    const nota = await NotaFiscalModel.findOne({ pedidoId: criado.pedidoId }).lean();
    assert.ok(nota, 'compra direta da loja deve gerar nota fiscal');
    assert.equal(nota?.emissor, 'XDigital');

    const retry = await fetch(`${getBaseUrl()}/subscriptions/assign`, {
      method: 'POST', headers: auth, body: JSON.stringify(body),
    });
    const repetido = await retry.json() as { pedidoId: string; idempotente: boolean };
    assert.equal(repetido.pedidoId, criado.pedidoId);
    assert.equal(repetido.idempotente, true);
    assert.equal(await PedidoModel.countDocuments(), 1);
  });

  it('consulta contrato pelo CNPJ e cria pedido consumindo saldo reservado', async () => {
    const { cliente, produto } = await seedBase();
    cliente.documento = '38.597.881/0001-42';
    await cliente.save();
    const contrato = await ContratoModel.create({
      numero: 'CT-LOJA', clienteId: cliente._id, valorTotal: 1000, modalidade: 'Parcial',
      dataInicio: new Date(Date.now() - 86400000), dataFim: new Date(Date.now() + 86400000 * 30),
    });

    const lookup = await fetch(`${getBaseUrl()}/lookup/contrato/38597881000142`, { headers: auth });
    assert.equal(lookup.status, 200);
    const consulta = await lookup.json() as { temContratoAtivo: boolean; contratos: Array<{ saldoDisponivel: number }> };
    assert.equal(consulta.temContratoAtivo, true);
    assert.equal(consulta.contratos[0].saldoDisponivel, 1000);

    const assign = await fetch(`${getBaseUrl()}/subscriptions/assign`, {
      method: 'POST', headers: auth,
      body: JSON.stringify({
        customerId: cliente._id,
        modules: [{ moduleId: String(produto._id), name: produto.nome, price: 600, quantity: 1 }],
        metadata: { orderNumber: 'SITE-CT-1' },
        vinculo: { tipo: 'contrato', contratoId: contrato._id },
      }),
    });
    assert.equal(assign.status, 200);

    const depois = await fetch(`${getBaseUrl()}/lookup/contrato/38597881000142`, { headers: auth });
    const consultaDepois = await depois.json() as { contratos: Array<{ saldoDisponivel: number }> };
    assert.equal(consultaDepois.contratos[0].saldoDisponivel, 400);
  });
});
