/** Escapa string para uso seguro em MongoDB $regex (evita ReDoS) */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Aplica teto máximo no parâmetro de paginação limit */
export function parseLimit(raw: string | undefined, defaultVal = 20, max = 200): number {
  const n = Number(raw ?? defaultVal);
  return Math.min(isNaN(n) || n < 1 ? defaultVal : n, max);
}

export function parsePage(raw: string | undefined): number {
  const n = Number(raw ?? 1);
  return isNaN(n) || n < 1 ? 1 : n;
}
