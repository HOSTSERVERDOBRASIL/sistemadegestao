import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { User, LoginPayload } from '../types'
import { auth } from '../api'

const AVISO_ANTECIPADO_MS = 5 * 60 * 1000 // avisa 5 min antes de expirar

interface AuthContextValue {
  user: User | null
  token: string
  loading: boolean
  sessionExpirando: boolean
  login: (payload: LoginPayload) => Promise<void>
  logout: () => Promise<void>
  renovarAviso: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function parseExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(localStorage.getItem('token') || '')
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(!!localStorage.getItem('token'))
  const [sessionExpirando, setSessionExpirando] = useState(false)

  const timerAviso = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timerLogout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = useCallback(() => {
    if (timerAviso.current) clearTimeout(timerAviso.current)
    if (timerLogout.current) clearTimeout(timerLogout.current)
  }, [])

  const scheduleExpiry = useCallback((tk: string) => {
    clearTimers()
    const exp = parseExp(tk)
    if (!exp) return

    const now = Date.now()
    const msUntilExpiry = exp - now
    if (msUntilExpiry <= 0) return

    const msUntilAviso = msUntilExpiry - AVISO_ANTECIPADO_MS
    if (msUntilAviso > 0) {
      timerAviso.current = setTimeout(() => setSessionExpirando(true), msUntilAviso)
    } else {
      setSessionExpirando(true)
    }

    timerLogout.current = setTimeout(() => {
      localStorage.removeItem('token')
      setToken('')
      setUser(null)
      setSessionExpirando(false)
      window.location.href = '/login'
    }, msUntilExpiry)
  }, [clearTimers])

  useEffect(() => {
    if (!token) { setLoading(false); return }
    auth.me()
      .then(u => { setUser(u); scheduleExpiry(token) })
      .catch(() => { localStorage.removeItem('token'); setToken(''); setUser(null) })
      .finally(() => setLoading(false))

    return clearTimers
  }, [token, scheduleExpiry, clearTimers])

  async function login(payload: LoginPayload) {
    const data = await auth.login(payload)
    localStorage.setItem('token', data.token)
    setToken(data.token)
    setSessionExpirando(false)
    const me = await auth.me()
    setUser(me)
    scheduleExpiry(data.token)
  }

  async function logout() {
    try { await auth.logout() } catch { /* ignora erros de rede no logout */ }
    clearTimers()
    localStorage.removeItem('token')
    setToken('')
    setUser(null)
    setSessionExpirando(false)
  }

  function renovarAviso() {
    setSessionExpirando(false)
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, sessionExpirando, login, logout, renovarAviso }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
