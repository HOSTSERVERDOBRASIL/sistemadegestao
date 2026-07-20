import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { ClienteModel } from '../models/cliente.model.js';
import { PedidoModel } from '../models/pedido.model.js';
import { UserModel } from '../models/user.model.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { escapeRegex, parseLimit, parsePage } from '../utils/query.js';
import { consultarCNPJ, consultarCPF } from '../services/cadastro-publico.service.js';
import { registrarAuditoria } from '../services/auditoria.service.js';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import type { Types } from 'mongoose';

const router = Router();

function toFilter(v: string | undefined) {
  if (!v) return undefined
  const arr = v.split(',').map(s => s.trim()).filter(Boolean)
  return arr.length === 1 ? arr[0] : { $in: arr }
}

router.get('/consulta/documento/:documento', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const documento = String(req.params.documento).replace(/\D/g, '');
    res.json(documento.length === 14 ? await consultarCNPJ(documento) : await consultarCPF(documento));
  } catch (error) { next(error); }
});

router.post('/:id/revalidar-cadastro', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const cliente = await ClienteModel.findById(req.params.id);
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado' });
    const documento = cliente.documento.replace(/\D/g, '');
    if (documento.length !== 14) return res.status(422).json({ message: 'Revalidação cadastral disponível para CNPJ' });
    const cadastro = await consultarCNPJ(documento);
    cliente.nome = cadastro.nome || cliente.nome;
    cliente.esferaPublica = cadastro.esferaPublica;
    cliente.esferaPublicaRevisao = cadastro.revisaoManual;
    cliente.situacaoCadastral = cadastro.situacaoDescricao;
    cliente.naturezaJuridicaCodigo = cadastro.naturezaJuridicaCodigo;
    cliente.naturezaJuridicaDescricao = cadastro.naturezaJuridicaDescricao;
    cliente.validadoSerproEm = new Date();
    await cliente.save();
    res.json(cliente);
  } catch (error) { next(error); }
});

router.post('/:id/lgpd', authenticate, authorize('admin', 'operador'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const tipo = String(req.body.tipo ?? '');
    if (!['Acesso', 'Correcao', 'Exclusao', 'Portabilidade'].includes(tipo)) {
      return res.status(400).json({ message: 'Tipo de solicitação LGPD inválido' });
    }
    const cliente = await ClienteModel.findById(req.params.id);
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado' });
    cliente.solicitacoesLgpd.push({ tipo: tipo as 'Acesso', status: 'Registrada', motivo: String(req.body.motivo ?? '').trim() || undefined, solicitadaEm: new Date() });
    await cliente.save();
    await registrarAuditoria({ entidade: 'Cliente', entidadeId: cliente._id, acao: 'solicitacao_lgpd_registrada', usuarioId: req.user?.id as unknown as Types.ObjectId, origem: 'Painel', detalhes: { tipo } });
    res.status(201).json(cliente);
  } catch (error) { next(error); }
});

router.patch('/:id/lgpd/:solicitacaoId', authenticate, authorize('admin'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const status = String(req.body.status ?? '');
    if (!['Em analise', 'Atendida', 'Negada'].includes(status)) return res.status(400).json({ message: 'Status LGPD inválido' });
    const cliente = await ClienteModel.findById(req.params.id);
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado' });
    const solicitacao = cliente.solicitacoesLgpd.find(item => String((item as { _id?: unknown })._id) === String(req.params.solicitacaoId));
    if (!solicitacao) return res.status(404).json({ message: 'Solicitação LGPD não encontrada' });
    solicitacao.status = status as 'Em analise' | 'Atendida' | 'Negada';
    if (status === 'Atendida' || status === 'Negada') {
      solicitacao.resolvidaEm = new Date();
      solicitacao.resolvidaPor = req.user?.id as unknown as Types.ObjectId;
    }
    await cliente.save();
    await registrarAuditoria({ entidade: 'Cliente', entidadeId: cliente._id, acao: 'solicitacao_lgpd_atualizada', usuarioId: req.user?.id as unknown as Types.ObjectId, origem: 'Painel', detalhes: { tipo: solicitacao.tipo, status } });
    res.json(cliente);
  } catch (error) { next(error); }
});

