import styles from './StatCard.module.css'

interface Props {
  label: string
  value: string | number
  sub?: string
  accent?: boolean
}

export default function StatCard({ label, value, sub, accent }: Props) {
  return (
    <div className={`${styles.card} ${accent ? styles.accent : ''}`}>
      <span className={styles.label}>{label}</span>
      <strong className={styles.value}>{value}</strong>
      {sub && <span className={styles.sub}>{sub}</span>}
    </div>
  )
}
