import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer, clearDatabase, createAdmin, getBaseUrl, getToken } from './setup.js';

describe('Auth', () => {
  before(startTestServer);
  after(stopTestServer);
  beforeEach(clearDatabase);

  it('POST /auth/login retorna token com credenciais válidas', async () => {
    await createAdmin();
    const res = await fetch(`${getBaseUrl()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'senha123' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { token: string; user: { role: string } };
    assert.ok(body.token, 'deve retornar token');
    assert.equal(body.user.role, 'admin');
  });

  it('POST /auth/login retorna 401 com senha errada', async () => {
    await createAdmin();
    const res = await fetch(`${getBaseUrl()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'errada' }),
    });
    assert.equal(res.status, 401);
  });

  it('POST /auth/login retorna 401 com e-mail inexistente', async () => {
    const res = await fetch(`${getBaseUrl()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'naoexiste@test.com', password: 'qualquer' }),
    });
    assert.equal(res.status, 401);
  });

  it('GET /auth/me retorna usuário autenticado', async () => {
    await createAdmin();
    const token = await getToken('admin@test.com', 'senha123');
    const res = await fetch(`${getBaseUrl()}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { email: string; passwordHash?: string };
    assert.equal(body.email, 'admin@test.com');
    assert.equal(body.passwordHash, undefined, 'não deve expor passwordHash');
  });

  it('GET /auth/me retorna 401 sem token', async () => {
    const res = await fetch(`${getBaseUrl()}/auth/me`);
    assert.equal(res.status, 401);
  });

  it('GET /auth/me retorna 401 com token inválido', async () => {
    const res = await fetch(`${getBaseUrl()}/auth/me`, {
      headers: { Authorization: 'Bearer token-invalido' },
    });
    assert.equal(res.status, 401);
  });
});
