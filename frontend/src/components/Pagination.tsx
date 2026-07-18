import styles from './Pagination.module.css'

interface Props {
  page: number
  total: number
  limit: number
  onChange: (page: number) => void
}

export default function Pagination({ page, total, limit, onChange }: Props) {
  const pages = Math.ceil(total / limit)
  if (pages <= 1) return null

  return (
    <div className={styles.pagination}>
      <button disabled={page <= 1} onClick={() => onChange(page - 1)}>‹ Anterior</button>
      <span className={styles.info}>
        Página {page} de {pages} &nbsp;·&nbsp; {total} registros
      </span>
      <button disabled={page >= pages} onClick={() => onChange(page + 1)}>Próximo ›</button>
    </div>
  )
}
