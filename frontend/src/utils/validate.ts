// Retorna string de erro ou '' quando válido
export type FieldErrors<T> = Partial<Record<keyof T, string>>

export function required(v: string | number | undefined | null, label: string): string {
  if (v === undefined || v === null || String(v).trim() === '') return `${label} é obrigatório`
  return ''
}

export function email(v: string): string {
  if (!v.trim()) return 'E-mail é obrigatório'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) return 'E-mail inválido'
  return ''
}

export function documento(v: string): string {
  const d = v.replace(/\D/g, '')
  if (!d) return 'Documento é obrigatório'
  if (d.length !== 11 && d.length !== 14) return 'Informe CPF (11 dígitos) ou CNPJ (14 dígitos)'
  return ''
}

export function minLength(v: string, n: number, label: string): string {
  if (!v.trim()) return `${label} é obrigatório`
  if (v.trim().length < n) return `${label} deve ter pelo menos ${n} caracteres`
  return ''
}

export function positiveNumber(v: number | undefined | null, label: string): string {
  if (v === undefined || v === null || isNaN(Number(v))) return `${label} é obrigatório`
  if (Number(v) <= 0) return `${label} deve ser maior que zero`
  return ''
}

export function nonNegativeNumber(v: number | undefined | null, label: string): string {
  if (v === undefined || v === null || isNaN(Number(v))) return `${label} é obrigatório`
  if (Number(v) < 0) return `${label} não pode ser negativo`
  return ''
}

export function dateRange(inicio: string, fim: string): string {
  if (!inicio || !fim) return ''
  if (new Date(fim) <= new Date(inicio)) return 'Data Fim deve ser posterior à Data Início'
  return ''
}

export function selectRequired(v: string, label: string): string {
  if (!v || v.trim() === '') return `${label} é obrigatório`
  return ''
}

// Agrega erros: retorna true se válido (sem erros), false se há erros
export function hasErrors(errors: Record<string, string>): boolean {
  return Object.values(errors).some(e => e !== '')
}