router.get('/', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const { busca, tipo, ativo, servicosContratados } = req.query as Record<string, string>;
    const page = parsePage(req.query.page as string);
    const limit = parseLimit(req.query.limit as string);
    const filter: Record<string, unknown> = {};
    if (busca) {
      const safe = escapeRegex(busca);
      filter.$or = [
        { nome: { $regex: safe, $options: 'i' } },
        { email: { $regex: safe, $options: 'i' } },
        { documento: { $regex: safe, $options: 'i' } }
      ];
    }
    const tipoFilter = toFilter(tipo)
    if (tipoFilter) filter.tipo = tipoFilter;
    if (ativo !== undefined) filter.ativo = ativo === 'true';
    if (servicosContratados) filter.servicosContratados = { $in: [servicosContratados] };

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      ClienteModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      ClienteModel.countDocuments(filter)
    ]);
    res.json({ data, total, page, limit });
  } catch (error) {
    next(error);
  }
});

router.post('/onboarding', authenticate, authorize('admin', 'operador'), async (req: AuthenticatedRequest, res, next) => {
  let clienteCriadoId: Types.ObjectId | undefined;
  let usuarioCriadoId: Types.ObjectId | undefined;
  try {
    const clienteInput = req.body.cliente as Record<string, unknown> | undefined;
    const masterInput = req.body.usuarioMaster as Record<string, unknown> | undefined;
    const nome = String(clienteInput?.nome ?? '').trim();
    const email = String(clienteInput?.email ?? '').trim().toLowerCase();
    const documento = String(clienteInput?.documento ?? '').replace(/\D/g, '');
    const masterNome = String(masterInput?.nome ?? '').trim();
    const masterEmail = String(masterInput?.email ?? '').trim().toLowerCase();
    const masterPassword = String(masterInput?.password ?? '');

    if (!nome || !email || !documento) {
      return res.status(400).json({ message: 'Preencha os dados obrigatórios do cliente' });
    }
    if (!masterNome || !masterEmail) {
      return res.status(400).json({ message: 'Nome e e-mail do usuário master são obrigatórios' });
    }
    if (masterPassword.length < 6) {
      return res.status(400).json({ message: 'A senha inicial do usuário master deve ter ao menos 6 caracteres' });
    }
    if (await UserModel.exists({ email: masterEmail })) {
      return res.status(409).json({ message: 'Já existe um usuário com o e-mail master informado' });
    }

    const cliente = await ClienteModel.create({
      nome,
      email,
      documento,
      tipo: clienteInput?.tipo,
      telefone: clienteInput?.telefone,
      esferaPublica: Boolean(clienteInput?.esferaPublica),
      ativo: clienteInput?.ativo !== false,
    });
    clienteCriadoId = cliente._id as Types.ObjectId;

    const passwordHash = await bcrypt.hash(masterPassword, 12);
    const usuarioMaster = await UserModel.create({
      nome: masterNome,
      email: masterEmail,
      passwordHash,
      role: 'cliente',
      clienteId: cliente._id,
      isMasterCliente: true,
      primeiroAcesso: true,
      ativo: true,
    });
    usuarioCriadoId = usuarioMaster._id as Types.ObjectId;

    cliente.usuarioMasterId = usuarioMaster._id as Types.ObjectId;
    await cliente.save();
    await registrarAuditoria({
      entidade: 'Cliente',
      entidadeId: cliente._id,
      acao: 'cliente_e_usuario_master_criados',
      usuarioId: req.user?.id as unknown as Types.ObjectId,
      origem: 'Painel',
      detalhes: { usuarioMasterId: String(usuarioMaster._id), esferaPublica: cliente.esferaPublica },
    });

    const { passwordHash: _passwordHash, ...usuarioSeguro } = usuarioMaster.toObject();
    res.status(201).json({ cliente, usuarioMaster: usuarioSeguro });
  } catch (error) {
    if (usuarioCriadoId) await UserModel.deleteOne({ _id: usuarioCriadoId }).catch(() => undefined);
    if (clienteCriadoId) await ClienteModel.deleteOne({ _id: clienteCriadoId }).catch(() => undefined);
    next(error);
  }
});

