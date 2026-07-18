import styles from './Table.module.css'
import type { ReactNode } from 'react'

interface Column<T> {
  key: string
  header: string
  render?: (row: T) => ReactNode
  width?: string
}

interface Props<T> {
  columns: Column<T>[]
  rows: T[]
  keyField?: keyof T
  onRowClick?: (row: T) => void
  loading?: boolean
  empty?: string
}

export default function Table<T>({
  columns, rows, keyField = '_id' as keyof T, onRowClick, loading, empty = 'Nenhum resultado'
}: Props<T>) {
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} style={col.width ? { width: col.width } : undefined}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={columns.length} className={styles.center}>Carregando...</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={columns.length} className={styles.center}>{empty}</td></tr>
          ) : (
            rows.map((row) => (
              <tr
                key={String((row as Record<string, unknown>)[keyField as string])}
                onClick={() => onRowClick?.(row)}
                className={onRowClick ? styles.clickable : undefined}
              >
                {columns.map(col => (
                  <td key={col.key}>
                    {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
