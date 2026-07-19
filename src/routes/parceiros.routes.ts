import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { ParceiroModel } from '../models/parceiro.model.js';
import { PedidoModel } from '../models/pedido.model.js';
import { MovimentoCreditoRevendaModel } from '../models/movimento-credito-revenda.model.js';
import { UserModel } from '../models/user.model.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { escapeRegex } from '../utils/query.js';
import { movimentarCreditoRevenda, obterRegraCobrancaRevenda } from '../services/revenda-cobranca.service.js';

const router = Router();

router.get('/', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const { page = '1', limit = '20', busca, ativo, emissorNFPadrao } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = {};
    if (busca) {
      const safe = escapeRegex(busca);
      filter.$or = [
        { nome: { $regex: safe, $options: 'i' } },
        { documento: { $regex: safe, $options: 'i' } },
        { email: { $regex: safe, $options: 'i' } }
      ];
    }
    if (ativo !== undefined) filter.ativo = ativo === 'true';
    if (emissorNFPadrao) filter.emissorNFPadrao = emissorNFPadrao;

    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      ParceiroModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      ParceiroModel.countDocuments(filter)
    ]);
    res.json({ data, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const parceiro = await ParceiroModel.findById(req.params.id);
    if (!parceiro) return res.status(404).json({ message: 'Parceiro não encontrado' });
    res.json(parceiro);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/regras-cobranca', authenticate, authorize('admin', 'operador', 'financeiro', 'revenda'), async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (authReq.user?.role === 'revenda' && req.params.id !== authReq.user.parceiroId) {
      return res.status(403).json({ message: 'Sem permissão' });
    }
    const parceiroId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const resultado = await obterRegraCobrancaRevenda(parceiroId);
    if (!resultado) return res.status(404).json({ message: 'Parceiro não encontrado' });
    res.json({ origem: resultado.origem, regras: resultado.regras, saldoCreditos: resultado.parceiro.saldoCreditos ?? 0 });
  } catch (error) { next(error); }
});

router.get('/:id/creditos', authenticate, authorize('admin', 'operador', 'financeiro', 'revenda'), async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (authReq.user?.role === 'revenda' && req.params.id !== authReq.user.parceiroId) {
      return res.status(403).json({ message: 'Sem permissão' });
    }
    const parceiro = await ParceiroModel.findById(req.params.id).select('saldoCreditos').lean();
    if (!parceiro) return res.status(404).json({ message: 'Parceiro não encontrado' });
    const movimentos = await MovimentoCreditoRevendaModel.find({ parceiroId: req.params.id })
      .populate('usuarioId', 'nome email').sort({ createdAt: -1 }).limit(100).lean();
    res.json({ saldo: parceiro.saldoCreditos ?? 0, movimentos });
  } catch (error) { next(error); }
});

router.post('/:id/creditos', authenticate, authorize('admin', 'financeiro'), async (req, res, next) => {
  try {
    const parceiroId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const valor = Number(req.body.valor);
    const tipo = req.body.tipo === 'Ajuste' ? 'Ajuste' : 'Aporte';
    if (!Number.isFinite(valor) || valor === 0) return res.status(400).json({ message: 'Informe um valor diferente de zero' });
    const resultado = await movimentarCreditoRevenda({
      parceiroId,
      valor,
      tipo,
      descricao: String(req.body.descricao || (tipo === 'Aporte' ? 'Recarga manual de créditos' : 'Ajuste manual de saldo')),
      usuarioId: (req as { user?: { id: string } }).user?.id,
    });
    res.status(201).json({ saldo: resultado.parceiro.saldoCreditos, movimento: resultado.movimento });
  } catch (error) {
    if (error instanceof Error && ['Revenda não encontrada', 'Saldo de créditos insuficiente', 'O valor deve ser maior que zero'].includes(error.message)) {
      return res.status(error.message === 'Revenda não encontrada' ? 404 : 422).json({ message: error.message });
    }
    next(error);
  }
});

