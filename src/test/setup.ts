// Definir variáveis de ambiente antes de qualquer import que acesse env.ts
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-atlasX-2026';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { app } from '../app.js';
import { UserModel } from '../models/user.model.js';
import { ClienteModel } from '../models/cliente.model.js';
import { ProdutoModel } from '../models/produto.model.js';
import { ParceiroModel } from '../models/parceiro.model.js';
import { ContratoModel } from '../models/contrato.model.js';
import { PedidoModel } from '../models/pedido.model.js';
import { NotaFiscalModel } from '../models/nota-fiscal.model.js';
import { OrdemFornecimentoModel } from '../models/ordem-fornecimento.model.js';
import type { IncomingMessage, ServerResponse } from 'http';
import http from 'http';

let memoryServer: MongoMemoryServer;
let server: http.Server;
let baseUrl: string;

export async function startTestServer() {
  // Garante desconexão limpa de qualquer conexão anterior
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  memoryServer = await MongoMemoryServer.create({ instance: { launchTimeout: 60_000 } });
  await mongoose.connect(memoryServer.getUri(), { dbName: 'test' });

  server = http.createServer(app as unknown as (req: IncomingMessage, res: ServerResponse) => void);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
}

export async function stopTestServer() {
  await server?.close();
  await mongoose.disconnect();
  await memoryServer?.stop();
}

export async function clearDatabase() {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map(c => c.deleteMany({})));
}

export function getBaseUrl() { return baseUrl; }

export async function createAdmin() {
  return UserModel.create({
    nome: 'Admin Teste',
    email: 'admin@test.com',
    passwordHash: await bcrypt.hash('senha123', 10),
    role: 'admin',
  });
}

export async function createFinanceiro() {
  return UserModel.create({
    nome: 'Financeiro Teste',
    email: 'fin@test.com',
    passwordHash: await bcrypt.hash('senha123', 10),
    role: 'financeiro',
  });
}

export async function getToken(email: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json() as { token: string };
  return data.token;
}

let _pedidoSeq = 0;
export async function criarPedidoTeste(clienteId: unknown, produtoId: unknown, valorTotal = 500) {
  _pedidoSeq++;
  return PedidoModel.create({
    numero: `P-TEST-${String(_pedidoSeq).padStart(3, '0')}`,
    clienteId,
    produtoId,
    quantidade: 1,
    valorUnitario: valorTotal,
    valorTotal,
    valorTabela: valorTotal,
    vinculo: { tipo: 'CompraDireta', comprovantePagamentoAprovado: false },
    etapaOperacional: 'Pedido',
    historicoEtapas: [{ etapa: 'Pedido', data: new Date() }],
  });
}

export async function seedBase() {
  const admin = await createAdmin();
  const token = await getToken('admin@test.com', 'senha123');

  const cliente = await ClienteModel.create({
    nome: 'Cliente Teste',
    email: 'cliente@test.com',
    documento: '12.345.678/0001-99',
    tipo: 'pessoa-juridica',
  });

  const produto = await ProdutoModel.create({
    codigo: 'PROD-001',
    nome: 'Produto Teste',
    preco: 5000,
    estoque: 100,
  });

  const parceiro = await ParceiroModel.create({
    nome: 'Parceiro Teste',
    documento: '98.765.432/0001-10',
    email: 'parceiro@test.com',
    emissorNFPadrao: 'Revendedor',
    saldoCreditos: 100000,
  });

  return { admin, token, cliente, produto, parceiro };
}