router.get('/:id', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const cliente = await ClienteModel.findById(req.params.id)
      .populate('usuarioMasterId', 'nome email role');
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado' });
    res.json(cliente);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { nome, email, documento, tipo, telefone, esferaPublica } = req.body as Record<string, unknown>;
    if (!nome || !email || !documento) {
      return res.status(400).json({ message: 'Campos obrigatórios: nome, email, documento' });
    }
    const cliente = await ClienteModel.create({ nome, email, documento, tipo, telefone, esferaPublica });
    res.status(201).json(cliente);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { nome, email, documento, tipo, telefone, esferaPublica, ativo } = req.body as Record<string, unknown>;
    const allowed: Record<string, unknown> = {};
    if (nome !== undefined) allowed.nome = nome;
    if (email !== undefined) allowed.email = email;
    if (documento !== undefined) allowed.documento = documento;
    if (tipo !== undefined) allowed.tipo = tipo;
    if (telefone !== undefined) allowed.telefone = telefone;
    if (esferaPublica !== undefined) allowed.esferaPublica = Boolean(esferaPublica);
    if (ativo !== undefined) allowed.ativo = ativo;
    const cliente = await ClienteModel.findByIdAndUpdate(req.params.id, allowed, { new: true, runValidators: true });
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado' });
    res.json(cliente);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/ativo', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { ativo } = req.body as { ativo: boolean };
    if (typeof ativo !== 'boolean') return res.status(400).json({ message: 'Campo ativo deve ser boolean' });
    const cliente = await ClienteModel.findByIdAndUpdate(req.params.id, { ativo }, { new: true });
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado' });
    res.json(cliente);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const cliente = await ClienteModel.findByIdAndUpdate(req.params.id, { ativo: false }, { new: true });
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado' });
    res.json({ message: 'Cliente desativado', cliente });
  } catch (error) {
    next(error);
  }
});

// PATCH /clientes/:id/portfolio-ssl — upsert item no portfolioSSL
router.patch('/:id/portfolio-ssl', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { produtoId, nome, tipo, fornecedor, quantidade, precoCusto, precoVenda, numContrato, ativo } = req.body as Record<string, unknown>;
    if (!produtoId || !nome || !tipo || quantidade === undefined) {
      return res.status(400).json({ message: 'Campos obrigatórios: produtoId, nome, tipo, quantidade' });
    }
    const cliente = await ClienteModel.findById(req.params.id);
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado' });

    const arr = (cliente as unknown as Record<string, unknown[]>).portfolioSSL as Record<string, unknown>[] | undefined ?? [];
    const idx = arr.findIndex(i => String(i.produtoId) === String(produtoId));
    const item: Record<string, unknown> = { produtoId, nome, tipo, quantidade };
    if (fornecedor !== undefined) item.fornecedor = fornecedor;
    if (precoCusto !== undefined) item.precoCusto = precoCusto;
    if (precoVenda !== undefined) item.precoVenda = precoVenda;
    if (numContrato !== undefined) item.numContrato = numContrato;
    if (ativo !== undefined) item.ativo = ativo;

    if (idx >= 0) {
      await ClienteModel.findByIdAndUpdate(req.params.id, { $set: { [`portfolioSSL.${idx}`]: item } }, { new: true, runValidators: true });
    } else {
      await ClienteModel.findByIdAndUpdate(req.params.id, { $push: { portfolioSSL: item } }, { new: true, runValidators: true });
    }
    const updated = await ClienteModel.findById(req.params.id).populate('usuarioMasterId', 'nome email role');
    res.json(updated);
  } catch (error) { next(error); }
});

// PATCH /clientes/:id/portfolio-icp — upsert item no portfolioICP
router.patch('/:id/portfolio-icp', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { produtoId, produtoAlias, nome, fornecedor, tipoCertificado, finalidade, autoridadeCertificadora, quantidade, precoCusto, precoVenda, numContrato } = req.body as Record<string, unknown>;
    if (!produtoId || !nome || !fornecedor || quantidade === undefined) {
      return res.status(400).json({ message: 'Campos obrigatórios: produtoId, nome, fornecedor, quantidade' });
    }
    const cliente = await ClienteModel.findById(req.params.id);
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado' });

    const arr = (cliente as unknown as Record<string, unknown[]>).portfolioICP as Record<string, unknown>[] | undefined ?? [];
    const idx = arr.findIndex(i => String(i.produtoId) === String(produtoId));
    const item: Record<string, unknown> = { produtoId, nome, fornecedor, quantidade };
    if (produtoAlias !== undefined) item.produtoAlias = produtoAlias;
    if (tipoCertificado !== undefined) item.tipoCertificado = tipoCertificado;
    if (finalidade !== undefined) item.finalidade = finalidade;
    if (autoridadeCertificadora !== undefined) item.autoridadeCertificadora = autoridadeCertificadora;
    if (precoCusto !== undefined) item.precoCusto = precoCusto;
    if (precoVenda !== undefined) item.precoVenda = precoVenda;
    if (numContrato !== undefined) item.numContrato = numContrato;

    if (idx >= 0) {
      await ClienteModel.findByIdAndUpdate(req.params.id, { $set: { [`portfolioICP.${idx}`]: item } }, { new: true, runValidators: true });
    } else {
      await ClienteModel.findByIdAndUpdate(req.params.id, { $push: { portfolioICP: item } }, { new: true, runValidators: true });
    }
    const updated = await ClienteModel.findById(req.params.id).populate('usuarioMasterId', 'nome email role');
    res.json(updated);
  } catch (error) { next(error); }
});

