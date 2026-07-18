import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, clearDatabase, seedBase, getBaseUrl } from './setup.js';
import { ContratoModel } from '../models/contrato.model.js';
import { OrdemFornecimentoModel } from '../models/ordem-fornecimento.model.js';
import { PedidoModel } from '../models/pedido.model.js';
import { NotaFiscalModel } from '../models/nota-fiscal.model.js';

describe('Emissão de NF', () => {
  before(startTestServer);
  after(stopTestServer);
  beforeEach(clearDatabase);

  // ── Modalidade: CompraDireta ──────────────────────────────────────────────

  it('emite NF para ComprasDireta com comprovante aprovado', async () => {
    const { token, cliente, produto } = await seedBase();

    const pedidoRes = await fetch(`${getBaseUrl()}/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        numero: 'P-001',
        clienteId: cliente._id,
        produtoId: produto._id,
        valorTotal: 1000,
        valorTabela: 1000,
        vinculo: { tipo: 'CompraDireta', comprovantePagamentoAprovado: true },
      }),
    });
    assert.equal(pedidoRes.status, 201);
    const pedido = await pedidoRes.json() as { _id: string };

    const nfRes = await fetch(`${getBaseUrl()}/pedidos/${pedido._id}/emitir-nf`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(nfRes.status, 201);
    const nf = await nfRes.json() as { status: string; emissor: string; valor: number };
    assert.equal(nf.status, 'Emitida');
    assert.equal(nf.emissor, 'XDigital');
    assert.equal(nf.valor, 1000);

    const pedidoAtualizado = await PedidoModel.findById(pedido._id);
    assert.equal(pedidoAtualizado?.nfEmitida, true);
    assert.equal(pedidoAtualizado?.status, 'Faturado');
  });

  it('rejeita NF para CompraDireta sem comprovante aprovado (422)', async () => {
    const { token, cliente, produto } = await seedBase();

    const pedidoRes = await fetch(`${getBaseUrl()}/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        numero: 'P-002',
        clienteId: cliente._id,
        produtoId: produto._id,
        valorTotal: 1000,
        valorTabela: 1000,
        vinculo: { tipo: 'CompraDireta', comprovantePagamentoAprovado: false },
      }),
    });
    const pedido = await pedidoRes.json() as { _id: string };

    const nfRes = await fetch(`${getBaseUrl()}/pedidos/${pedido._id}/emitir-nf`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(nfRes.status, 422);
  });

  // ── Modalidade: EmpenhoSF ─────────────────────────────────────────────────

  it('emite NF para EmpenhoSF com empenho e SF informados', async () => {
    const { token, cliente, produto } = await seedBase();

    const pedidoRes = await fetch(`${getBaseUrl()}/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        numero: 'P-003',
        clienteId: cliente._id,
        produtoId: produto._id,
        valorTotal: 2000,
        valorTabela: 2000,
        vinculo: { tipo: 'EmpenhoSF', empenho: 'EMP-999', sf: 'SF-001' },
      }),
    });
    const pedido = await pedidoRes.json() as { _id: string };

    const nfRes = await fetch(`${getBaseUrl()}/pedidos/${pedido._id}/emitir-nf`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(nfRes.status, 201);
    const nf = await nfRes.json() as { observacoes: string };
    assert.ok(nf.observacoes.includes('EMP-999'));
  });

  it('rejeita EmpenhoSF sem empenho (422)', async () => {
    const { token, cliente, produto } = await seedBase();

    const pedidoRes = await fetch(`${getBaseUrl()}/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        numero: 'P-004',
        clienteId: cliente._id,
        produtoId: produto._id,
        valorTotal: 500,
        valorTabela: 500,
        vinculo: { tipo: 'EmpenhoSF' },
      }),
    });
    const pedido = await pedidoRes.json() as { _id: string };

    const nfRes = await fetch(`${getBaseUrl()}/pedidos/${pedido._id}/emitir-nf`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(nfRes.status, 422);
  });

  // ── Modalidade: Contrato Total ────────────────────────────────────────────

  it('emite NF para Contrato modalidade Total', async () => {
    const { token, cliente, produto } = await seedBase();

    const contrato = await ContratoModel.create({
      numero: 'CT-001',
      clienteId: cliente._id,
      valorTotal: 10000,
      modalidade: 'Total',
      dataInicio: new Date(),
      dataFim: new Date(Date.now() + 86400000 * 365),
    });

    const pedidoRes = await fetch(`${getBaseUrl()}/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        numero: 'P-005',
        clienteId: cliente._id,
        produtoId: produto._id,
        contratoId: contrato._id,
        valorTotal: 10000,
        valorTabela: 10000,
        vinculo: { tipo: 'Contrato', emissorNF: 'XDigital' },
      }),
    });
    const pedido = await pedidoRes.json() as { _id: string };

    const nfRes = await fetch(`${getBaseUrl()}/pedidos/${pedido._id}/emitir-nf`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(nfRes.status, 201);

    const contratoAtualizado = await ContratoModel.findById(contrato._id);
    assert.equal(contratoAtualizado?.valorFaturado, 10000);
  });

  it('rejeita segunda NF em Contrato Total já faturado (409)', async () => {
    const { token, cliente, produto } = await seedBase();

    const contrato = await ContratoModel.create({
      numero: 'CT-002',
      clienteId: cliente._id,
      valorTotal: 5000,
      modalidade: 'Total',
      dataInicio: new Date(),
      dataFim: new Date(Date.now() + 86400000 * 365),
    });

    const criarPedido = async (num: string) => {
      const r = await fetch(`${getBaseUrl()}/pedidos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          numero: num,
          clienteId: cliente._id,
          produtoId: produto._id,
          contratoId: contrato._id,
          valorTotal: 5000,
          valorTabela: 5000,
          vinculo: { tipo: 'Contrato' },
        }),
      });
      return (await r.json() as { _id: string })._id;
    };

    const id1 = await criarPedido('P-006');
    await fetch(`${getBaseUrl()}/pedidos/${id1}/emitir-nf`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });

    const id2 = await criarPedido('P-007');
    const res2 = await fetch(`${getBaseUrl()}/pedidos/${id2}/emitir-nf`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res2.status, 409);
  });

  // ── Modalidade: Contrato Parcial ──────────────────────────────────────────

  it('emite NF parcial e atualiza valorFaturado do contrato', async () => {
    const { token, cliente, produto } = await seedBase();

    const contrato = await ContratoModel.create({
      numero: 'CT-003',
      clienteId: cliente._id,
      valorTotal: 20000,
      modalidade: 'Parcial',
      dataInicio: new Date(),
      dataFim: new Date(Date.now() + 86400000 * 365),
    });

    const pedidoRes = await fetch(`${getBaseUrl()}/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        numero: 'P-008',
        clienteId: cliente._id,
        produtoId: produto._id,
        contratoId: contrato._id,
        valorTotal: 7000,
        valorTabela: 7000,
        vinculo: { tipo: 'Contrato' },
      }),
    });
    const pedido = await pedidoRes.json() as { _id: string };

    const nfRes = await fetch(`${getBaseUrl()}/pedidos/${pedido._id}/emitir-nf`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(nfRes.status, 201);

    const contratoAtualizado = await ContratoModel.findById(contrato._id);
    assert.equal(contratoAtualizado?.valorFaturado, 7000);
  });

  it('rejeita NF parcial quando excede saldo do contrato (409)', async () => {
    const { token, cliente, produto } = await seedBase();

    const contrato = await ContratoModel.create({
      numero: 'CT-004',
      clienteId: cliente._id,
      valorTotal: 3000,
      valorFaturado: 2500,
      modalidade: 'Parcial',
      dataInicio: new Date(),
      dataFim: new Date(Date.now() + 86400000 * 365),
    });

    const pedidoRes = await fetch(`${getBaseUrl()}/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        numero: 'P-009',
        clienteId: cliente._id,
        produtoId: produto._id,
        contratoId: contrato._id,
        valorTotal: 1000,
        valorTabela: 1000,
        vinculo: { tipo: 'Contrato' },
      }),
    });
    const pedido = await pedidoRes.json() as { _id: string };

    const nfRes = await fetch(`${getBaseUrl()}/pedidos/${pedido._id}/emitir-nf`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(nfRes.status, 409);
  });

  // ── Modalidade: Ordem de Fornecimento ────────────────────────────────────

  it('emite NF vinculada a Ordem de Fornecimento e atualiza status da OF', async () => {
    const { token, cliente, produto } = await seedBase();

    const contrato = await ContratoModel.create({
      numero: 'CT-005',
      clienteId: cliente._id,
      valorTotal: 50000,
      modalidade: 'Por Ordem de Fornecimento',
      dataInicio: new Date(),
      dataFim: new Date(Date.now() + 86400000 * 365),
    });

    const ordem = await OrdemFornecimentoModel.create({
      numero: 'OF-001',
      contratoId: contrato._id,
      valor: 10000,
    });

    const pedidoRes = await fetch(`${getBaseUrl()}/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        numero: 'P-010',
        clienteId: cliente._id,
        produtoId: produto._id,
        contratoId: contrato._id,
        valorTotal: 10000,
        valorTabela: 10000,
        vinculo: { tipo: 'Contrato' },
      }),
    });
    const pedido = await pedidoRes.json() as { _id: string };

    const nfRes = await fetch(`${getBaseUrl()}/pedidos/${pedido._id}/emitir-nf`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(nfRes.status, 201);

    const ordemAtualizada = await OrdemFornecimentoModel.findById(ordem._id);
    assert.equal(ordemAtualizada?.valorFaturado, 10000);
    assert.equal(ordemAtualizada?.status, 'Fechada');
  });

  // ── Modalidade: Revenda ───────────────────────────────────────────────────

  it('emite NF de Revenda com emissor do parceiro', async () => {
    const { token, cliente, produto, parceiro } = await seedBase();

    const pedidoRes = await fetch(`${getBaseUrl()}/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        numero: 'P-011',
        clienteId: cliente._id,
        produtoId: produto._id,
        parceiroId: parceiro._id,
        valorTotal: 3000,
        valorTabela: 4000,
        valorRevenda: 3000,
        vinculo: { tipo: 'Revenda' },
      }),
    });
    const pedido = await pedidoRes.json() as { _id: string };

    const nfRes = await fetch(`${getBaseUrl()}/pedidos/${pedido._id}/emitir-nf`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(nfRes.status, 201);
    const nf = await nfRes.json() as { emissor: string };
    assert.equal(nf.emissor, 'Revendedor');
  });

  // ── Cancelamento de NF ────────────────────────────────────────────────────

  it('cancela NF e reverte pedido para Em processo', async () => {
    const { token, cliente, produto } = await seedBase();

    const pedidoRes = await fetch(`${getBaseUrl()}/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        numero: 'P-012',
        clienteId: cliente._id,
        produtoId: produto._id,
        valorTotal: 1500,
        valorTabela: 1500,
        vinculo: { tipo: 'CompraDireta', comprovantePagamentoAprovado: true },
      }),
    });
    const pedido = await pedidoRes.json() as { _id: string };

    const nfRes = await fetch(`${getBaseUrl()}/pedidos/${pedido._id}/emitir-nf`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
    const nf = await nfRes.json() as { _id: string };

    const cancelRes = await fetch(`${getBaseUrl()}/financeiro/notas/${nf._id}/cancelar`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ observacoes: 'Cancelado no teste' }),
    });
    assert.equal(cancelRes.status, 200);
    const cancelado = await cancelRes.json() as { status: string };
    assert.equal(cancelado.status, 'Cancelada');

    const pedidoAtualizado = await PedidoModel.findById(pedido._id);
    assert.equal(pedidoAtualizado?.nfEmitida, false);
  });

  it('rejeita cancelamento de NF já cancelada (409)', async () => {
    const { token, cliente, produto } = await seedBase();
    const nf = await NotaFiscalModel.create({
      numero: 'NF-CANCEL',
      pedidoId: (await PedidoModel.create({
        numero: 'P-013',
        clienteId: cliente._id,
        produtoId: produto._id,
        valorTotal: 100,
        valorTabela: 100,
        vinculo: { tipo: 'CompraDireta' },
      }))._id,
      valor: 100,
      emissor: 'XDigital',
      status: 'Cancelada',
    });

    const res = await fetch(`${getBaseUrl()}/financeiro/notas/${nf._id}/cancelar`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 409);
  });
});
