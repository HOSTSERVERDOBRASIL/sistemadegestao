import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Notifications from './Notifications'
import styles from './Layout.module.css'
import sessionStyles from './SessionBanner.module.css'

const NAV = [
  { to: '/', label: 'Dashboard', icon: '▦' },
  { to: '/pedidos', label: 'Pedidos', icon: '📋' },
  { to: '/contratos', label: 'Contratos', icon: '📄' },
  { to: '/clientes', label: 'Clientes', icon: '👤' },
  { to: '/produtos', label: 'Produtos', icon: '📦' },
  { to: '/parceiros', label: 'Parceiros', icon: '🤝' },
  { to: '/financeiro', label: 'Financeiro', icon: '💰' },
  { to: '/cobrancas', label: 'Cobranças', icon: '⚡' },
  { to: '/cupons', label: 'Cupons', icon: '🏷️', adminOnly: true },
  { to: '/relatorios', label: 'Relatórios', icon: '📊' },
  { to: '/integracao-tiny', label: 'Tiny/Olist', icon: '🔗', adminOnly: true },
  { to: '/usuarios', label: 'Usuários', icon: '⚙️', adminOnly: true },
  { to: '/configuracoes', label: 'Configurações', icon: '🔧', adminOnly: true },
  { to: '/conciliacao', label: 'Conciliação', icon: '⚖️', adminOnly: true },
]

export default function Layout() {
  const { user, logout, sessionExpirando, renovarAviso } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const visibleNav = NAV.filter(item => !item.adminOnly || user?.role === 'admin')

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
          {visibleNav.map(item => (
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
