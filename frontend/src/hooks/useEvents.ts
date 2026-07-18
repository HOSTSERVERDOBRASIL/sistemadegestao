import { useEffect, useRef } from 'react'

export type EventType =
  | 'pedido:etapa'
  | 'pedido:nf_emitida'
  | 'nota:cancelada'
  | 'contrato:faturado'
  | 'ping'

type Handler = (payload: Record<string, unknown>) => void

export function useEvents(handlers: Partial<Record<EventType, Handler>>, enabled = true) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!enabled) return

    const token = localStorage.getItem('token')
    if (!token) return

    const url = `/api/events`
    const es = new EventSource(url + `?token=${encodeURIComponent(token)}`)

    const types: EventType[] = ['pedido:etapa', 'pedido:nf_emitida', 'nota:cancelada', 'contrato:faturado', 'ping']

    for (const type of types) {
      es.addEventListener(type, (e: MessageEvent) => {
        if (type === 'ping') return
        try {
          const payload = JSON.parse(e.data) as Record<string, unknown>
          handlersRef.current[type]?.(payload)
        } catch { /* silencia parse error */ }
      })
    }

    return () => es.close()
  }, [enabled])
}
