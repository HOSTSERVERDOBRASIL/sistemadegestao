/**
 * Parser de arquivos OFX (Open Financial Exchange).
 * Suportado por Banco do Brasil, Bradesco, Itaú, Santander e outros.
 * Exportar extrato em formato OFX no internet banking de cada banco.
 *
 * Suporta OFX 1.x (SGML flat) e OFX 2.x (XML).
 */

export interface OfxTransaction {
  tipo: 'credito' | 'debito';
  valor: number;
  data: Date;
  descricao: string;
  id: string;           // FITID — identificador único da transação no banco
  memo?: string;        // campo MEMO adicional
  checknum?: string;    // número de cheque/documento
}

export interface OfxParseResult {
  banco?: string;
  agencia?: string;
  conta?: string;
  periodoInicio?: Date;
  periodoFim?: Date;
  transacoes: OfxTransaction[];
}

/** Parse de arquivo OFX em texto (UTF-8 ou ISO-8859-1) */
export function parseOfx(conteudo: string): OfxParseResult {
  // Normaliza encoding e quebras de linha
  const texto = conteudo
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const result: OfxParseResult = { transacoes: [] };

  // ─── Metadados da conta ───────────────────────────────────────────────────
  const bankId   = extractTag(texto, 'BANKID');
  const branchId = extractTag(texto, 'BRANCHID');
  const acctId   = extractTag(texto, 'ACCTID');
  if (bankId)   result.banco   = mapBankId(bankId);
  if (branchId) result.agencia = branchId;
  if (acctId)   result.conta   = acctId;

  // ─── Período do extrato ───────────────────────────────────────────────────
  const dtStart = extractTag(texto, 'DTSTART');
  const dtEnd   = extractTag(texto, 'DTEND');
  if (dtStart) result.periodoInicio = parseOfxDate(dtStart);
  if (dtEnd)   result.periodoFim    = parseOfxDate(dtEnd);

  // ─── Transações ──────────────────────────────────────────────────────────
  // Extrai blocos <STMTTRN>...</STMTTRN>
  const blocoRegex = /<STMTTRN[^>]*>([\s\S]*?)<\/STMTTRN>/gi;
  // Suporte OFX 1.x flat (sem tags de fechamento)
  const flatRegex  = /STMTTRN([\s\S]*?)(?=STMTTRN|<\/BANKTRANLIST|$)/gi;

  const usaXml = /<STMTTRN/i.test(texto);

  if (usaXml) {
    let m: RegExpExecArray | null;
    while ((m = blocoRegex.exec(texto)) !== null) {
      const bloco = m[1];
      const tx = parseTrn(bloco);
      if (tx) result.transacoes.push(tx);
    }
  } else {
    // OFX 1.x flat SGML
    const banktranlist = extractSection(texto, 'BANKTRANLIST');
    if (banktranlist) {
      let fm: RegExpExecArray | null;
      const flat = /STMTTRN([\s\S]*?)(?=STMTTRN|LEDGERBAL|$)/gi;
      while ((fm = flat.exec(banktranlist)) !== null) {
        const tx = parseFlatTrn(fm[1]);
        if (tx) result.transacoes.push(tx);
      }
    }
  }

  return result;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractTag(texto: string, tag: string): string {
  const xml  = new RegExp(`<${tag}>([^<]+)`, 'i').exec(texto);
  const flat = new RegExp(`^${tag}:(.+)$`, 'im').exec(texto);
  return (xml?.[1] ?? flat?.[1] ?? '').trim();
}

function extractSection(texto: string, tag: string): string | null {
  const xml = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i').exec(texto);
  if (xml) return xml[1];
  // flat: section runs from <TAG> to next top-level tag or end
  const startIdx = texto.search(new RegExp(`<${tag}>|${tag}`, 'i'));
  if (startIdx < 0) return null;
  return texto.slice(startIdx);
}

function parseTrn(bloco: string): OfxTransaction | null {
  const trntype  = extractTag(bloco, 'TRNTYPE');
  const dtposted = extractTag(bloco, 'DTPOSTED');
  const trnamt   = extractTag(bloco, 'TRNAMT');
  const fitid    = extractTag(bloco, 'FITID');
  const name     = extractTag(bloco, 'NAME');
  const memo     = extractTag(bloco, 'MEMO');
  const checknum = extractTag(bloco, 'CHECKNUM');

  if (!dtposted || !trnamt || !fitid) return null;

  const valor = Math.abs(parseFloat(trnamt.replace(',', '.')));
  if (isNaN(valor)) return null;

  return {
    tipo:      trntype === 'DEBIT' || parseFloat(trnamt) < 0 ? 'debito' : 'credito',
    valor,
    data:      parseOfxDate(dtposted),
    descricao: name || memo || trntype || 'Lançamento',
    id:        fitid,
    memo:      memo || undefined,
    checknum:  checknum || undefined,
  };
}

function parseFlatTrn(bloco: string): OfxTransaction | null {
  function val(tag: string) {
    const m = new RegExp(`^${tag}:(.+)$`, 'im').exec(bloco);
    return m?.[1]?.trim() ?? '';
  }
  const trntype  = val('TRNTYPE');
  const dtposted = val('DTPOSTED');
  const trnamt   = val('TRNAMT');
  const fitid    = val('FITID');
  const name     = val('NAME');
  const memo     = val('MEMO');
  const checknum = val('CHECKNUM');

  if (!dtposted || !trnamt || !fitid) return null;
  const valor = Math.abs(parseFloat(trnamt.replace(',', '.')));
  if (isNaN(valor)) return null;

  return {
    tipo:      trntype === 'DEBIT' || parseFloat(trnamt) < 0 ? 'debito' : 'credito',
    valor,
    data:      parseOfxDate(dtposted),
    descricao: name || memo || trntype || 'Lançamento',
    id:        fitid,
    memo:      memo || undefined,
    checknum:  checknum || undefined,
  };
}

function parseOfxDate(s: string): Date {
  // Formato OFX: YYYYMMDDHHMMSS[.mmm][+HH:MM] ou YYYYMMDD
  const clean = s.replace(/\[.*\]/, '').trim();
  const y = clean.slice(0, 4);
  const mo = clean.slice(4, 6);
  const d = clean.slice(6, 8);
  const h = clean.slice(8, 10) || '00';
  const mi = clean.slice(10, 12) || '00';
  const sec = clean.slice(12, 14) || '00';
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${sec}Z`);
}

function mapBankId(id: string): string {
  const bancos: Record<string, string> = {
    '001': 'BB',
    '237': 'Bradesco',
    '341': 'Itaú',
    '033': 'Santander',
    '104': 'Caixa',
  };
  return bancos[id] ?? id;
}
