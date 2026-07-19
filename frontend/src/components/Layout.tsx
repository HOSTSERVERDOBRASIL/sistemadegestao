import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Notifications from './Notifications'
import styles from './Layout.module.css'
import sessionStyles from './SessionBanner.module.css'

const NAV_GROUPS = [
  {
    label: null,
    items: [
      { to: '/', label: 'Dashboard', icon: '▦' },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { to: '/clientes',  label: 'Clientes',  icon: '👤' },
      { to: '/contratos', label: 'Contratos', icon: '📄' },
      { to: '/parceiros', label: 'Parceiros / Revendas', icon: '🤝' },
    ],
  },
  {
    label: 'Operações',
    items: [
      { to: '/pedidos',  label: 'Pedidos',  icon: '📋' },
      { to: '/produtos', label: 'Produtos', icon: '📦' },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { to: '/financeiro',     label: 'Notas Fiscais',    icon: '💰' },
      { to: '/notas-empenho',  label: 'Notas de Empenho', icon: '📑' },
      { to: '/cobrancas',      label: 'Cobranças',        icon: '⚡' },
      { to: '/conciliacao',    label: 'Conciliação',      icon: '⚖️', adminOnly: true },
      { to: '/cupons',         label: 'Cupons',           icon: '🏷️', adminOnly: true },
    ],
  },
  {
    label: 'Análise',
    items: [
      { to: '/relatorios', label: 'Relatórios', icon: '📊' },
      { to: '/auditoria', label: 'Auditoria', icon: '🔎', roles: ['admin', 'financeiro'] },
    ],
  },
  {
    label: 'Administração',
    adminOnly: true,
    items: [
      { to: '/integracao-tiny', label: 'Tiny / Olist',   icon: '🔗' },
      { to: '/usuarios',        label: 'Usuários',        icon: '👥' },
      { to: '/configuracoes',   label: 'Configurações',   icon: '🔧' },
      { to: '/logs',            label: 'Logs',            icon: '🪵' },
    ],
  },
]

export default function Layout() {
  const { user, logout, sessionExpirando, renovarAviso } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const isAdmin = user?.role === 'admin'

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandLogo}>
            <span className={styles.brandLogoX}>X</span>
          </div>
          <div className={styles.brandTextBlock}>
            <span className={styles.brandName}>AtlasX</span>
            <span className={styles.brandSub}>by XDigital Brasil</span>
          </div>
        </div>
        <nav className={styles.nav}>
          {NAV_GROUPS.map((group, gi) => {
            if (group.adminOnly && !isAdmin) return null
            const visibleItems = group.items.filter(item => {
              if ((item as { adminOnly?: boolean }).adminOnly && !isAdmin) return false
              const roles = (item as { roles?: string[] }).roles
              return !roles || roles.includes(user?.role ?? '')
            })
            if (visibleItems.length === 0) return null
            return (
              <div key={gi} className={styles.navGroup}>
                {group.label && <span className={styles.navGroupLabel}>{group.label}</span>}
                {visibleItems.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
                  >
                    <span className={styles.navIcon}>{item.icon}</span>
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>
        <div className={styles.userInfo}>
          <div className={styles.userAvatar}>{user?.nome?.charAt(0).toUpperCase()}</div>
          <div className={styles.userDetails}>
            <span className={styles.userName}>{user?.nome}</span>
            <span className={styles.userRole}>{user?.role}</span>
          </div>
          <button className={styles.logoutBtn} onClick={handleLogout} title="Sair">⏻</button>
        </div>
      </aside>
      <main className={styles.main}>
        {sessionExpirando && (
          <div className={sessionStyles.banner}>
            <span>Sua sessão expira em 5 minutos.</span>
            <button onClick={renovarAviso} className={sessionStyles.dismiss}>Entendido</button>
            <button onClick={handleLogout} className={sessionStyles.logout}>Sair agora</button>
          </div>
        )}
        <Outlet />
      </main>
      <Notifications />
    </div>
  )
}
