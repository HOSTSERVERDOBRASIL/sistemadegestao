import { ContratoModel, ModalidadeContrato } from '../models/contrato.model.js';
import { NotaFiscalModel } from '../models/nota-fiscal.model.js';
import { OrdemFornecimentoModel } from '../models/ordem-fornecimento.model.js';
import { PedidoModel } from '../models/pedido.model.js';
import { ParceiroModel } from '../models/parceiro.model.js';
import { nextSeq } from '../models/counter.model.js';
import { TinySyncModel } from '../models/tiny-sync.model.js';
import { tinyAdapter } from './tiny.service.js';

async function gerarNumeroNF(): Promise<string> {
  const seq = await nextSeq('nota_fiscal');
  return `NF-${String(seq).padStart(6, '0')}`;
}

/**
 * Tenta emitir NF-e no Tiny (SEFAZ) para um pedido já sincronizado.
 * Falhas são silenciosas: o registro interno continua existindo com
 * status 'Pendente' e erroEmissao preenchido para retentativa manual.
 */
async function tentarEmissaoTiny(pedidoId: string, nfId: string): Promise<void> {
  // Só tenta se TINY_TOKEN estiver configurado
  if (!process.env.TINY_TOKEN) return;

  // Busca o tinyId do pedido já sincronizado
  const sync = await TinySyncModel.findOne({ tipo: 'pedido', localId: pedidoId, status: 'sincronizado' });
  if (!sync?.tinyId) return; // pedido não sincronizado com Tiny — emissão manual depois

  try {
    const resultado = await tinyAdapter.gerarNotaFiscalTiny({ tinyPedidoId: sync.tinyId });

    if (resultado.situacao === 'Autorizada') {
      await NotaFiscalModel.findByIdAndUpdate(nfId, {
        tinyNfeId: resultado.tinyNfeId,
        chaveAcesso: resultado.chaveAcesso,
        linkAcesso: resultado.linkAcesso,
        situacaoTiny: 'Autorizada',
        status: 'Emitida',
      });
    } else {
      await NotaFiscalModel.findByIdAndUpdate(nfId, {
        tinyNfeId: resultado.tinyNfeId || undefined,
        situacaoTiny: 'Erro',
        erroEmissao: resultado.erroMsg,
        status: 'Pendente',
      });
    }
  } catch (err) {
    await NotaFiscalModel.findByIdAndUpdate(nfId, {
      situacaoTiny: 'Erro',
      erroEmissao: err instanceof Error ? err.message : String(err),
      status: 'Pendente',
    });
  }
}

export class SaldoInsuficienteError extends Error {
  constructor(message = 'Saldo insuficiente') {
    super(message);
    this.name = 'SaldoInsuficienteError';
  }
}

export class ContratoJaFaturadoError extends Error {
  constructor(message = 'Contrato já faturado') {
    super(message);
    this.name = 'ContratoJaFaturadoError';
  }
}

export class DocumentoObrigatorioError extends Error {
  constructor(message = 'Documento obrigatório') {
    super(message);
    this.name = 'DocumentoObrigatorioError';
  }
}

