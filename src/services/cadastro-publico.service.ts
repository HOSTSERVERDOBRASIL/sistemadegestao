import axios from 'axios';
import { env } from '../config/env.js';

export class CadastroPublicoError extends Error {
  constructor(message: string, public statusCode = 502) {
    super(message);
    this.name = 'CadastroPublicoError';
  }
}

let tokenCache = '';
let tokenExpiresAt = 0;

export function somenteDigitos(value: string): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function validarCPF(value: string): boolean {
  const cpf = somenteDigitos(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digito = (base: string, peso: number) => {
    const soma = [...base].reduce((total, numero, index) => total + Number(numero) * (peso - index), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(cpf.slice(0, 9), 10) === Number(cpf[9]) &&
    digito(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

export function validarCNPJ(value: string): boolean {
  const cnpj = somenteDigitos(value);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calcular = (base: string, pesos: number[]) => {
    const soma = [...base].reduce((total, numero, index) => total + Number(numero) * pesos[index], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const primeiro = calcular(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = calcular(cnpj.slice(0, 12) + primeiro, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return primeiro === Number(cnpj[12]) && segundo === Number(cnpj[13]);
}

async function getSerproToken(): Promise<string> {
  if (!env.SERPRO_BASIC_TOKEN) throw new CadastroPublicoError('Integração Serpro não configurada', 503);
  if (tokenCache && Date.now() < tokenExpiresAt) return tokenCache;
  try {
    const response = await axios.post<{ access_token: string; expires_in?: number }>(
      'https://gateway.apiserpro.serpro.gov.br/token',
      'grant_type=client_credentials',
      {
        headers: {
          Authorization: `Basic ${env.SERPRO_BASIC_TOKEN}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: env.SERPRO_TIMEOUT,
      },
    );
    tokenCache = response.data.access_token;
    tokenExpiresAt = Date.now() + Math.max(30, (response.data.expires_in ?? 300) - 60) * 1000;
    return tokenCache;
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    throw new CadastroPublicoError(status === 401 ? 'Credencial Serpro recusada' : 'Serpro indisponível para consulta', 502);
  }
}

function texto(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function classificarEsfera(codigo: string, descricao: string) {
  const normalizada = descricao.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (codigo.startsWith('1')) return { esferaPublica: true, revisaoManual: false };
  if (codigo.startsWith('2') && /(empresa publica|economia mista)/.test(normalizada)) {
    return { esferaPublica: false, revisaoManual: true };
  }
  return { esferaPublica: false, revisaoManual: false };
}

export type ConsultaCNPJ = {
  documento: string;
  nome: string;
  nomeFantasia?: string;
  situacaoCodigo?: string;
  situacaoDescricao: string;
  naturezaJuridicaCodigo?: string;
  naturezaJuridicaDescricao?: string;
  esferaPublica: boolean;
  revisaoManual: boolean;
  endereco?: Record<string, string>;
  ativo: boolean;
};

export async function consultarCNPJ(cnpjValue: string): Promise<ConsultaCNPJ> {
  const cnpj = somenteDigitos(cnpjValue);
  if (!validarCNPJ(cnpj)) throw new CadastroPublicoError('CNPJ inválido', 400);
  const token = await getSerproToken();
  try {
    const { data } = await axios.get<Record<string, unknown>>(
      `https://gateway.apiserpro.serpro.gov.br/consulta-cnpj-df/v2/empresa/${cnpj}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, timeout: env.SERPRO_TIMEOUT },
    );
    const situacao = (data.situacaoCadastral ?? data.situacao) as Record<string, unknown> | undefined;
    const natureza = data.naturezaJuridica as Record<string, unknown> | undefined;
    const enderecoRaw = (data.endereco ?? data.estabelecimento) as Record<string, unknown> | undefined;
    const situacaoDescricao = texto(situacao?.descricao ?? data.descricaoSituacaoCadastral ?? data.situacaoCadastral);
    const situacaoCodigo = texto(situacao?.codigo ?? data.codigoSituacaoCadastral);
    const naturezaCodigo = texto(natureza?.codigo ?? data.codigoNaturezaJuridica);
    const naturezaDescricao = texto(natureza?.descricao ?? data.descricaoNaturezaJuridica);
    const esfera = classificarEsfera(naturezaCodigo, naturezaDescricao);
    const situacaoNormalizada = situacaoDescricao.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const ativo = situacaoCodigo === '2' || situacaoNormalizada === 'ATIVA' || situacaoNormalizada === 'ATIVO';
    const endereco = enderecoRaw ? Object.fromEntries(
      Object.entries(enderecoRaw).filter(([, value]) => ['string', 'number'].includes(typeof value))
        .map(([key, value]) => [key, texto(value)]),
    ) : undefined;
    return {
      documento: cnpj,
      nome: texto(data.nomeEmpresarial ?? data.razaoSocial ?? data.nome),
      nomeFantasia: texto(data.nomeFantasia) || undefined,
      situacaoCodigo: situacaoCodigo || undefined,
      situacaoDescricao: situacaoDescricao || 'Não informada',
      naturezaJuridicaCodigo: naturezaCodigo || undefined,
      naturezaJuridicaDescricao: naturezaDescricao || undefined,
      ...esfera,
      endereco,
      ativo,
    };
  } catch (error) {
    if (error instanceof CadastroPublicoError) throw error;
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === 404) throw new CadastroPublicoError('CNPJ não encontrado no Serpro', 404);
    throw new CadastroPublicoError('Não foi possível consultar o CNPJ no Serpro', 502);
  }
}

export async function consultarCPF(cpfValue: string) {
  const cpf = somenteDigitos(cpfValue);
  if (!validarCPF(cpf)) throw new CadastroPublicoError('CPF inválido', 400);
  const token = await getSerproToken();
  try {
    const { data } = await axios.get<Record<string, unknown>>(
      `https://gateway.apiserpro.serpro.gov.br/consulta-cpf-df/v2/cpf/${cpf}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, timeout: env.SERPRO_TIMEOUT },
    );
    const situacao = data.situacao as Record<string, unknown> | undefined;
    return {
      documento: cpf,
      nome: texto(data.nome),
      situacaoCodigo: texto(situacao?.codigo ?? data.codigoSituacaoCadastral) || undefined,
      situacaoDescricao: texto(situacao?.descricao ?? data.situacaoCadastral) || 'Não informada',
    };
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    if (status === 404) throw new CadastroPublicoError('CPF não encontrado no Serpro', 404);
    throw new CadastroPublicoError('Não foi possível consultar o CPF no Serpro', 502);
  }
}

export async function consultarCEP(cepValue: string) {
  const cep = somenteDigitos(cepValue);
  if (cep.length !== 8) throw new CadastroPublicoError('CEP inválido', 400);
  try {
    const { data } = await axios.get<Record<string, unknown>>(`https://viacep.com.br/ws/${cep}/json/`, {
      timeout: env.VIACEP_TIMEOUT,
    });
    if (data.erro) throw new CadastroPublicoError('CEP não encontrado', 404);
    return {
      cep,
      logradouro: texto(data.logradouro), complemento: texto(data.complemento), bairro: texto(data.bairro),
      cidade: texto(data.localidade), uf: texto(data.uf), ibge: texto(data.ibge), gia: texto(data.gia),
    };
  } catch (error) {
    if (error instanceof CadastroPublicoError) throw error;
    throw new CadastroPublicoError('ViaCEP indisponível para consulta', 502);
  }
}

export function serproConfigurado(): boolean {
  return Boolean(env.SERPRO_BASIC_TOKEN);
}
