import { useEvents } from '../hooks/useEvents'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import styles from './Notifications.module.css'

export default function Notifications() {
  const { user } = useAuth()
  const { toasts, addToast, dismiss } = useToast()

  useEvents({
    'pedido:etapa': (p) => {
      addToast(`Pedido ${p.numero ?? p.pedidoId}: etapa avançou para ${p.etapa}`, 'info')
    },
    'pedido:nf_emitida': (p) => {
      addToast(`NF emitida para pedido ${p.pedidoId}`, 'success')
    },
    'nota:cancelada': (p) => {
      addToast(`NF ${p.notaId} foi cancelada`, 'warning')
    },
    'contrato:faturado': (p) => {
      addToast(`Contrato ${p.numero} faturado integralmente`, 'success')
    },
    'cobranca_paga': (p) => {
      addToast(`Cobrança do pedido ${p.pedidoId} paga!`, 'success')
    },
    'cobranca_criada': (p) => {
      const tipo = p.tipo === 'pix' ? 'PIX' : 'boleto'
      addToast(`Cobrança ${tipo} gerada para pedido ${p.pedidoId}`, 'info')
    },
    'tiny_sync': (p) => {
      addToast(`Sincronizado com Tiny: ${p.tipo} ${p.id}`, 'info')
    },
    'etapa_atualizada': (p) => {
      addToast(`Pedido ${p.pedidoId} avançou para etapa ${p.etapa} (via Tiny)`, 'info')
    },
  }, !!user)

  if (toasts.length === 0) return null

  return (
    <div className={styles.container}>
      {toasts.map(t => (
        <div key={t.id} className={`${styles.toast} ${styles[t.type]}`}>
          <span className={styles.message}>{t.message}</span>
          <button className={styles.dismiss} onClick={() => dismiss(t.id)}>✕</button>
        </div>
      ))}
    </div>
  )
}