router.post('/', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { nome, email, documento, telefone, emissorNFPadrao, comissaoPercentual, usarRegraCobrancaPadrao, regrasCobranca, observacoes, ativo } = req.body as Record<string, unknown>;
    if (!nome || !email || !documento) {
      return res.status(400).json({ message: 'Campos obrigatórios: nome, email, documento' });
    }
    const parceiro = await ParceiroModel.create({ nome, email, documento, telefone, emissorNFPadrao, comissaoPercentual, usarRegraCobrancaPadrao, regrasCobranca, observacoes, ativo });
    res.status(201).json(parceiro);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { nome, documento, email, telefone, emissorNFPadrao, comissaoPercentual, usarRegraCobrancaPadrao, regrasCobranca, observacoes, ativo } = req.body as Record<string, unknown>;
    const allowed: Record<string, unknown> = {};
    if (nome !== undefined) allowed.nome = nome;
    if (documento !== undefined) allowed.documento = documento;
    if (email !== undefined) allowed.email = email;
    if (telefone !== undefined) allowed.telefone = telefone;
    if (emissorNFPadrao !== undefined) allowed.emissorNFPadrao = emissorNFPadrao;
    if (comissaoPercentual !== undefined) allowed.comissaoPercentual = Number(comissaoPercentual);
    if (usarRegraCobrancaPadrao !== undefined) allowed.usarRegraCobrancaPadrao = Boolean(usarRegraCobrancaPadrao);
    if (regrasCobranca !== undefined) allowed.regrasCobranca = regrasCobranca;
    if (observacoes !== undefined) allowed.observacoes = observacoes;
    if (ativo !== undefined) allowed.ativo = ativo;
    const parceiro = await ParceiroModel.findByIdAndUpdate(req.params.id, allowed, { new: true, runValidators: true });
    if (!parceiro) return res.status(404).json({ message: 'Parceiro não encontrado' });
    res.json(parceiro);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/ativo', authenticate, authorize('admin', 'operador'), async (req, res, next) => {
  try {
    const { ativo } = req.body as { ativo: boolean };
    if (typeof ativo !== 'boolean') return res.status(400).json({ message: 'Campo ativo deve ser boolean' });
    const parceiro = await ParceiroModel.findByIdAndUpdate(req.params.id, { ativo }, { new: true });
    if (!parceiro) return res.status(404).json({ message: 'Parceiro não encontrado' });
    res.json(parceiro);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/relatorio', authenticate, authorize('admin', 'operador', 'financeiro', 'revenda'), async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    if (authReq.user?.role === 'revenda' && req.params.id !== authReq.user.parceiroId) {
      return res.status(403).json({ message: 'Sem permissão' });
    }

    const parceiro = await ParceiroModel.findById(req.params.id).select('nome saldoCreditos').lean();
    if (!parceiro) return res.status(404).json({ message: 'Parceiro não encontrado' });

    const pedidos = await PedidoModel.find({ parceiroId: req.params.id })
      .populate<{ clienteId: { _id: unknown; nome: string } }>('clienteId', 'nome')
      .lean();

    const totalPedidos = pedidos.length;
    const pedidosAtivos = pedidos.filter(p => p.status !== 'Cancelado' && p.status !== 'Concluido').length;
    const pedidosConcluidos = pedidos.filter(p => p.status === 'Concluido').length;
    const pedidosCancelados = pedidos.filter(p => p.status === 'Cancelado').length;
    const valorTotalPedidos = pedidos.filter(p => p.status !== 'Cancelado').reduce((s, p) => s + p.valorTotal, 0);
    const valorAFaturar = pedidos.filter(p => p.cobrancaRevenda?.situacao === 'A faturar').reduce((s, p) => s + (p.cobrancaRevenda?.valorCobrado ?? 0), 0);
    const nfsEmitidas = pedidos.filter(p => p.nfEmitida).length;

    // Certificados: agrupa itens de todos os pedidos ativos/concluídos por categoria
    const certMap: Record<string, { quantidade: number; valor: number }> = {};
    for (const p of pedidos) {
      if (p.status === 'Cancelado') continue;
      for (const item of p.itens ?? []) {
        // Classifica por nome do produto: ICP-Brasil, Internacional, Equipamento
        const nome = item.nome?.toLowerCase() ?? '';
        let cat = 'Outros';
        if (nome.includes('icp') || nome.includes('brasil') || nome.includes('a1') || nome.includes('a3')) cat = 'ICP-Brasil';
        else if (nome.includes('ssl') || nome.includes('internacional') || nome.includes('s/mime') || nome.includes('smime') || nome.includes('code signing')) cat = 'Internacional';
        else if (nome.includes('equipamento') || nome.includes('device') || nome.includes('nfe') || nome.includes('nfs') || nome.includes('ct-e') || nome.includes('cte')) cat = 'Equipamento';
        if (!certMap[cat]) certMap[cat] = { quantidade: 0, valor: 0 };
        certMap[cat].quantidade += item.quantidade ?? 1;
        certMap[cat].valor += item.subtotal ?? 0;
      }
      // fallback: se pedido não tem itens, usa produtoId.nome (campo nome no pedido pai)
      if ((p.itens ?? []).length === 0) {
        const nome = (p as unknown as { produtoId?: { nome?: string } }).produtoId?.nome?.toLowerCase() ?? '';
        let cat = 'Outros';
        if (nome.includes('icp') || nome.includes('brasil') || nome.includes('a1') || nome.includes('a3')) cat = 'ICP-Brasil';
        else if (nome.includes('ssl') || nome.includes('internacional') || nome.includes('s/mime') || nome.includes('smime')) cat = 'Internacional';
        else if (nome.includes('equipamento') || nome.includes('device')) cat = 'Equipamento';
        if (!certMap[cat]) certMap[cat] = { quantidade: 0, valor: 0 };
        certMap[cat].quantidade += 1;
        certMap[cat].valor += p.valorTotal;
      }
    }
    const certificados = Object.entries(certMap).map(([categoria, v]) => ({ categoria, ...v }));

    // Volume mensal: últimos 12 meses
    const agora = new Date();
    const meses: { mes: string; pedidos: number; valor: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
      const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      const ps = pedidos.filter(p => {
        const cd = new Date((p as unknown as { createdAt: string }).createdAt);
        return cd >= d && cd <= fim && p.status !== 'Cancelado';
      });
      meses.push({ mes: label, pedidos: ps.length, valor: ps.reduce((s, p) => s + p.valorTotal, 0) });
    }

    // Top 5 clientes por valor
    const clienteMap: Record<string, { nome: string; pedidos: number; valor: number }> = {};
    for (const p of pedidos) {
      if (p.status === 'Cancelado') continue;
      const cId = String((p.clienteId as unknown as { _id: unknown })?._id ?? p.clienteId);
      const cNome = (p.clienteId as unknown as { nome?: string })?.nome ?? 'Desconhecido';
      if (!clienteMap[cId]) clienteMap[cId] = { nome: cNome, pedidos: 0, valor: 0 };
      clienteMap[cId].pedidos++;
      clienteMap[cId].valor += p.valorTotal;
    }
    const topClientes = Object.values(clienteMap).sort((a, b) => b.valor - a.valor).slice(0, 5);

    // Situação de cobrança
    const cobrancaSituacao: Record<string, number> = {};
    for (const p of pedidos) {
      const sit = p.cobrancaRevenda?.situacao ?? 'Sem cobrança revenda';
      cobrancaSituacao[sit] = (cobrancaSituacao[sit] ?? 0) + 1;
    }

    res.json({
      saldoCreditos: parceiro.saldoCreditos ?? 0,
      totalPedidos,
      pedidosAtivos,
      pedidosConcluidos,
      pedidosCancelados,
      valorTotalPedidos,
      valorAFaturar,
      nfsEmitidas,
      certificados,
      volumeMensal: meses,
      topClientes,
      cobrancaSituacao,
    });
  } catch (error) { next(error); }
});

