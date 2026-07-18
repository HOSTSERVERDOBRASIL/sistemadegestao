/**
 * Integração com API do Banco do Brasil.
 * Documentação: https://developers.bb.com.br
 *
 * Variáveis de ambiente:
 *   BB_CLIENT_ID      — client_id da aplicação BB Developers
 *   BB_CLIENT_SECRET  — client_secret da aplicação
 *   BB_CONVENIO       — número do convênio (conta corrente PJ)
 *   BB_AGENCIA        — número da agência (sem dígito)
 *   BB_CONTA          — número da conta (sem dígito)
 *   BB_SANDBOX        — "true" para sandbox (padrão: true em dev)
 *   BB_TIMEOUT        — timeout em ms (padrão: 20000)
 */

import axios from 'axios';

function cfg() {
  const clientId     = process.env.BB_CLIENT_ID;
  const clientSecret = process.env.BB_CLIENT_SECRET;
  const convenio     = process.env.BB_CONVENIO;
  if (!clientId || !clientSecret) throw new Error('BB_CLIENT_ID e BB_CLIENT_SECRET são obrigatórios.');
  const sandbox = process.env.BB_SANDBOX !== 'false';
  const base    = sandbox
    ? 'https://oauth.sandbox.bb.com.br'
    : 'https://oauth.bb.com.br';
  const apiBase = sandbox
    ? 'https://api.sandbox.bb.com.br'
    : 'https://api.bb.com.br';
  return {
    clientId, clientSecret, convenio,
    agencia: process.env.BB_AGENCIA ?? '',
    conta:   process.env.BB_CONTA   ?? '',
    base, apiBase,
    timeout: Number(process.env.BB_TIMEOUT ?? 20000),
    sandbox,
  };
}

interface BbToken { access_token: string; expires_in: number }
let _token: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (_token && _token.expiresAt > now + 10_000) return _token.value;

  const { clientId, clientSecret, base, timeout } = cfg();
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await axios.post<BbToken>(
    `${base}/oauth/token`,
    'grant_type=client_credentials&scope=extrato.read+boletos-requisicao',
    {
      headers: {
        Authorization: `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout,
    }
  );
  _token = { value: res.data.access_token, expiresAt: now + res.data.expires_in * 1000 };
  return _token.value;
}

export interface BbLancamento {
  tipo: 'credito' | 'debito';
  valor: number;
  data: Date;
  descricao: string;
  documento?: string;
  txid?: string;
}

/**
 * Consulta extrato de conta corrente BB.
 * dataInicio / dataFim: YYYY-MM-DD
 */
export async function consultarExtratoBB(dataInicio: string, dataFim: string): Promise<BbLancamento[]> {
  const { apiBase, agencia, conta, timeout } = cfg();
  const token = await getToken();

  const res = await axios.get<{ transacoes?: Array<Record<string, unknown>> }>(
    `${apiBase}/conta-corrente/v2/extrato/periodo`,
    {
      params: {
        agencia, conta,
        dataInicio: dataInicio.replace(/-/g, ''),
        dataFim:    dataFim.replace(/-/g, ''),
      },
      headers: { Authorization: `Bearer ${token}` },
      timeout,
    }
  );

  return (res.data.transacoes ?? []).map(t => ({
    tipo:      Number(t['tipoTransacao']) > 0 ? 'credito' : 'debito',
    valor:     Math.abs(Number(t['valorTransacao'] ?? 0)),
    data:      parseDate(String(t['dataTransacao'] ?? '')),
    descricao: String(t['descricaoHistorico'] ?? t['textoDescricaoHistorico'] ?? 'Transação BB'),
    documento: t['documentoCliente'] ? String(t['documentoCliente']) : undefined,
    txid:      t['identificadorTransacao'] ? String(t['identificadorTransacao']) : undefined,
  }));
}

function parseDate(s: string): Date {
  if (s.length === 8) return new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T12:00:00Z`);
  return new Date(s);
}

export function bbConfigurado(): boolean {
  return !!(process.env.BB_CLIENT_ID && process.env.BB_CLIENT_SECRET);
}

export const bbAdapter = { consultarExtratoBB, bbConfigurado };
