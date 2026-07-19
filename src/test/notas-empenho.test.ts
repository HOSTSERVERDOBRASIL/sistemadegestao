import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, clearDatabase, seedBase, getBaseUrl } from './setup.js';
import { NotaEmpenhoModel } from '../models/nota-empenho.model.js';
import { PedidoModel } from '../models/pedido.model.js';

describe('Notas de Empenho', () => {
  before(startTestServer);
  after(stopTestServer);
  beforeEach(clearDatabase);

  // ── CRUD básico ────────────────────────────────────────────────────────────

  it('cria nota de empenho com campos obrigatórios', async () => {
    const { token, cliente } = await seedBase();

    const res = await fetch(`${getBaseUrl()}/notas-empenho`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        numero: '2024NE001',
        clienteId: cliente._id,
        valor: 50000,
        dataEmissao: '2024-01-15',
      }),
    });
    assert.equal(res.status, 201);
    const nota = await res.json() as { numero: string; valor: number; status: string; valorUtilizado: number };
    assert.equal(nota.numero, '2024NE001');
    assert.equal(nota.valor, 50000);
    assert.equal(nota.status, 'Aberto');
    assert.equal(nota.valorUtilizado, 0);
  });

  it('rejeita número de empenho duplicado (409)', async () => {
    const { token, cliente } = await seedBase();
    const body = { numero: '2024NE-DUP', clienteId: cliente._id, valor: 1000, dataEmissao: '2024-01-01' };

    const r1 = await fetch(`${getBaseUrl()}/notas-empenho`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    assert.equal(r1.status, 201);

    const r2 = await fetch(`${getBaseUrl()}/notas-empenho`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    assert.equal(r2.status, 409);
  });

  it('rejeita exclusão de nota com pedidos vinculados (409)', async () => {
    const { token, cliente, produto } = await seedBase();

    const notaRes = await fetch(`${getBaseUrl()}/notas-empenho`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ numero: '2024NE-DEL', clienteId: cliente._id, valor: 5000, dataEmissao: '2024-01-01' }),
    });
    const nota = await notaRes.json() as { _id: string };

    await fetch(`${getBaseUrl()}/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        numero: 'P-EMB-DEL',
        clienteId: cliente._id,
        produtoId: produto._id,
        valorTotal: 1000,
        valorTabela: 1000,
        notaEmpenhoId: nota._id,
        vinculo: { tipo: 'EmpenhoSF', empenho: '2024NE-DEL' },
      }),
    });

    const delRes = await fetch(`${getBaseUrl()}/notas-empenho/${nota._id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(delRes.status, 409);
  });

  // ── Débito/estorno de saldo ────────────────────────────────────────────────

  it('debita valorUtilizado ao criar pedido vinculado à nota', async () => {
    const { token, cliente, produto } = await seedBase();

    const notaRes = await fetch(`${getBaseUrl()}/notas-empenho`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ numero: '2024NE-DEB', clienteId: cliente._id, valor: 10000, dataEmissao: '2024-01-01' }),
    });
    const nota = await notaRes.json() as { _id: string };

    await fetch(`${getBaseUrl()}/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        numero: 'P-DEB-001',
        clienteId: cliente._id,
        produtoId: produto._id,
        valorTotal: 3000,
        valorTabela: 3000,
        notaEmpenhoId: nota._id,
        vinculo: { tipo: 'EmpenhoSF', empenho: '2024NE-DEB' },
      }),
    });

    const notaAtualizada = await NotaEmpenhoModel.findById(nota._id).lean();
    assert.equal(notaAtualizada?.valorUtilizado, 3000);
    assert.equal(notaAtualizada?.status, 'Parcialmente utilizado');
  });

  it('rejeita pedido que excede o saldo da nota sem alterar o valor utilizado', async () => {
    const { token, cliente, produto } = await seedBase();
    const nota = await NotaEmpenhoModel.create({
      numero: '2024NE-LIMITE', clienteId: cliente._id, valor: 500,
      dataEmissao: new Date('2024-01-01'), valorUtilizado: 100,
    });
    const res = await fetch(`${getBaseUrl()}/pedidos`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        numero: 'P-NE-LIMITE', clienteId: cliente._id, produtoId: produto._id,
        valorTotal: 450, valorTabela: 450, notaEmpenhoId: nota._id,
        vinculo: { tipo: 'EmpenhoSF', empenho: '2024NE-LIMITE' },
      }),
    });
    assert.equal(res.status, 422);
    assert.equal((await NotaEmpenhoModel.findById(nota._id).lean())?.valorUtilizado, 100);
  });

  it('estorna valorUtilizado ao cancelar pedido vinculado à nota', async () => {
    const { token, cliente, produto } = await seedBase();

    const notaRes = await fetch(`${getBaseUrl()}/notas-empenho`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ numero: '2024NE-EST', clienteId: cliente._id, valor: 10000, dataEmissao: '2024-01-01' }),
    });
    const nota = await notaRes.json() as { _id: string };

    const pedidoRes = await fetch(`${getBaseUrl()}/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        numero: 'P-EST-001',
        clienteId: cliente._id,
        produtoId: produto._id,
        valorTotal: 4000,
        valorTabela: 4000,
        notaEmpenhoId: nota._id,
        vinculo: { tipo: 'EmpenhoSF', empenho: '2024NE-EST' },
      }),
    });
    const pedido = await pedidoRes.json() as { _id: string };

    // Confirma débito
    const notaAposDebito = await NotaEmpenhoModel.findById(nota._id).lean();
    assert.equal(notaAposDebito?.valorUtilizado, 4000);

    // Cancela o pedido
    await fetch(`${getBaseUrl()}/pedidos/${pedido._id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    // Confirma estorno
    const notaAposEstorno = await NotaEmpenhoModel.findById(nota._id).lean();
    assert.equal(notaAposEstorno?.valorUtilizado, 0);
    assert.equal(notaAposEstorno?.status, 'Aberto');
  });

  it('retorna ao status Aberto quando valorUtilizado volta a zero após estorno', async () => {
    const { token, cliente, produto } = await seedBase();

    const nota = await NotaEmpenhoModel.create({
      numero: '2024NE-REOPEN',
      clienteId: cliente._id,
      valor: 5000,
      dataEmissao: new Date('2024-01-01'),
      status: 'Parcialmente utilizado',
      valorUtilizado: 2000,
    });

    const pedido = await PedidoModel.create({
      numero: 'P-REOPEN',
      clienteId: cliente._id,
      produtoId: produto._id,
      valorTotal: 2000,
      valorTabela: 2000,
      notaEmpenhoId: nota._id,
      vinculo: { tipo: 'EmpenhoSF', empenho: '2024NE-REOPEN' },
      etapaOperacional: 'Pedido',
      historicoEtapas: [{ etapa: 'Pedido', data: new Date() }],
    });

    await fetch(`${getBaseUrl()}/pedidos/${pedido._id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    const notaFinal = await NotaEmpenhoModel.findById(nota._id).lean();
    assert.equal(notaFinal?.valorUtilizado, 0);
    assert.equal(notaFinal?.status, 'Aberto');
  });

  // ── Lei 4.320/64 ──────────────────────────────────────────────────────────

  it('rejeita pedido de cliente esfera pública sem empenho (422)', async () => {
    const { token, produto } = await seedBase();

    const clienteRes = await fetch(`${getBaseUrl()}/clientes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        nome: 'Prefeitura Teste',
        email: 'pref@teste.gov.br',
        documento: '11.222.333/0001-44',
        tipo: 'pessoa-juridica',
        esferaPublica: true,
      }),
    });
    const clientePublico = await clienteRes.json() as { _id: string };

    const res = await fetch(`${getBaseUrl()}/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        numero: 'P-LEI-001',
        clienteId: clientePublico._id,
        produtoId: produto._id,
        valorTotal: 5000,
        valorTabela: 5000,
        vinculo: { tipo: 'CompraDireta', comprovantePagamentoAprovado: true },
      }),
    });
    assert.equal(res.status, 422);
    const body = await res.json() as { message: string };
    assert.ok(body.message.includes('4.320'));
  });

  it('aceita pedido de cliente esfera pública com empenho no vínculo', async () => {
    const { token, produto } = await seedBase();

    const clienteRes = await fetch(`${getBaseUrl()}/clientes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        nome: 'Secretaria Teste',
        email: 'sec@teste.gov.br',
        documento: '22.333.444/0001-55',
        tipo: 'pessoa-juridica',
        esferaPublica: true,
      }),
    });
    const clientePublico = await clienteRes.json() as { _id: string };

    const res = await fetch(`${getBaseUrl()}/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        numero: 'P-LEI-002',
        clienteId: clientePublico._id,
        produtoId: produto._id,
        valorTotal: 5000,
        valorTabela: 5000,
        vinculo: { tipo: 'EmpenhoSF', empenho: '2024NE999' },
      }),
    });
    assert.equal(res.status, 201);
  });

  it('aceita pedido de cliente esfera pública com notaEmpenhoId', async () => {
    const { token, produto } = await seedBase();

    const clienteRes = await fetch(`${getBaseUrl()}/clientes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        nome: 'Autarquia Teste',
        email: 'aut@teste.gov.br',
        documento: '33.444.555/0001-66',
        tipo: 'pessoa-juridica',
        esferaPublica: true,
      }),
    });
    const clientePublico = await clienteRes.json() as { _id: string };

    const notaRes = await fetch(`${getBaseUrl()}/notas-empenho`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        numero: '2024NE-AUT',
        clienteId: clientePublico._id,
        valor: 20000,
        dataEmissao: '2024-01-01',
      }),
    });
    const nota = await notaRes.json() as { _id: string };

    const res = await fetch(`${getBaseUrl()}/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        numero: 'P-LEI-003',
        clienteId: clientePublico._id,
        produtoId: produto._id,
        valorTotal: 5000,
        valorTabela: 5000,
        notaEmpenhoId: nota._id,
        vinculo: { tipo: 'EmpenhoSF', empenho: '2024NE-AUT' },
      }),
    });
    assert.equal(res.status, 201);
  });

  // ── GET /notas-empenho/:id/pedidos ────────────────────────────────────────

  it('retorna pedidos vinculados à nota', async () => {
    const { token, cliente, produto } = await seedBase();

    const notaRes = await fetch(`${getBaseUrl()}/notas-empenho`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ numero: '2024NE-LIST', clienteId: cliente._id, valor: 20000, dataEmissao: '2024-01-01' }),
    });
    const nota = await notaRes.json() as { _id: string };

    // Cria dois pedidos vinculados
    for (let i = 1; i <= 2; i++) {
      await fetch(`${getBaseUrl()}/pedidos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          numero: `P-LIST-00${i}`,
          clienteId: cliente._id,
          produtoId: produto._id,
          valorTotal: 1000,
          valorTabela: 1000,
          notaEmpenhoId: nota._id,
          vinculo: { tipo: 'EmpenhoSF', empenho: '2024NE-LIST' },
        }),
      });
    }

    const listRes = await fetch(`${getBaseUrl()}/notas-empenho/${nota._id}/pedidos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(listRes.status, 200);
    const pedidos = await listRes.json() as unknown[];
    assert.equal(pedidos.length, 2);
  });
});
