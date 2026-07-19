import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clearDatabase, createAdmin, getBaseUrl, getToken, startTestServer, stopTestServer } from './setup.js';
import { ClienteModel } from '../models/cliente.model.js';
import { UserModel } from '../models/user.model.js';

describe('Onboarding de cliente', () => {
  before(startTestServer);
  after(stopTestServer);
  beforeEach(clearDatabase);

  it('cria cliente e usuário master vinculados', async () => {
    await createAdmin();
    const token = await getToken('admin@test.com', 'senha123');
    const res = await fetch(`${getBaseUrl()}/clientes/onboarding`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente: {
          nome: 'Prefeitura Modelo',
          email: 'compras@prefeitura.gov.br',
          documento: '12.345.678/0001-90',
          tipo: 'pessoa-juridica',
          esferaPublica: true,
          ativo: true,
        },
        usuarioMaster: {
          nome: 'Gestor Master',
          email: 'gestor@prefeitura.gov.br',
          password: 'senhaInicial123',
        },
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json() as {
      cliente: { _id: string; usuarioMasterId: string };
      usuarioMaster: { _id: string; clienteId: string; role: string; passwordHash?: string };
    };
    assert.equal(body.usuarioMaster.role, 'cliente');
    assert.equal(body.usuarioMaster.clienteId, body.cliente._id);
    assert.equal(body.usuarioMaster.passwordHash, undefined);

    const cliente = await ClienteModel.findById(body.cliente._id).lean();
    const master = await UserModel.findById(body.usuarioMaster._id).lean();
    assert.equal(String(cliente?.usuarioMasterId), body.usuarioMaster._id);
    assert.equal(String(master?.clienteId), body.cliente._id);
    assert.equal(master?.isMasterCliente, true);
    assert.equal(master?.primeiroAcesso, true);

    const login = await fetch(`${getBaseUrl()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'gestor@prefeitura.gov.br', password: 'senhaInicial123' }),
    });
    assert.equal(login.status, 200);
  });
});
