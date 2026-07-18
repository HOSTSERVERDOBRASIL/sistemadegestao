import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  startTestServer, stopTestServer, clearDatabase,
  seedBase, getBaseUrl,
} from './setup.js';
import { LancamentoBancarioModel } from '../models/lancamento-bancario.model.js';
import { CobrancaModel } from '../models/cobranca.model.js';

describe('Conciliação bancária', () => {
  before(startTestServer);
  after(stopTestServer);
  beforeEach(clearDatabase);

  // ─── Lançamento manual ─────────────────────────────────────────────────────
  it('POST /conciliacao/lancamentos — cria lançamento manual', async () => {
    const { token } = await seedBase();

    const res = await fetch(`${getBaseUrl()}/conciliacao/lancamentos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        banco: 'Manual', tipo: 'credito', valor: '1500.00',
        data: '2026-07-01', descricao: 'Pagamento manual cliente X',
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json() as { banco: string; valor: number; status: string };
    assert.equal(body.banco, 'Manual');
    assert.equal(body.valor, 1500);
    assert.equal(body.status, 'pendente');
  });

  it('POST /conciliacao/lancamentos — rejeita sem campos obrigatórios', async () => {
    const { token } = await seedBase();
    const res = await fetch(`${getBaseUrl()}/conciliacao/lancamentos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ banco: 'Manual', tipo: 'credito' }),
    });
    assert.equal(res.status, 400);
  });

  // ─── Listagem e filtros ────────────────────────────────────────────────────
  it('GET /conciliacao/lancamentos — lista e filtra por status', async () => {
    const { token } = await seedBase();

    await LancamentoBancarioModel.create([
      { banco: 'BB', origem: 'manual', tipo: 'credito', valor: 800, data: new Date('2026-07-01'), descricao: 'A', status: 'pendente' },
      { banco: 'Manual', origem: 'manual', tipo: 'debito', valor: 200, data: new Date('2026-07-02'), descricao: 'B', status: 'ignorado' },
    ]);

    const res = await fetch(`${getBaseUrl()}/conciliacao/lancamentos?status=pendente`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { data: unknown[]; total: number };
    assert.equal(body.total, 1);
    assert.equal(body.data.length, 1);
  });

  // ─── Ignorar ───────────────────────────────────────────────────────────────
  it('PATCH /conciliacao/lancamentos/:id/ignorar', async () => {
    const { token } = await seedBase();
    const lanc = await LancamentoBancarioModel.create({
      banco: 'BB', origem: 'manual', tipo: 'credito', valor: 500,
      data: new Date(), descricao: 'Teste ignorar', status: 'pendente',
    });

    const res = await fetch(`${getBaseUrl()}/conciliacao/lancamentos/${lanc._id}/ignorar`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ observacoes: 'Duplicata' }),
    });
    assert.equal(res.status, 200);
    const atualizado = await LancamentoBancarioModel.findById(lanc._id);
    assert.equal(atualizado?.status, 'ignorado');
  });

  // ─── Reabrir ───────────────────────────────────────────────────────────────
  it('PATCH /conciliacao/lancamentos/:id/reabrir — volta para pendente', async () => {
    const { token } = await seedBase();
    const lanc = await LancamentoBancarioModel.create({
      banco: 'Manual', origem: 'manual', tipo: 'credito', valor: 300,
      data: new Date(), descricao: 'Reabrir teste', status: 'ignorado',
    });

    const res = await fetch(`${getBaseUrl()}/conciliacao/lancamentos/${lanc._id}/reabrir`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const atualizado = await LancamentoBancarioModel.findById(lanc._id);
    assert.equal(atualizado?.status, 'pendente');
  });

  // ─── Conciliar manual por pedido ──────────────────────────────────────────
  it('PATCH /conciliacao/lancamentos/:id/conciliar — vincula pedido', async () => {
    const { token, cliente, produto } = await seedBase();
    const { PedidoModel } = await import('../models/pedido.model.js');
    const pedido = await PedidoModel.create({
      numero: 'P-CONC-001',
      clienteId: cliente._id, produtoId: produto._id,
      valorTotal: 1000, valorTabela: 1000,
      vinculo: { tipo: 'CompraDireta' },
      etapaOperacional: 'Pedido',
      historicoEtapas: [{ etapa: 'Pedido', data: new Date() }],
    });

    const lanc = await LancamentoBancarioModel.create({
      banco: 'Manual', origem: 'manual', tipo: 'credito', valor: 1000,
      data: new Date(), descricao: 'Pagamento pedido', status: 'pendente',
    });

    const res = await fetch(`${getBaseUrl()}/conciliacao/lancamentos/${lanc._id}/conciliar`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pedidoId: pedido._id.toString() }),
    });
    assert.equal(res.status, 200);
    const atualizado = await LancamentoBancarioModel.findById(lanc._id);
    assert.equal(atualizado?.status, 'conciliado');
    assert.ok(atualizado?.pedidoId);
  });

  // ─── Conciliação automática por txid ─────────────────────────────────────
  it('POST /conciliacao/auto — concilia por txid PIX', async () => {
    const { token, cliente, produto } = await seedBase();
    const { PedidoModel } = await import('../models/pedido.model.js');
    const pedido = await PedidoModel.create({
      numero: 'P-AUTO-001',
      clienteId: cliente._id, produtoId: produto._id,
      valorTotal: 500, valorTabela: 500,
      vinculo: { tipo: 'CompraDireta' },
      etapaOperacional: 'Pedido',
      historicoEtapas: [{ etapa: 'Pedido', data: new Date() }],
    });

    const cob = await CobrancaModel.create({
      pedidoId: pedido._id, tipo: 'pix', valor: 500,
      status: 'ATIVA', txid: 'E123456789',
    });

    await LancamentoBancarioModel.create({
      banco: 'Efi', origem: 'manual', tipo: 'credito',
      valor: 500, data: new Date(),
      descricao: 'PIX recebido', txid: 'E123456789', status: 'pendente',
    });

    const res = await fetch(`${getBaseUrl()}/conciliacao/auto`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { conciliados: number; total: number };
    assert.equal(body.conciliados, 1);

    const cobAtualizada = await CobrancaModel.findById(cob._id);
    assert.equal(cobAtualizada?.status, 'CONCLUIDA');
  });

  // ─── Resumo ───────────────────────────────────────────────────────────────
  it('GET /conciliacao/resumo — retorna estrutura esperada', async () => {
    const { token } = await seedBase();
    await LancamentoBancarioModel.create([
      { banco: 'BB', origem: 'ofx', tipo: 'credito', valor: 1000, data: new Date(), descricao: 'X', status: 'conciliado' },
      { banco: 'Manual', origem: 'manual', tipo: 'credito', valor: 500, data: new Date(), descricao: 'Y', status: 'pendente' },
    ]);

    const res = await fetch(`${getBaseUrl()}/conciliacao/resumo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { porStatus: object; porBanco: unknown[]; totalConciliado: number };
    assert.ok(typeof body.porStatus === 'object');
    assert.ok(Array.isArray(body.porBanco));
    assert.ok(typeof body.totalConciliado === 'number');
  });

  // ─── OFX parser (unit) ────────────────────────────────────────────────────
  it('parseOfx — parseia OFX 1.x flat corretamente', async () => {
    const { parseOfx } = await import('../services/ofx.service.js');
    const ofxFlat = `
OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKACCTFROM>
<BANKID>001</BANKID>
<ACCTID>123456</ACCTID>
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260701000000</DTSTART>
<DTEND>20260715000000</DTEND>
<STMTTRN>
<TRNTYPE>CREDIT</TRNTYPE>
<DTPOSTED>20260710000000</DTPOSTED>
<TRNAMT>1500.00</TRNAMT>
<FITID>2026071001</FITID>
<NAME>PAGAMENTO PIX</NAME>
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20260712000000</DTPOSTED>
<TRNAMT>-200.00</TRNAMT>
<FITID>2026071201</FITID>
<NAME>TARIFA BANCARIA</NAME>
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;
    const result = parseOfx(ofxFlat);
    assert.equal(result.transacoes.length, 2);
    assert.equal(result.transacoes[0].tipo, 'credito');
    assert.equal(result.transacoes[0].valor, 1500);
    assert.equal(result.transacoes[1].tipo, 'debito');
    assert.equal(result.transacoes[1].valor, 200);
    assert.equal(result.banco, 'BB');
    assert.equal(result.conta, '123456');
  });

  // ─── Autenticação ─────────────────────────────────────────────────────────
  it('GET /conciliacao/lancamentos — rejeita sem token', async () => {
    const res = await fetch(`${getBaseUrl()}/conciliacao/lancamentos`);
    assert.equal(res.status, 401);
  });

  it('POST /conciliacao/importar-bb — retorna 503 se BB não configurado', async () => {
    const { token } = await seedBase();
    // Garante que BB não está configurado
    const bbClientId = process.env.BB_CLIENT_ID;
    delete process.env.BB_CLIENT_ID;

    const res = await fetch(`${getBaseUrl()}/conciliacao/importar-bb`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ dataInicio: '2026-07-01', dataFim: '2026-07-15' }),
    });
    assert.equal(res.status, 503);
    if (bbClientId) process.env.BB_CLIENT_ID = bbClientId;
  });
});
