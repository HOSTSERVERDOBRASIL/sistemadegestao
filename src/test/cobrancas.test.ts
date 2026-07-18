import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  startTestServer, stopTestServer, clearDatabase,
  getBaseUrl, seedBase, criarPedidoTeste,
} from './setup.js';
import { CobrancaModel } from '../models/cobranca.model.js';
import { efiAdapter } from '../services/efi.service.js';

const PIX_MOCK = {
  txid: 'txid-test-123',
  loc: 'https://pix.efi.com.br/teste',
  qrCode: 'qr-code-string',
  qrCodeBase64: 'base64string==',
  pixCopiaECola: '00020126...',
  raw: { status: 'ATIVA' },
};

const BOLETO_MOCK = {
  nossoNumero: '9999999',
  boletoUrl: 'https://boleto.efi.com.br/teste',
  boletoBarcode: '23793.38128',
  raw: { charge_id: 1 },
};

function stubEfi() {
  efiAdapter.criarPixImediato = async () => PIX_MOCK;
  efiAdapter.criarPixVencimento = async () => ({
    txid: 'txid-venc-456', loc: 'https://loc', qrCode: '0002...',
    qrCodeBase64: 'base64string==', pixCopiaECola: '0002...', raw: {},
  });
  efiAdapter.criarBoleto = async () => BOLETO_MOCK;
  efiAdapter.consultarPix = async () => ({ status: 'CONCLUIDA' });
  efiAdapter.cancelarCobrancaEfi = async () => undefined;
  efiAdapter.validarWebhookEfi = () => true;
}

describe('Cobranças', () => {
  before(async () => {
    stubEfi();
    await startTestServer();
  });
  after(stopTestServer);
  beforeEach(clearDatabase);

  it('POST /cobrancas/pix cria cobrança PIX vinculada ao pedido', async () => {
    const { token, cliente, produto } = await seedBase();
    const pedido = await criarPedidoTeste(cliente._id, produto._id, 500);

    const pixRes = await fetch(`${getBaseUrl()}/cobrancas/pix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pedidoId: pedido._id, valor: 500 }),
    });
    assert.equal(pixRes.status, 201);
    const cobranca = await pixRes.json() as {
      tipo: string; txid: string; status: string; qrCode: string
    };
    assert.equal(cobranca.tipo, 'pix');
    assert.equal(cobranca.txid, PIX_MOCK.txid);
    assert.equal(cobranca.status, 'ATIVA');
    assert.equal(cobranca.qrCode, PIX_MOCK.qrCode);
  });

  it('POST /cobrancas/boleto cria cobrança boleto', async () => {
    const { token, cliente, produto } = await seedBase();
    const pedido = await criarPedidoTeste(cliente._id, produto._id, 300);

    const boletoRes = await fetch(`${getBaseUrl()}/cobrancas/boleto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pedidoId: pedido._id, valor: 300, vencimento: '2027-12-31' }),
    });
    assert.equal(boletoRes.status, 201);
    const cobranca = await boletoRes.json() as { tipo: string; nossoNumero: string; boletoUrl: string };
    assert.equal(cobranca.tipo, 'boleto');
    assert.equal(cobranca.nossoNumero, BOLETO_MOCK.nossoNumero);
    assert.ok(cobranca.boletoUrl);
  });

  it('GET /cobrancas/pedido/:pedidoId lista cobranças do pedido', async () => {
    const { token, cliente, produto } = await seedBase();
    const pedido = await criarPedidoTeste(cliente._id, produto._id, 200);

    for (let i = 0; i < 2; i++) {
      await fetch(`${getBaseUrl()}/cobrancas/pix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pedidoId: pedido._id, valor: 200 }),
      });
    }

    const listRes = await fetch(`${getBaseUrl()}/cobrancas/pedido/${pedido._id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(listRes.status, 200);
    const cobras = await listRes.json() as unknown[];
    assert.equal(cobras.length, 2);
  });

  it('DELETE /cobrancas/:id cancela cobrança ativa', async () => {
    const { token, cliente, produto } = await seedBase();
    const pedido = await criarPedidoTeste(cliente._id, produto._id, 100);

    const pixRes = await fetch(`${getBaseUrl()}/cobrancas/pix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pedidoId: pedido._id, valor: 100 }),
    });
    const cobranca = await pixRes.json() as { _id: string };

    const delRes = await fetch(`${getBaseUrl()}/cobrancas/${cobranca._id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(delRes.status, 200);
    const body = await delRes.json() as { cobranca: { status: string } };
    assert.equal(body.cobranca.status, 'REMOVIDA_PELO_USUARIO_RECEBEDOR');
  });

  it('DELETE /cobrancas/:id retorna 409 para cobrança já paga', async () => {
    const { token, cliente, produto } = await seedBase();
    const pedido = await criarPedidoTeste(cliente._id, produto._id, 100);

    const pixRes = await fetch(`${getBaseUrl()}/cobrancas/pix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pedidoId: pedido._id, valor: 100 }),
    });
    const cobranca = await pixRes.json() as { _id: string };

    await CobrancaModel.findByIdAndUpdate(cobranca._id, { status: 'CONCLUIDA' });

    const delRes = await fetch(`${getBaseUrl()}/cobrancas/${cobranca._id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(delRes.status, 409);
  });

  it('POST /cobrancas/pix retorna 404 para pedido inexistente', async () => {
    const { token } = await seedBase();
    const res = await fetch(`${getBaseUrl()}/cobrancas/pix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pedidoId: '000000000000000000000000', valor: 100 }),
    });
    assert.equal(res.status, 404);
  });

  it('POST /cobrancas/webhook/efi avança pedido para etapa Pagamento', async () => {
    const { token, cliente, produto } = await seedBase();
    const pedido = await criarPedidoTeste(cliente._id, produto._id, 999);
    assert.equal(pedido.etapaOperacional, 'Pedido');

    const pixRes = await fetch(`${getBaseUrl()}/cobrancas/pix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pedidoId: pedido._id, valor: 999 }),
    });
    const cobranca = await pixRes.json() as { txid: string };

    const webhookRes = await fetch(`${getBaseUrl()}/cobrancas/webhook/efi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pix: [{ txid: cobranca.txid, valor: '999.00', horario: new Date().toISOString() }],
      }),
    });
    assert.equal(webhookRes.status, 200);

    const pedidoAtualRes = await fetch(`${getBaseUrl()}/pedidos/${pedido._id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const p = await pedidoAtualRes.json() as { etapaOperacional: string };
    assert.equal(p.etapaOperacional, 'Pagamento');
  });

  it('POST /cobrancas/webhook/efi retorna 401 para assinatura inválida', async () => {
    efiAdapter.validarWebhookEfi = () => false;

    const res = await fetch(`${getBaseUrl()}/cobrancas/webhook/efi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-efi-signature': 'invalida' },
      body: JSON.stringify({ pix: [] }),
    });

    efiAdapter.validarWebhookEfi = () => true;
    assert.equal(res.status, 401);
  });
});