export async function emitirNotaFiscal(pedidoId: string) {
  const pedido = await PedidoModel.findById(pedidoId);
  if (!pedido) {
    throw new Error('Pedido não encontrado');
  }

  const tipo = pedido.vinculo.tipo;
  if (tipo === 'Contrato' && pedido.contratoId) {
    const contrato = await ContratoModel.findById(pedido.contratoId);
    if (!contrato) {
      throw new Error('Contrato não encontrado');
    }

    const modalidade = contrato.modalidade as ModalidadeContrato;
    if (modalidade === 'Total') {
      if (contrato.valorFaturado > 0) {
        throw new ContratoJaFaturadoError();
      }
      contrato.valorFaturado = contrato.valorTotal;
      await contrato.save();
      pedido.status = 'Faturado';
      pedido.nfEmitida = true;
      await pedido.save();
      const nf1 = await NotaFiscalModel.create({
        numero: await gerarNumeroNF(),
        pedidoId: pedido._id,
        valor: pedido.valorTotal,
        emissor: pedido.vinculo.emissorNF || 'XDigital',
        status: 'Emitida',
        observacoes: 'Faturamento total do contrato'
      });
      await tentarEmissaoTiny(String(pedido._id), String(nf1._id));
      return NotaFiscalModel.findById(nf1._id);
    }

    if (modalidade === 'Parcial') {
      const saldo = contrato.valorTotal - contrato.valorFaturado;
      if (saldo < pedido.valorTotal) {
        throw new SaldoInsuficienteError();
      }
      contrato.valorFaturado += pedido.valorTotal;
      await contrato.save();
      pedido.status = 'Faturado';
      pedido.nfEmitida = true;
      await pedido.save();
      const nf2 = await NotaFiscalModel.create({
        numero: await gerarNumeroNF(),
        pedidoId: pedido._id,
        valor: pedido.valorTotal,
        emissor: pedido.vinculo.emissorNF || 'XDigital',
        status: 'Emitida',
        observacoes: 'Faturamento parcial do contrato'
      });
      await tentarEmissaoTiny(String(pedido._id), String(nf2._id));
      return NotaFiscalModel.findById(nf2._id);
    }

    if (modalidade === 'Por Ordem de Fornecimento') {
      if (!pedido.contratoId) {
        throw new Error('Contrato não informado para OF');
      }
      const ordem = await OrdemFornecimentoModel.findOne({ contratoId: pedido.contratoId });
      if (!ordem) {
        throw new Error('Ordem de fornecimento não encontrada');
      }
      if (ordem.valorFaturado + pedido.valorTotal > ordem.valor) {
        throw new SaldoInsuficienteError();
      }
      ordem.valorFaturado += pedido.valorTotal;
      if (ordem.valorFaturado >= ordem.valor) {
        ordem.status = 'Fechada';
      } else {
        ordem.status = 'Parcial';
      }
      await ordem.save();
      pedido.status = 'Faturado';
      pedido.nfEmitida = true;
      await pedido.save();
      const nf3 = await NotaFiscalModel.create({
        numero: await gerarNumeroNF(),
        pedidoId: pedido._id,
        valor: pedido.valorTotal,
        emissor: pedido.vinculo.emissorNF || 'XDigital',
        status: 'Emitida',
        observacoes: 'Faturamento vinculado à ordem de fornecimento'
      });
      await tentarEmissaoTiny(String(pedido._id), String(nf3._id));
      return NotaFiscalModel.findById(nf3._id);
    }
  }

  if (tipo === 'EmpenhoSF') {
    if (!pedido.vinculo.empenho || !pedido.vinculo.sf) {
      throw new DocumentoObrigatorioError('Empenho e solicitação de fornecimento são obrigatórios');
    }
    pedido.status = 'Faturado';
    pedido.nfEmitida = true;
    await pedido.save();
    const nf4 = await NotaFiscalModel.create({
      numero: await gerarNumeroNF(),
      pedidoId: pedido._id,
      valor: pedido.valorTotal,
      emissor: 'XDigital',
      status: 'Emitida',
      observacoes: `NF emitida referenciando empenho ${pedido.vinculo.empenho} e SF ${pedido.vinculo.sf}`
    });
    await tentarEmissaoTiny(String(pedido._id), String(nf4._id));
    return NotaFiscalModel.findById(nf4._id);
  }

  if (tipo === 'CompraDireta') {
    if (!pedido.vinculo.comprovantePagamentoAprovado) {
      throw new DocumentoObrigatorioError('Comprovante de pagamento não aprovado');
    }
    pedido.status = 'Faturado';
    pedido.nfEmitida = true;
    await pedido.save();
    const nf5 = await NotaFiscalModel.create({
      numero: await gerarNumeroNF(),
      pedidoId: pedido._id,
      valor: pedido.valorTotal,
      emissor: 'XDigital',
      status: 'Emitida',
      observacoes: 'NF emitida com base no comprovante de pagamento aprovado'
    });
    await tentarEmissaoTiny(String(pedido._id), String(nf5._id));
    return NotaFiscalModel.findById(nf5._id);
  }

  if (tipo === 'Revenda') {
    const parceiro = pedido.parceiroId ? await ParceiroModel.findById(pedido.parceiroId) : null;
    const emissor = pedido.vinculo.emissorNF || parceiro?.emissorNFPadrao || 'XDigital';
    pedido.status = 'Faturado';
    pedido.nfEmitida = true;
    await pedido.save();
    const nf6 = await NotaFiscalModel.create({
      numero: await gerarNumeroNF(),
      pedidoId: pedido._id,
      valor: pedido.valorTotal,
      emissor,
      status: 'Emitida',
      observacoes: `NF emitida por revenda com preço de tabela ${pedido.valorTabela} e preço de revenda ${pedido.valorRevenda ?? pedido.valorTotal}`
    });
    await tentarEmissaoTiny(String(pedido._id), String(nf6._id));
    return NotaFiscalModel.findById(nf6._id);
  }

  throw new Error('Tipo de vínculo não suportado');
}