router.get('/:id/pedidos', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const pedidos = await PedidoModel.find({ parceiroId: req.params.id })
      .populate('clienteId', 'nome documento')
      .populate('produtoId', 'codigo nome')
      .sort({ createdAt: -1 });
    res.json(pedidos);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/usuarios', authenticate, authorize('admin', 'operador', 'financeiro'), async (req, res, next) => {
  try {
    const usuarios = await UserModel.find({ parceiroId: req.params.id, role: 'revenda' })
      .select('_id nome email ativo createdAt')
      .sort({ createdAt: -1 })
      .lean();
    res.json(usuarios);
  } catch (error) { next(error); }
});

router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const parceiro = await ParceiroModel.findByIdAndUpdate(req.params.id, { ativo: false }, { new: true });
    if (!parceiro) return res.status(404).json({ message: 'Parceiro não encontrado' });
    res.json({ message: 'Parceiro desativado', parceiro });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/usuarios', authenticate, authorize('admin', 'financeiro'), async (req, res, next) => {
  try {
    const { nome, email, password } = req.body as { nome?: string; email?: string; password?: string };
    if (!nome || !email || !password) {
      return res.status(400).json({ message: 'Campos obrigatórios: nome, email, password' });
    }
    const parceiro = await ParceiroModel.findById(req.params.id).lean();
    if (!parceiro) return res.status(404).json({ message: 'Parceiro não encontrado' });
    if (!parceiro.ativo) return res.status(422).json({ message: 'Parceiro inativo' });
    const emailNorm = email.toLowerCase();
    const existente = await UserModel.findOne({ email: emailNorm }).lean();
    if (existente) return res.status(409).json({ message: 'E-mail já cadastrado' });
    const passwordHash = await bcrypt.hash(password, 10);
    const usuario = await UserModel.create({
      nome,
      email: emailNorm,
      passwordHash,
      role: 'revenda',
      parceiroId: parceiro._id,
      ativo: true,
    });
    res.status(201).json({ message: 'Usuário criado', usuario: { _id: usuario._id, nome: usuario.nome, email: usuario.email, role: usuario.role } });
  } catch (error) {
    next(error);
  }
});

export { router as parceirosRouter };
