import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  clearDatabase, criarPedidoTeste, getBaseUrl, seedBase, startTestServer, stopTestServer,
} from './setup.js';
import { PedidoModel } from '../models/pedido.model.js';
import { somenteDigitos, validarCNPJ, validarCPF } from '../services/cadastro-publico.service.js';

describe('Cadastro oficial e integração CLM', () => {
  before(async () => { await startTestServer(); });
  after(async () => {
    delete process.env.CLM_API_TOKEN;
    delete process.env.CLM_HMAC_SECRET;
    delete process.env.GESTAO_BRIDGE_API_KEY;
    await stopTestServer();
  });
  beforeEach(async () => { await clearDatabase(); });

  it('valida CPF/CNPJ localmente antes de consumir APIs pagas', () => {
    assert.equal(somenteDigitos('11.222.333/0001-81'), '11222333000181');
    assert.equal(validarCPF('529.982.247-25'), true);
    assert.equal(validarCPF('111.111.111-11'), false);
    assert.equal(validarCNPJ('11.222.333/0001-81'), true);
    assert.equal(validarCNPJ('11.111.111/1111-11'), false);
  });

  it('recusa lookup inválido sem chamar Serpro', async () => {
    process.env.GESTAO_BRIDGE_API_KEY = 'bridge-test-key';
    const response = await fetch(`${getBaseUrl()}/lookup/cnpj/123`, {
      headers: { Authorization: 'Bearer bridge-test-key' },
    });
    assert.equal(response.status, 400);
  });

  it('processa evento CLM assinado uma única vez e atualiza execução do item', async () => {
    process.env.CLM_API_TOKEN = 'clm-test-token';
    process.env.CLM_HMAC_SECRET = 'clm-test-hmac-secret';
    const { cliente, produto } = await seedBase();
    const pedido = await criarPedidoTeste(cliente._id, produto._id, 500);
    pedido.itens = [{
      produtoId: produto._id,
      codigo: produto.codigo,
      nome: produto.nome,
      quantidade: 2,
      precoUnitario: 250,
      valorTabelaUnitario: 250,
      subtotal: 500,
      quantidadeExecutada: 0,
      quantidadeFaturada: 0,
    }];
    await pedido.save();

    const itemId = String(pedido.itens[0]._id);
    const evento = {
      eventId: 'evt-clm-001', eventType: 'CERTIFICATE_ISSUED', source: 'atlas-clm',
      occurredAt: new Date().toISOString(), orderId: String(pedido._id), orderItemId: itemId,
      execution: { quantity: 1, unit: 'CERTIFICATE' },
    };
    const body = JSON.stringify(evento);
    const signature = createHmac('sha256', process.env.CLM_HMAC_SECRET).update(body).digest('hex');
    const enviar = () => fetch(`${getBaseUrl()}/integracoes/clm/eventos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', Authorization: 'Bearer clm-test-token',
        'X-Atlas-Source': 'atlas-clm', 'X-Atlas-Signature': signature,
      },
      body,
    });

    const primeira = await enviar();
    assert.equal(primeira.status, 200);
    const atualizado = await PedidoModel.findById(pedido._id);
    assert.equal(atualizado?.clm?.quantidadeExecutada, 1);
    assert.equal(atualizado?.clm?.quantidadeFaturavel, 1);
    assert.equal(atualizado?.itens[0].quantidadeExecutada, 1);

    const duplicado = await enviar();
    assert.equal(duplicado.status, 200);
    const respostaDuplicada = await duplicado.json() as { duplicate?: boolean };
    assert.equal(respostaDuplicada.duplicate, true);
    const semDuplicar = await PedidoModel.findById(pedido._id);
    assert.equal(semDuplicar?.clm?.quantidadeExecutada, 1);
  });

  it('recusa evento CLM com assinatura inválida', async () => {
    process.env.CLM_API_TOKEN = 'clm-test-token';
    process.env.CLM_HMAC_SECRET = 'clm-test-hmac-secret';
    const response = await fetch(`${getBaseUrl()}/integracoes/clm/eventos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', Authorization: 'Bearer clm-test-token',
        'X-Atlas-Source': 'atlas-clm', 'X-Atlas-Signature': '00',
      },
      body: JSON.stringify({ eventId: 'evt-bad', eventType: 'DCV_COMPLETED', source: 'atlas-clm' }),
    });
    assert.equal(response.status, 401);
  });
});
