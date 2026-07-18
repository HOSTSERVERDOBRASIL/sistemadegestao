import styles from './Badge.module.css'

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple'

interface Props {
  label: string
  variant?: Variant
}

const STATUS_MAP: Record<string, Variant> = {
  Concluido: 'success',
  Faturado: 'success',
  Emitida: 'success',
  Ativo: 'success',
  Aprovado: 'info',
  'Em processo': 'warning',
  Aberta: 'info',
  Parcial: 'warning',
  Fechada: 'default',
  Rascunho: 'default',
  Cancelada: 'danger',
  Pendente: 'warning',
  XDigital: 'purple',
  Revendedor: 'info',
}

export default function Badge({ label, variant }: Props) {
  const v = variant ?? STATUS_MAP[label] ?? 'default'
  return <span className={`${styles.badge} ${styles[v]}`}>{label}</span>
}
