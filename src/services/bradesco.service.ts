/**
 * Integração com API do Bradesco.
 * Documentação: https://developers.bradesco.com.br
 *
 * Variáveis de ambiente:
 *   BRADESCO_CLIENT_ID     — client_id
 *   BRADESCO_CLIENT_SECRET — client_secret
 *   BRADESCO_CNPJ          — CNPJ da empresa (somente dígitos)
 *   BRADESCO_AGENCIA        — agência (sem dígito verificador)
 *   BRADESCO_CONTA          — conta corrente (sem dígito)
 *   BRADESCO_SANDBOX        — "true" para sandbox
 *   BRADESCO_TIMEOUT        — timeout em ms (padrão: 20000)
 */

import axios from 'axios';

function cfg() {
  const clientId     = process.env.BRADESCO_CLIENT_ID;
  const clientSecret = process.env.BRADESCO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('BRADESCO_CLIENT_ID e BRADESCO_CLIENT_SECRET são obrigatórios.');
  const sandbox = process.env.BRADESCO_SANDBOX !== 'false';
  const authBase = sandbox
    ? 'https://proxy.api.prebanco.com.br/auth/server/v1.2.0'
    : 'https://api.bradesco.com.br/bradesco/payment-accounts/v1/auth/server/v1.2.0';
  const apiBase = sandbox
    ? 'https://proxy.api.prebanco.com.br/open-banking/v1'
    : 'https://api.bradesco.com.br/bradesco/payment-accounts/v1/open-banking/v1';
  return {
    clientId, clientSecret,
    cnpj:    (process.env.BRADESCO_CNPJ ?? '').replace(/\D/g, ''),
    agencia: process.env.BRADESCO_AGENCIA ?? '',
    conta:   process.env.BRADESCO_CONTA   ?? '',
    authBase, apiBase,
    timeout: Number(process.env.BRADESCO_TIMEOUT ?? 20000),
    sandbox,
  };
}

interface BradescoToken { access_token: string; expires_in: number }
let _token: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (_token && _token.expiresAt > now + 10_000) return _token.value;

  const { clientId, clientSecret, authBase, timeout } = cfg();
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await axios.post<BradescoToken>(
    `${authBase}/token`,
    'grant_type=client_credentials&scope=accounts',
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

export interface BradescoLancamento {
  tipo: 'credito' | 'debito';
  valor: number;
  data: Date;
  descricao: string;
  documento?: string;
  txid?: string;
}

/**
 * Consulta extrato de conta corrente Bradesco.
 * dataInicio / dataFim: YYYY-MM-DD
 */
export async function consultarExtratoBradesco(dataInicio: string, dataFim: string): Promise<BradescoLancamento[]> {
  const { apiBase, agencia, conta, cnpj, timeout } = cfg();
  const token = await getToken();

  const res = await axios.get<{ data?: { transactions?: Array<Record<string, unknown>> } }>(
    `${apiBase}/accounts/transactions`,
    {
      params: {
        branchCode: agencia,
        accountNumber: conta,
        cnpj,
        fromBookingDate: dataInicio,
        toBookingDate:   dataFim,
      },
      headers: {
        Authorization: `Bearer ${token}`,
        'x-fapi-interaction-id': crypto.randomUUID(),
      },
      timeout,
    }
  );

  const txs = res.data?.data?.transactions ?? [];
  return txs.map(t => ({
    tipo:      String(t['creditDebitType'] ?? '') === 'CREDIT' ? 'credito' : 'debito',
    valor:     Math.abs(Number((t['amount'] as Record<string,unknown>)?.['amount'] ?? t['transactionAmount'] ?? 0)),
    data:      new Date(String(t['bookingDate'] ?? t['transactionDate'] ?? new Date())),
    descricao: String(t['transactionName'] ?? t['additionalInfo'] ?? 'Transação Bradesco'),
    documento: t['cpfCnpjNumberInitiator'] ? String(t['cpfCnpjNumberInitiator']) : undefined,
    txid:      t['transactionId'] ? String(t['transactionId']) : undefined,
  }));
}

export function bradescoConfigurado(): boolean {
  return !!(process.env.BRADESCO_CLIENT_ID && process.env.BRADESCO_CLIENT_SECRET);
}

export const bradescoAdapter = { consultarExtratoBradesco, bradescoConfigurado };
