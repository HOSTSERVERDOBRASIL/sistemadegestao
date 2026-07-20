import type { CSSProperties } from 'react'
import styles from './StatCard.module.css'

interface Props {
  label: string
  value: string | number
  sub?: string
  accent?: boolean
  style?: CSSProperties
}

export default function StatCard({ label, value, sub, accent, style }: Props) {
  return (
    <div className={`${styles.card} ${accent ? styles.accent : ''}`} style={style}>
      <span className={styles.label}>{label}</span>
      <strong className={styles.value}>{value}</strong>
      {sub && <span className={styles.sub}>{sub}</span>}
    </div>
  )
}
