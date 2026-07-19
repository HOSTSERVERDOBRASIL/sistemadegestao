import { Types } from 'mongoose';
import { ClienteModel } from '../models/cliente.model.js';
import { ContratoModel } from '../models/contrato.model.js';
import { OrdemFornecimentoModel } from '../models/ordem-fornecimento.model.js';
import { PedidoModel } from '../models/pedido.model.js';
import { ProdutoModel } from '../models/produto.model.js';
import { nextSeq } from '../models/counter.model.js';
import { ContratoFluxoError, contratoEstaVigente, validarVinculoContrato, valorTotalComDireito } from './contrato.service.js';
import { montarItensPedido } from './pedido.service.js';
import { registrarAuditoria } from './auditoria.service.js';
import { estornarSaldoNotaEmpenho, reservarSaldoNotaEmpenho } from './nota-empenho.service.js';
import { CadastroPublicoError, consultarCNPJ, serproConfigurado } from './cadastro-publico.service.js';
import { emitirNotaFiscal } from './faturamento.service.js';

type ModuloLoja = { moduleId: string; name: string; price: number; quantity: number };
type VinculoLoja = {
  tipo: 'contrato';
  contratoId: string;
  ordemFornecimentoId?: string;
  numeroEmpenhoNoContrato?: string;
  notaEmpenhoId?: string;
};

function documentoNormalizado(valor: string): string {
  return valor.replace(/\D/g, '');
}

function regexDocumento(digitos: string): RegExp {
  return new RegExp(`^${digitos.split('').join('[^0-9]*')}$`);
}

export async function encontrarOuCriarClienteLoja(input: {
  name: string;
  email: string;
  document: string;
  phone?: string;
}) {
  const document = documentoNormalizado(input.document);
  if (![11, 14].includes(document.length)) {
    throw new ContratoFluxoError('Documento deve ser um CPF ou CNPJ válido', 400);
  }

  const existente = await ClienteModel.findOne({ documento: regexDocumento(document) });
  if (existente) return { cliente: existente, isNovo: false };

  const email = input.email.trim().toLowerCase();
  const emailEmUso = await ClienteModel.findOne({ email });
  if (emailEmUso) {
    throw new ContratoFluxoError('E-mail já pertence a outro documento', 409);
  }

  let cadastroOficial: Awaited<ReturnType<typeof consultarCNPJ>> | undefined;
  if (document.length === 14 && serproConfigurado()) {
    cadastroOficial = await consultarCNPJ(document);
    if (!cadastroOficial.ativo) {
      throw new CadastroPublicoError(`CNPJ com situação cadastral ${cadastroOficial.situacaoDescricao}`, 422);
    }
  }

  const cliente = await ClienteModel.create({
    nome: cadastroOficial?.nome || input.name.trim(),
    email,
    documento: document,
    telefone: input.phone?.trim(),
    tipo: document.length === 14 ? 'pessoa-juridica' : 'pessoa-fisica',
    esferaPublica: cadastroOficial?.esferaPublica ?? false,
    esferaPublicaRevisao: cadastroOficial?.revisaoManual ?? false,
    situacaoCadastral: cadastroOficial?.situacaoDescricao,
    naturezaJuridicaCodigo: cadastroOficial?.naturezaJuridicaCodigo,
    naturezaJuridicaDescricao: cadastroOficial?.naturezaJuridicaDescricao,
    validadoSerproEm: cadastroOficial ? new Date() : undefined,
  });
  await registrarAuditoria({
    entidade: 'Cliente', entidadeId: cliente._id, acao: 'cliente_criado_pela_loja', origem: 'Loja',
    detalhes: { tipo: cliente.tipo },
  });
  return { cliente, isNovo: true };
}

async function resolverProdutos(modules: ModuloLoja[]) {
  if (!Array.isArray(modules) || modules.length === 0) {
    throw new ContratoFluxoError('customerId e modules[] são obrigatórios', 400);
  }
  if (modules.some(modulo => typeof modulo === 'string')) {
    throw new ContratoFluxoError('modules[] precisa usar { moduleId, name, price, quantity }[]', 422);
  }

  return Promise.all(modules.map(async modulo => {
    if (!modulo.moduleId || !modulo.name || !Number.isFinite(modulo.price) ||
        !Number.isInteger(modulo.quantity) || modulo.quantity < 1 || modulo.price < 0) {
      throw new ContratoFluxoError('Cada módulo precisa de moduleId, name, price e quantity válidos', 422);
    }
    const produto = Types.ObjectId.isValid(modulo.moduleId)
      ? await ProdutoModel.findById(modulo.moduleId)
      : await ProdutoModel.findOne({ codigo: modulo.moduleId });
    if (!produto || !produto.ativo) {
      throw new ContratoFluxoError(`Produto da loja não encontrado ou inativo: ${modulo.moduleId}`, 422);
    }
    return {
      produtoId: String(produto._id),
      quantidade: modulo.quantity,
      precoUnitario: modulo.price,
      valorTabelaUnitario: produto.precoTabela ?? produto.preco,
    };
  }));
}