// PATCH /clientes/:id/equipe — upsert de membro na equipe pelo email
router.patch('/:id/equipe', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { email, nome, primeiroNome, ultimoNome, cargo, telefone, cpf, permissions, role } = req.body as Record<string, unknown>;
    if (!email || !nome) {
      return res.status(400).json({ message: 'Campos obrigatórios: email, nome' });
    }
    const cliente = await ClienteModel.findById(req.params.id);
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado' });

    const arr = (cliente as unknown as Record<string, unknown[]>).equipe as Record<string, unknown>[] | undefined ?? [];
    const idx = arr.findIndex(i => String(i.email) === String(email).toLowerCase().trim());
    const member: Record<string, unknown> = { email: String(email).toLowerCase().trim(), nome };
    if (primeiroNome !== undefined) member.primeiroNome = primeiroNome;
    if (ultimoNome !== undefined) member.ultimoNome = ultimoNome;
    if (cargo !== undefined) member.cargo = cargo;
    if (telefone !== undefined) member.telefone = telefone;
    if (cpf !== undefined) member.cpf = cpf;
    if (permissions !== undefined) member.permissions = permissions;
    if (role !== undefined) member.role = role;

    if (idx >= 0) {
      await ClienteModel.findByIdAndUpdate(req.params.id, { $set: { [`equipe.${idx}`]: member } }, { new: true, runValidators: true });
    } else {
      await ClienteModel.findByIdAndUpdate(req.params.id, { $push: { equipe: member } }, { new: true, runValidators: true });
    }
    const updated = await ClienteModel.findById(req.params.id).populate('usuarioMasterId', 'nome email role');
    res.json(updated);
  } catch (error) { next(error); }
});

// DELETE /clientes/:id/equipe/:email — remove membro da equipe pelo email
router.delete('/:id/equipe/:email', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const emailParam = decodeURIComponent(req.params.email as string).toLowerCase().trim();
    const cliente = await ClienteModel.findByIdAndUpdate(
      req.params.id,
      { $pull: { equipe: { email: emailParam } } },
      { new: true }
    ).populate('usuarioMasterId', 'nome email role');
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado' });
    res.json(cliente);
  } catch (error) { next(error); }
});

// PATCH /clientes/:id/dados-sectigo — salva sectigoData (somente admin)
router.patch('/:id/dados-sectigo', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const payload = req.body as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      update[`sectigoData.${key}`] = value;
    }
    const cliente = await ClienteModel.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true }
    ).populate('usuarioMasterId', 'nome email role');
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado' });
    res.json(cliente);
  } catch (error) { next(error); }
});

// PATCH /clientes/:id/financeiro — atualiza campos financeiros
router.patch('/:id/financeiro', authenticate, authorize('admin', 'financeiro'), async (req, res, next) => {
  try {
    const { paymentMethod, formaAPagar, dataPagamento, dataFechamento, limiteCredito, statusCadastro } = req.body as Record<string, unknown>;
    const allowed: Record<string, unknown> = {};
    if (paymentMethod !== undefined) allowed.paymentMethod = paymentMethod;
    if (formaAPagar !== undefined) allowed.formaAPagar = formaAPagar;
    if (dataPagamento !== undefined) allowed.dataPagamento = dataPagamento;
    if (dataFechamento !== undefined) allowed.dataFechamento = dataFechamento;
    if (limiteCredito !== undefined) allowed.limiteCredito = limiteCredito;
    if (statusCadastro !== undefined) allowed.statusCadastro = statusCadastro;
    const cliente = await ClienteModel.findByIdAndUpdate(
      req.params.id,
      { $set: allowed },
      { new: true, runValidators: true }
    ).populate('usuarioMasterId', 'nome email role');
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado' });
    res.json(cliente);
  } catch (error) { next(error); }
});

