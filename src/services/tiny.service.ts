/**
 * Integração com Tiny ERP (usado pelo Olist).
 * API v2: https://www.tiny.com.br/ajuda/api
 *
 * Variáveis de ambiente:
 *   TINY_TOKEN   — token de API gerado em Configurações > Integrações > API no Tiny
 *   TINY_TIMEOUT — timeout em ms (padrão: 15000)
 */

import axios from 'axios';

const TINY_BASE = 'https://api.tiny.com.br/api2';

function token() {
  const t = process.env.TINY_TOKEN;
  if (!t) throw new Error('TINY_TOKEN não configurado. Configure a integração Tiny/Olist.');
  return t;
}

function timeout() {
  return Number(process.env.TINY_TIMEOUT ?? 15000);
}

async function post<T = unknown>(endpoint: string, params: Record<string, unknown>): Promise<T> {
  const form = new URLSearchParams();
  form.append('token', token());
  form.append('formato', 'JSON');
  for (const [k, v] of Object.entries(params)) {
    form.append(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  const res = await axios.post(`${TINY_BASE}/${endpoint}.php`, form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: timeout(),
  });
  const data = res.data as { retorno: { status: string; status_processamento?: string; erros?: unknown[]; registros?: unknown; [k: string]: unknown } };
  if (data.retorno?.status === 'Erro') {
    const erros = data.retorno?.erros;
    const msg = Array.isArray(erros) ? JSON.stringify(erros) : 'Erro Tiny API';
    throw new Error(msg);
  }
  return data.retorno as T;
}

// ─── Produtos ────────────────────────────────────────────────────────────────

export interface TinyProduto {
  id: string;
  codigo: string;
  nome: string;
  preco: string;
  estoque_atual: string;
  situacao: string;
}

export interface TinyProdutoInput {
  codigo: string;
  nome: string;
  preco: number;
  estoque: number;
  descricao?: string;
  unidade?: string;
}

/** Busca produto no Tiny por código */
export async function buscarProdutoTiny(codigo: string): Promise<TinyProduto | null> {
  const ret = await post<{ produtos?: Array<{ produto: TinyProduto }> }>('produtos.pesquisa', {
    pesquisa: codigo,
  });
  const lista = ret.produtos ?? [];
  const match = lista.find(p => p.produto.codigo === codigo);
  return match?.produto ?? null;
}

/** Cria ou atualiza produto no Tiny */
export async function sincronizarProdutoTiny(produto: TinyProdutoInput): Promise<{ id: string }> {
  const existing = await buscarProdutoTiny(produto.codigo).catch(() => null);

  const produtoXml = {
    produto: {
      codigo: produto.codigo,
      nome: produto.nome,
      preco: produto.preco.toFixed(2),
      estoque: produto.estoque.toString(),
      descricao: produto.descricao ?? '',
      unidade: produto.unidade ?? 'UN',
      situacao: 'A',
    },
  };

  if (existing?.id) {
    await post('produto.alterar', { id: existing.id, produto: JSON.stringify(produtoXml.produto) });
    return { id: existing.id };
  }

  const ret = await post<{ registro?: { id: string } }>('produto.incluir', {
    produto: JSON.stringify(produtoXml.produto),
  });
  return { id: ret.registro?.id ?? '' };
}

/** Importa lista de produtos do Tiny para o local (retorna array de TinyProduto) */
export async function listarProdutosTiny(pagina = 1): Promise<TinyProduto[]> {
  const ret = await post<{ produtos?: Array<{ produto: TinyProduto }> }>('produtos.pesquisa', {
    pagina: String(pagina),
  });
  return (ret.produtos ?? []).map(p => p.produto);
}

// ─── Pedidos ─────────────────────────────────────────────────────────────────

export interface TinyPedidoInput {
  numero: string;
  data: string;           // YYYY-MM-DD
  clienteNome: string;
  clienteDocumento: string;
  clienteEmail?: string;
  itens: Array<{ codigo: string; nome: string; quantidade: number; valor: number }>;
  valorFrete?: number;
  observacoes?: string;
}

/** Cria pedido de venda no Tiny */
export async function criarPedidoTiny(pedido: TinyPedidoInput): Promise<{ id: string; numero: string }> {
  const cpfCnpj = pedido.clienteDocumento.replace(/\D/g, '');
  const isJuridica = cpfCnpj.length === 14;

  const pedidoObj = {
    pedido: {
      numero_pedido_ecommerce: pedido.numero,
      data_pedido: pedido.data,
      cliente: {
        nome: pedido.clienteNome,
        ...(isJuridica ? { cnpj: cpfCnpj } : { cpf: cpfCnpj }),
        email: pedido.clienteEmail ?? '',
      },
      itens: pedido.itens.map(i => ({
        item: {
          codigo: i.codigo,
          descricao: i.nome,
          quantidade: i.quantidade.toString(),
          valor_unitario: i.valor.toFixed(2),
        },
      })),
      obs: pedido.observacoes ?? '',
      valor_frete: (pedido.valorFrete ?? 0).toFixed(2),
    },
  };

  const ret = await post<{ registro?: { id: string; numero: string } }>('pedido.incluir', {
    pedido: JSON.stringify(pedidoObj.pedido),
  });

  return { id: ret.registro?.id ?? '', numero: ret.registro?.numero ?? pedido.numero };
}

/** Atualiza situação de um pedido no Tiny */
export async function atualizarSituacaoPedidoTiny(
  tinyId: string,
  situacao: 'Em andamento' | 'Aprovado' | 'Preparando envio' | 'Faturado' | 'Pronto para envio' | 'Enviado' | 'Entregue' | 'Cancelado'
): Promise<void> {
  await post('pedido.alterar.situacao', { id: tinyId, situacao });
}

/** Busca pedido no Tiny pelo número */
export async function buscarPedidoTiny(numero: string): Promise<Record<string, unknown> | null> {
  const ret = await post<{ pedidos?: Array<{ pedido: Record<string, unknown> }> }>('pedidos.pesquisa', {
    numero: numero,
  });
  return ret.pedidos?.[0]?.pedido ?? null;
}

// ─── Clientes ─────────────────────────────────────────────────────────────────

export interface TinyClienteInput {
  nome: string;
  documento: string;
  email?: string;
  tipo: 'pessoa-fisica' | 'pessoa-juridica';
}

export async function sincronizarClienteTiny(cliente: TinyClienteInput): Promise<{ id: string }> {
  const cpfCnpj = cliente.documento.replace(/\D/g, '');
  const isJuridica = cpfCnpj.length === 14;

  const clienteObj = {
    cliente: {
      nome: cliente.nome,
      ...(isJuridica ? { cnpj: cpfCnpj, tipo_pessoa: 'J' } : { cpf: cpfCnpj, tipo_pessoa: 'F' }),
      email: cliente.email ?? '',
      situacao: 'A',
    },
  };

  const ret = await post<{ registro?: { id: string } }>('contato.incluir', {
    contato: JSON.stringify(clienteObj.cliente),
  });
  return { id: ret.registro?.id ?? '' };
}

// ─── Downloads de NF ─────────────────────────────────────────────────────────

/**
 * Obtém o link de acesso ao PDF/DANFE de uma NF-e pelo ID Tiny.
 * Endpoint: nota.fiscal.obter.link.php
 */
export async function obterLinkNFeTiny(tinyNfeId: string): Promise<string> {
  const ret = await post<{ link?: string; nota_fiscal?: { link_acesso?: string } }>(
    'nota.fiscal.obter.link',
    { id: tinyNfeId }
  );
  const link = ret.link ?? ret.nota_fiscal?.link_acesso ?? '';
  if (!link) throw new Error('Tiny não retornou link para esta NF-e');
  return link;
}

/**
 * Obtém o XML da NF-e pelo ID Tiny.
 * Endpoint: nota.fiscal.obter.xml.php
 */
export async function obterXmlNFeTiny(tinyNfeId: string): Promise<string> {
  const ret = await post<{ xml?: string; nota_fiscal?: { xml?: string } }>(
    'nota.fiscal.obter.xml',
    { id: tinyNfeId }
  );
  const xml = ret.xml ?? ret.nota_fiscal?.xml ?? '';
  if (!xml) throw new Error('Tiny não retornou XML para esta NF-e');
  return xml;
}

// ─── Nota Fiscal Eletrônica ───────────────────────────────────────────────────

export interface TinyNFeInput {
  tinyPedidoId: string;   // ID do pedido no Tiny (obtido na sincronização)
  enviarEmail?: boolean;  // Enviar DANFE por e-mail ao cliente (padrão: false)
}

export interface TinyNFeResult {
  tinyNfeId: string;
  chaveAcesso: string;
  linkAcesso: string;
  situacao: 'Autorizada' | 'Erro';
  erroMsg?: string;
}

/**
 * Gera NF-e no Tiny a partir de um pedido já sincronizado.
 * Usa o endpoint `pedido.gerar.nota.fiscal` (step único: cria + autoriza).
 * Quando autorizado, retorna chave SEFAZ de 44 dígitos e link DANFE.
 */
export async function gerarNotaFiscalTiny(input: TinyNFeInput): Promise<TinyNFeResult> {
  // Passo 1 — gera NF-e a partir do pedido Tiny
  const gerarRet = await post<{
    codigo_nfe?: string;
    nota_fiscal?: { id: string; numero: string };
    registro?: { id: string };
  }>('pedido.gerar.nota.fiscal', {
    id: input.tinyPedidoId,
    enviar_email: input.enviarEmail ? 'S' : 'N',
  });

  const nfeId =
    gerarRet.codigo_nfe ??
    gerarRet.nota_fiscal?.id ??
    gerarRet.registro?.id ?? '';

  if (!nfeId) {
    throw new Error('Tiny não retornou ID da NF-e gerada');
  }

  // Passo 2 — autoriza no SEFAZ via `nota.fiscal.emitir`
  const emitirRet = await post<{
    nota_fiscal?: {
      id?: string;
      chave_acesso?: string;
      link_acesso?: string;
      situacao?: number;
      descricao_situacao?: string;
    };
    erros?: Array<{ erro: string }>;
  }>('nota.fiscal.emitir', {
    id: nfeId,
    enviarEmail: input.enviarEmail ? 'S' : 'N',
    formato: 'JSON',
  });

  const nf = emitirRet.nota_fiscal;

  // situacao 4 = Autorizada no Tiny
  if (nf?.situacao === 4 || nf?.descricao_situacao === 'Autorizada') {
    return {
      tinyNfeId: String(nf.id ?? nfeId),
      chaveAcesso: nf.chave_acesso ?? '',
      linkAcesso: nf.link_acesso ?? '',
      situacao: 'Autorizada',
    };
  }

  // Qualquer outro caso é tratado como erro
  const erros = emitirRet.erros;
  const erroMsg = Array.isArray(erros)
    ? erros.map(e => e.erro).join('; ')
    : `Situação inesperada: ${nf?.descricao_situacao ?? 'desconhecida'}`;

  return {
    tinyNfeId: String(nf?.id ?? nfeId),
    chaveAcesso: '',
    linkAcesso: '',
    situacao: 'Erro',
    erroMsg,
  };
}

/** Mapeia etapa operacional do sistema para situação Tiny */
export function etapaParaSituacaoTiny(etapa: string): 'Em andamento' | 'Aprovado' | 'Preparando envio' | 'Faturado' | 'Pronto para envio' | 'Enviado' | 'Entregue' {
  const mapa: Record<string, 'Em andamento' | 'Aprovado' | 'Preparando envio' | 'Faturado' | 'Pronto para envio' | 'Enviado' | 'Entregue'> = {
    Pedido: 'Em andamento',
    Pagamento: 'Aprovado',
    Validacao: 'Aprovado',
    Preparacao: 'Preparando envio',
    Processamento: 'Faturado',
    Entrega: 'Enviado',
    Conclusao: 'Entregue',
  };
  return mapa[etapa] ?? 'Em andamento';
}

// Objeto mutável para permitir substituição nos testes (ESM namespace é read-only)
export const tinyAdapter = {
  sincronizarProdutoTiny,
  criarPedidoTiny,
  atualizarSituacaoPedidoTiny,
  listarProdutosTiny,
  sincronizarClienteTiny,
  etapaParaSituacaoTiny,
  buscarProdutoTiny,
  buscarPedidoTiny,
  gerarNotaFiscalTiny,
  obterLinkNFeTiny,
  obterXmlNFeTiny,
};
