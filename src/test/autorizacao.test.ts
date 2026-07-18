import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, clearDatabase, createFinanceiro, createAdmin, getToken, getBaseUrl } from './setup.js';
import { ClienteModel } from '../models/cliente.model.js';

describe('Autorização por perfil', () => {
  before(startTestServer);
  after(stopTestServer);
  beforeEach(clearDatabase);

  it('financeiro pode listar clientes (GET)', async () => {
    await createFinanceiro();
    const token = await getToken('fin@test.com', 'senha123');

    const res = await fetch(`${getBaseUrl()}/clientes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
  });

  it('financeiro não pode criar cliente (POST) — 403', async () => {
    await createFinanceiro();
    const token = await getToken('fin@test.com', 'senha123');

    const res = await fetch(`${getBaseUrl()}/clientes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ nome: 'X', email: 'x@x.com', documento: '000', tipo: 'pessoa-juridica' }),
    });
    assert.equal(res.status, 403);
  });

  it('financeiro não pode acessar /usuarios — 403', async () => {
    await createFinanceiro();
    const token = await getToken('fin@test.com', 'senha123');

    const res = await fetch(`${getBaseUrl()}/usuarios`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 403);
  });

  it('admin pode acessar /usuarios', async () => {
    await createAdmin();
    const token = await getToken('admin@test.com', 'senha123');

    const res = await fetch(`${getBaseUrl()}/usuarios`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
  });

  it('sem token retorna 401 em qualquer rota protegida', async () => {
    const rotas = ['/clientes', '/pedidos', '/contratos', '/financeiro/notas', '/relatorios/resumo'];
    for (const rota of rotas) {
      const res = await fetch(`${getBaseUrl()}${rota}`);
      assert.equal(res.status, 401, `esperava 401 em ${rota}`);
    }
  });

  it('admin não pode desativar o próprio usuário', async () => {
    const admin = await createAdmin();
    const token = await getToken('admin@test.com', 'senha123');

    const res = await fetch(`${getBaseUrl()}/usuarios/${admin._id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 400);
  });

  it('cliente/:id/pedidos retorna pedidos vinculados', async () => {
    await createAdmin();
    const token = await getToken('admin@test.com', 'senha123');

    const cliente = await ClienteModel.create({
      nome: 'Cliente Auth',
      email: 'cliauth@test.com',
      documento: '11.222.333/0001-44',
      tipo: 'pessoa-juridica',
    });

    const res = await fetch(`${getBaseUrl()}/clientes/${cliente._id}/pedidos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json() as unknown[];
    assert.ok(Array.isArray(body));
  });
});