router.get('/:id/pedidos', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const pedidos = await PedidoModel.find({ clienteId: req.params.id })
      .populate('produtoId', 'codigo nome preco')
      .sort({ createdAt: -1 });
    res.json(pedidos);
  } catch (error) {
    next(error);
  }
});

// PATCH /clientes/:id/licitacoes — upsert de licitação pelo número de contrato
router.patch('/:id/licitacoes', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const cliente = await ClienteModel.findById(req.params.id);
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado' });
    const { contrato, ...rest } = req.body;
    if (!contrato) return res.status(400).json({ message: 'contrato obrigatório' });
    const licitacoes = (cliente as any).licitacoes as any[] ?? [];
    const idx = licitacoes.findIndex((l: any) => l.contrato === contrato);
    if (idx >= 0) {
      Object.assign(licitacoes[idx], rest);
    } else {
      licitacoes.push({ contrato, ...rest });
    }
    (cliente as any).licitacoes = licitacoes;
    await cliente.save();
    res.json(cliente);
  } catch (e) { next(e); }
});

// DELETE /clientes/:id/licitacoes/:licitacaoId
router.delete('/:id/licitacoes/:licitacaoId', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const cliente = await ClienteModel.findByIdAndUpdate(
      req.params.id,
      { $pull: { licitacoes: { _id: req.params.licitacaoId } } },
      { new: true }
    );
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado' });
    res.json(cliente);
  } catch (e) { next(e); }
});

// POST /clientes/:id/financeiro-clm/entrada — registrar recebimento
router.post('/:id/financeiro-clm/entrada', authenticate, authorize('admin', 'financeiro'), async (req, res, next) => {
  try {
    const { tipo, valor, data, descricao, numeroPedido, nomeUser, arquivo } = req.body;
    if (!tipo || !valor || !data) return res.status(400).json({ message: 'tipo, valor e data são obrigatórios' });
    const cliente = await ClienteModel.findByIdAndUpdate(
      req.params.id,
      { $push: { 'financeiroClm.entrada': { tipo, valor: Number(valor), data: new Date(data), descricao, numeroPedido, userId: (req as any).user?.id, nomeUser, arquivo } } },
      { new: true }
    );
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado' });
    res.json(cliente);
  } catch (e) { next(e); }
});

// POST /clientes/:id/financeiro-clm/saida — registrar pagamento
router.post('/:id/financeiro-clm/saida', authenticate, authorize('admin', 'financeiro'), async (req, res, next) => {
  try {
    const { tipo, valor, data, descricao, numeroPedido, nomeUser, arquivo } = req.body;
    if (!tipo || !valor || !data) return res.status(400).json({ message: 'tipo, valor e data são obrigatórios' });
    const cliente = await ClienteModel.findByIdAndUpdate(
      req.params.id,
      { $push: { 'financeiroClm.saida': { tipo, valor: Number(valor), data: new Date(data), descricao, numeroPedido, userId: (req as any).user?.id, nomeUser, arquivo } } },
      { new: true }
    );
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado' });
    res.json(cliente);
  } catch (e) { next(e); }
});

// DELETE /clientes/:id/financeiro-clm/:fluxo/:movId — remover movimento
router.delete('/:id/financeiro-clm/:fluxo/:movId', authenticate, authorize('admin', 'financeiro'), async (req, res, next) => {
  try {
    const { fluxo, movId } = req.params;
    const fluxoStr = Array.isArray(fluxo) ? fluxo[0] : fluxo;
    if (!['entrada', 'saida'].includes(fluxoStr)) return res.status(400).json({ message: 'fluxo deve ser entrada ou saida' });
    const field = `financeiroClm.${fluxoStr}` as 'financeiroClm.entrada' | 'financeiroClm.saida';
    const update = { $pull: { [field]: { _id: movId } } };
    const cliente = await ClienteModel.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!cliente) return res.status(404).json({ message: 'Cliente não encontrado' });
    res.json(cliente);
  } catch (e) { next(e); }
});

export { router as clientesRouter };