export async function atribuirAssinaturaLoja(input: {
  customerId: string;
  modules: ModuloLoja[];
  metadata?: { orderNumber?: string; orderId?: string };
  vinculo?: VinculoLoja;
  emitirNotaFiscal?: boolean;
}) {
  const cliente = await ClienteModel.findById(input.customerId);
  if (!cliente || !cliente.ativo) throw new ContratoFluxoError('Cliente não encontrado ou inativo', 404);

  const referenciaExterna = input.metadata?.orderNumber || input.metadata?.orderId;
  const numero = referenciaExterna
    ? `LOJA-${referenciaExterna}`.slice(0, 100)
    : `LOJA-${String(await nextSeq('pedido_loja')).padStart(8, '0')}`;
  const existente = await PedidoModel.findOne({ numero });
  if (existente) {
    return {
      pedidoId: String(existente._id), numeroPedido: existente.numero, idempotente: true,
      modules: existente.itens.map(item => ({ moduleId: String(item.produtoId), status: 'provisioning' as const })),
    };
  }

  const itensEntrada = await resolverProdutos(input.modules);
  const calculado = await montarItensPedido(itensEntrada);
  const isContrato = input.vinculo?.tipo === 'contrato';
  if (cliente.esferaPublica && !input.vinculo?.numeroEmpenhoNoContrato && !input.vinculo?.notaEmpenhoId) {
    throw new ContratoFluxoError('Cliente de esfera pública requer empenho (Lei 4.320/64, art. 60)', 422);
  }
  if (isContrato) {
    await validarVinculoContrato({
      contratoId: input.vinculo!.contratoId,
      clienteId: input.customerId,
      valor: calculado.valorTotal,
      ordemFornecimentoId: input.vinculo!.ordemFornecimentoId,
    });
  }

  let notaReservada = false;
  if (input.vinculo?.notaEmpenhoId) {
    await reservarSaldoNotaEmpenho({
      notaEmpenhoId: input.vinculo.notaEmpenhoId,
      clienteId: input.customerId,
      valor: calculado.valorTotal,
    });
    notaReservada = true;
  }
  let pedido;
  try {
    pedido = await PedidoModel.create({
    numero,
    clienteId: cliente._id,
    produtoId: calculado.produtoId,
    contratoId: isContrato ? input.vinculo!.contratoId : undefined,
    ordemFornecimentoId: isContrato ? input.vinculo!.ordemFornecimentoId : undefined,
    notaEmpenhoId: input.vinculo?.notaEmpenhoId,
    numeroEmpenhoNoContrato: input.vinculo?.numeroEmpenhoNoContrato,
    valorTotal: calculado.valorTotal,
    valorTabela: calculado.valorTabela,
    itens: calculado.itens,
    vinculo: isContrato
      ? { tipo: 'Contrato', empenho: input.vinculo!.numeroEmpenhoNoContrato }
      : { tipo: 'CompraDireta', comprovantePagamentoAprovado: true },
    historicoEtapas: [{ etapa: 'Pedido', data: new Date(), observacao: 'Pedido originado pela loja' }],
    observacoes: referenciaExterna ? `Referência externa: ${referenciaExterna}` : 'Pedido originado pela loja',
    });
  } catch (error) {
    if (notaReservada) await estornarSaldoNotaEmpenho(input.vinculo?.notaEmpenhoId, calculado.valorTotal);
    throw error;
  }
  await registrarAuditoria({
    entidade: 'Pedido', entidadeId: pedido._id, acao: 'pedido_criado_pela_loja', origem: 'Loja',
    detalhes: { numero: pedido.numero, itens: pedido.itens.length, vinculoContrato: isContrato },
  });

  let notaFiscalId: string | undefined;
  if (!isContrato && input.emitirNotaFiscal !== false) {
    const notaFiscal = await emitirNotaFiscal(String(pedido._id));
    notaFiscalId = String((notaFiscal as { _id: unknown })._id);
  }

  return {
    pedidoId: String(pedido._id), numeroPedido: pedido.numero, idempotente: false,
    notaFiscalId,
    modules: calculado.itens.map(item => ({ moduleId: String(item.produtoId), status: 'provisioning' as const })),
  };
}

export async function consultarContratosLoja(documento: string) {
  const digitos = documentoNormalizado(documento);
  if (digitos.length !== 14) throw new ContratoFluxoError('CNPJ inválido', 400);
  const cliente = await ClienteModel.findOne({ documento: regexDocumento(digitos) });
  if (!cliente) return { temContratoAtivo: false, contratos: [] };

  const contratos = await ContratoModel.find({ clienteId: cliente._id, ativo: true }).lean();
  const disponiveis = await Promise.all(contratos.filter(contratoEstaVigente).map(async contrato => {
    const reservadoAgg = await PedidoModel.aggregate<{ total: number }>([
      { $match: { contratoId: contrato._id, nfEmitida: { $ne: true }, saldoStatus: { $ne: 'Estornado' } } },
      { $group: { _id: null, total: { $sum: '$valorTotal' } } },
    ]);
    const reservado = reservadoAgg[0]?.total ?? 0;
    const saldoDisponivel = Math.max(0, valorTotalComDireito(contrato) - contrato.valorFaturado - reservado);
    const ordens = contrato.modalidade === 'Por Ordem de Fornecimento'
      ? await OrdemFornecimentoModel.find({ contratoId: contrato._id, status: { $ne: 'Fechada' } }).lean()
      : [];
    return {
      contratoId: String(contrato._id), numero: contrato.numero, modalidade: contrato.modalidade,
      vigenciaAte: contrato.dataFim, saldoDisponivel,
      ordens: ordens.map(ordem => ({
        ordemFornecimentoId: String(ordem._id), numero: ordem.numero,
        saldoDisponivel: Math.max(0, ordem.valor - ordem.valorFaturado), dataFim: ordem.dataFim,
      })).filter(ordem => ordem.saldoDisponivel > 0),
    };
  }));
  const comSaldo = disponiveis.filter(contrato => contrato.saldoDisponivel > 0 &&
    (contrato.modalidade !== 'Por Ordem de Fornecimento' || contrato.ordens.length > 0));
  return { temContratoAtivo: comSaldo.length > 0, empresaNome: cliente.nome, contratos: comSaldo };
}
