/**
 * Integração com Olist — cotação de fretes.
 *
 * Endpoint: POST https://erp.olist.com/webhook/api/v1/parceiro/{OLIST_ID}/cotar
 * Documentação: https://erp.olist.com (área do parceiro)
 *
 * Variáveis de ambiente:
 *   OLIST_PARTNER_ID    — identificador do parceiro (ex: 9700)
 *   OLIST_TOKEN         — token de autenticação Bearer
 *   OLIST_TIMEOUT       — timeout em ms (padrão: 15000)
 */

import axios from 'axios';

const OLIST_BASE = 'https://erp.olist.com/webhook/api/v1/parceiro';

function cfg() {
  const id    = process.env.OLIST_PARTNER_ID;
  const token = process.env.OLIST_TOKEN;
  if (!id || !token) throw new Error('OLIST_PARTNER_ID e OLIST_TOKEN são obrigatórios para cotação de fretes.');
  return { id, token, timeout: Number(process.env.OLIST_TIMEOUT ?? 15000) };
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface OlistVolume {
  peso: number;       // kg
  altura: number;     // cm
  largura: number;    // cm
  comprimento: number; // cm
  quantidade?: number; // padrão 1
}

export interface OlistCotacaoInput {
  cepOrigem: string;
  cepDestino: string;
  valorDeclarado: number;  // R$
  volumes: OlistVolume[];
  servicos?: string[];     // filtrar por serviço (ex: ['SEDEX', 'PAC'])
}

export interface OlistOpcaoFrete {
  servico: string;
  transportadora: string;
  prazoEntrega: number;  // dias úteis
  valorFrete: number;    // R$
  valorTotal: number;    // frete + seguro
  mensagem?: string;
}

export interface OlistCotacaoResult {
  opcoes: OlistOpcaoFrete[];
  raw: unknown;
}

// ─── Cotação de fretes ───────────────────────────────────────────────────────

export async function cotarFrete(input: OlistCotacaoInput): Promise<OlistCotacaoResult> {
  const { id, token, timeout } = cfg();

  // Normaliza CEPs — remove traços/espaços
  const cepOrigem  = input.cepOrigem.replace(/\D/g, '');
  const cepDestino = input.cepDestino.replace(/\D/g, '');

  const body = {
    cep_origem:       cepOrigem,
    cep_destino:      cepDestino,
    valor_declarado:  input.valorDeclarado,
    volumes: input.volumes.map(v => ({
      peso:        v.peso,
      altura:      v.altura,
      largura:     v.largura,
      comprimento: v.comprimento,
      quantidade:  v.quantidade ?? 1,
    })),
    ...(input.servicos?.length ? { servicos: input.servicos } : {}),
  };

  const res = await axios.post(
    `${OLIST_BASE}/${id}/cotar`,
    body,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout,
    }
  );

  const data = res.data as Record<string, unknown>;

  // Normaliza a resposta independente do formato exato da API
  const opcoes: OlistOpcaoFrete[] = normalizeOpcoes(data);

  return { opcoes, raw: data };
}

function normalizeOpcoes(data: Record<string, unknown>): OlistOpcaoFrete[] {
  // Tenta array direto ou campo `cotacoes` / `fretes` / `opcoes`
  const lista = (
    Array.isArray(data) ? data
    : Array.isArray(data['cotacoes']) ? data['cotacoes']
    : Array.isArray(data['fretes'])   ? data['fretes']
    : Array.isArray(data['opcoes'])   ? data['opcoes']
    : []
  ) as Record<string, unknown>[];

  return lista.map(item => ({
    servico:        String(item['servico'] ?? item['service'] ?? item['nome'] ?? ''),
    transportadora: String(item['transportadora'] ?? item['carrier'] ?? ''),
    prazoEntrega:   Number(item['prazo'] ?? item['prazo_entrega'] ?? item['delivery_time'] ?? 0),
    valorFrete:     Number(item['valor_frete'] ?? item['valor'] ?? item['price'] ?? 0),
    valorTotal:     Number(item['valor_total'] ?? item['total'] ?? item['valor_frete'] ?? item['valor'] ?? 0),
    mensagem:       item['mensagem'] ? String(item['mensagem']) : undefined,
  }));
}

// Objeto mutável para substituição nos testes
export const olistAdapter = {
  cotarFrete,
};
