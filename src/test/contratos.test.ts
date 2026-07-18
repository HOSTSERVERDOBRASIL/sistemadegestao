import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, clearDatabase, seedBase, getBaseUrl } from './setup.js';
import { ContratoModel } from '../models/contrato.model.js';

describe('Contratos', () => {
  before(startTestServer);
  after(stopTestServer);
  beforeEach(clearDatabase);

  it('cria contrato e aparece na listagem', async () => {
    const { token, cliente } = await seedBase();

    const res = await fetch(`${getBaseUrl()}/contratos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        numero: 'CT-LISTA',
        clienteId: cliente._id,
        valorTotal: 100000,
        modalidade: 'Parcial',
        dataInicio: '2026-01-01',
        dataFim: '2026-12-31',
      }),
    });
    assert.equal(res.status, 201);

    const lista = await fetch(`${getBaseUrl()}/contratos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await lista.json() as { total: number; data: { numero: string }[] };
    assert.equal(body.total, 1);
    assert.equal(body.data[0].numero, 'CT-LISTA');
  });

  it('faturar-total marca valorFaturado = valorTotal', async () => {
    const { token, cliente } = await seedBase();

    const contrato = await ContratoModel.create({
      numero: 'CT-FAT',
      clienteId: cliente._id,
      valorTotal: 50000,
      modalidade: 'Total',
      dataInicio: new Date(),
      dataFim: new Date(Date.now() + 86400000 * 365),
    });

    const res = await fetch(`${getBaseUrl()}/contratos/${contrato._id}/faturar-total`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { valorFaturado: number; valorTotal: number };
    assert.equal(body.valorFaturado, body.valorTotal);
  });

  it('faturar-total rejeita contrato já faturado (409)', async () => {
    const { token, cliente } = await seedBase();

    const contrato = await ContratoModel.create({
      numero: 'CT-DUPLO',
      clienteId: cliente._id,
      valorTotal: 10000,
      valorFaturado: 10000,
      modalidade: 'Total',
      dataInicio: new Date(),
      dataFim: new Date(Date.now() + 86400000 * 365),
    });

    const res = await fetch(`${getBaseUrl()}/contratos/${contrato._id}/faturar-total`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 409);
  });

  it('cria e lista ordens de fornecimento do contrato', async () => {
    const { token, cliente } = await seedBase();

    const contrato = await ContratoModel.create({
      numero: 'CT-OF',
      clienteId: cliente._id,
      valorTotal: 200000,
      modalidade: 'Por Ordem de Fornecimento',
      dataInicio: new Date(),
      dataFim: new Date(Date.now() + 86400000 * 365),
    });

    const criarRes = await fetch(`${getBaseUrl()}/contratos/${contrato._id}/ordens-fornecimento`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ numero: 'OF-A', valor: 30000 }),
    });
    assert.equal(criarRes.status, 201);

    const listaRes = await fetch(`${getBaseUrl()}/contratos/${contrato._id}/ordens-fornecimento`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const lista = await listaRes.json() as { numero: string }[];
    assert.equal(lista.length, 1);
    assert.equal(lista[0].numero, 'OF-A');
  });

  it('soft-delete encerra contrato (ativo = false)', async () => {
    const { token, cliente } = await seedBase();

    const contrato = await ContratoModel.create({
      numero: 'CT-DEL',
      clienteId: cliente._id,
      valorTotal: 5000,
      modalidade: 'Parcial',
      dataInicio: new Date(),
      dataFim: new Date(Date.now() + 86400000 * 365),
    });

    const res = await fetch(`${getBaseUrl()}/contratos/${contrato._id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);

    const atualizado = await ContratoModel.findById(contrato._id);
    assert.equal(atualizado?.ativo, false);
  });
});
