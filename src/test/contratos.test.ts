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

  it('rejeita OF quando a soma ultrapassa o valor do contrato', async () => {
    const { token, cliente } = await seedBase();
    const contrato = await ContratoModel.create({
      numero: 'CT-LIMITE-OF', clienteId: cliente._id, valorTotal: 10000,
      modalidade: 'Por Ordem de Fornecimento', dataInicio: new Date(),
      dataFim: new Date(Date.now() + 86400000 * 365),
    });

    const criar = (numero: string, valor: number) => fetch(`${getBaseUrl()}/contratos/${contrato._id}/ordens-fornecimento`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ numero, valor }),
    });
    assert.equal((await criar('OF-LIM-1', 8000)).status, 201);
    assert.equal((await criar('OF-LIM-2', 3000)).status, 422);
  });

  it('rejeita contrato com período invertido', async () => {
    const { token, cliente } = await seedBase();
    const res = await fetch(`${getBaseUrl()}/contratos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        numero: 'CT-DATAS', clienteId: cliente._id, valorTotal: 1000,
        modalidade: 'Parcial', dataInicio: '2026-12-31', dataFim: '2026-01-01',
      }),
    });
    assert.equal(res.status, 400);
  });

  it('aditivo aumenta o direito e aparece no resumo financeiro', async () => {
    const { token, cliente, produto } = await seedBase();
    const contrato = await ContratoModel.create({
      numero: 'CT-ADITIVO', clienteId: cliente._id, valorTotal: 1000, modalidade: 'Parcial',
      dataInicio: new Date(Date.now() - 86400000), dataFim: new Date(Date.now() + 86400000 * 30),
    });
    const aditivo = await fetch(`${getBaseUrl()}/contratos/${contrato._id}/aditivos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ numero: 'AD-01', valor: 500, motivo: 'Acréscimo de escopo', dataAssinatura: '2026-07-01' }),
    });
    assert.equal(aditivo.status, 201);

    const resumoRes = await fetch(`${getBaseUrl()}/contratos/${contrato._id}/resumo-financeiro`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const resumo = await resumoRes.json() as { valorOriginal: number; valorAditivos: number; valorTotalComDireito: number; disponivel: number };
    assert.equal(resumo.valorOriginal, 1000);
    assert.equal(resumo.valorAditivos, 500);
    assert.equal(resumo.valorTotalComDireito, 1500);
    assert.equal(resumo.disponivel, 1500);

    const pedido = await fetch(`${getBaseUrl()}/pedidos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        numero: 'P-ADITIVO', clienteId: cliente._id, produtoId: produto._id,
        contratoId: contrato._id, valorTotal: 1200, valorTabela: 1200, vinculo: { tipo: 'Contrato' },
      }),
    });
    assert.equal(pedido.status, 201);
    const pedidoCriado = await pedido.json() as { _id: string };
    const reservadoRes = await fetch(`${getBaseUrl()}/contratos/${contrato._id}/resumo-financeiro`, { headers: { Authorization: `Bearer ${token}` } });
    const reservado = await reservadoRes.json() as { reservado: number; confirmado: number; disponivel: number };
    assert.equal(reservado.reservado, 1200);
    assert.equal(reservado.confirmado, 0);
    assert.equal(reservado.disponivel, 300);

    const protocolo = await fetch(`${getBaseUrl()}/pedidos/${pedidoCriado._id}/protocolo`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ protocolo: 'CLM-2026-001' }),
    });
    assert.equal(protocolo.status, 200);
    const auditoriaRes = await fetch(`${getBaseUrl()}/auditoria/pedido/${pedidoCriado._id}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(auditoriaRes.status, 200);
    const auditoria = await auditoriaRes.json() as Array<{ acao: string }>;
    assert.ok(auditoria.some(evento => evento.acao === 'protocolo_clm_confirmado'));
    const confirmadoRes = await fetch(`${getBaseUrl()}/contratos/${contrato._id}/resumo-financeiro`, { headers: { Authorization: `Bearer ${token}` } });
    const confirmado = await confirmadoRes.json() as { reservado: number; confirmado: number; disponivel: number };
    assert.equal(confirmado.reservado, 0);
    assert.equal(confirmado.confirmado, 1200);
    assert.equal(confirmado.disponivel, 300);

    const cancelamentoDireto = await fetch(`${getBaseUrl()}/pedidos/${pedidoCriado._id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(cancelamentoDireto.status, 409);
    const solicitar = await fetch(`${getBaseUrl()}/pedidos/${pedidoCriado._id}/solicitar-cancelamento`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ motivo: 'Cancelamento de teste' }),
    });
    assert.equal(solicitar.status, 201);
    const antesAprovacaoRes = await fetch(`${getBaseUrl()}/contratos/${contrato._id}/resumo-financeiro`, { headers: { Authorization: `Bearer ${token}` } });
    const antesAprovacao = await antesAprovacaoRes.json() as { confirmado: number; disponivel: number };
    assert.equal(antesAprovacao.confirmado, 1200);
    assert.equal(antesAprovacao.disponivel, 300);

    const aprovar = await fetch(`${getBaseUrl()}/pedidos/${pedidoCriado._id}/aprovar-estorno`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(aprovar.status, 200);
    const depoisAprovacaoRes = await fetch(`${getBaseUrl()}/contratos/${contrato._id}/resumo-financeiro`, { headers: { Authorization: `Bearer ${token}` } });
    const depoisAprovacao = await depoisAprovacaoRes.json() as { confirmado: number; disponivel: number };
    assert.equal(depoisAprovacao.confirmado, 0);
    assert.equal(depoisAprovacao.disponivel, 1500);
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
