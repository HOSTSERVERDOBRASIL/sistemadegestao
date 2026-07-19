import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, FileText, Handshake, ClipboardList, Package,
  Receipt, FileStack, Zap, Scale, Tag, BarChart2, Search as SearchIcon,
  Link2, RefreshCw, UserCog, Settings, ScrollText, ShieldCheck,
  Sun, Moon, LogOut, Bell,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import Notifications from './Notifications'
import styles from './Layout.module.css'
import sessionStyles from './SessionBanner.module.css'

const NAV_GROUPS = [
  {
    label: null,
    items: [
      { to: '/', label: 'Dashboard', Icon: LayoutDashboard },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { to: '/clientes',  label: 'Clientes',           Icon: Users },
      { to: '/contratos', label: 'Contratos',           Icon: FileText },
      { to: '/parceiros', label: 'Parceiros / Revendas', Icon: Handshake },
    ],
  },
  {
    label: 'Operações',
    items: [
      { to: '/pedidos',  label: 'Pedidos',  Icon: ClipboardList },
      { to: '/produtos', label: 'Produtos', Icon: Package },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { to: '/financeiro',    label: 'Notas Fiscais',    Icon: Receipt },
      { to: '/notas-empenho', label: 'Notas de Empenho', Icon: FileStack },
      { to: '/cobrancas',     label: 'Cobranças',        Icon: Zap },
      { to: '/conciliacao',   label: 'Conciliação',      Icon: Scale,   adminOnly: true },
      { to: '/cupons',        label: 'Cupons',           Icon: Tag,     adminOnly: true },
    ],
  },
  {
    label: 'Análise',
    items: [
      { to: '/relatorios', label: 'Relatórios', Icon: BarChart2 },
      { to: '/auditoria',  label: 'Auditoria',  Icon: ShieldCheck, roles: ['admin', 'financeiro'] },
    ],
  },
  {
    label: 'Administração',
    adminOnly: true,
    items: [
      { to: '/integracao-tiny', label: 'Tiny / Olist',  Icon: Link2 },
      { to: '/integracao-clm',  label: 'CLM',            Icon: RefreshCw },
      { to: '/usuarios',        label: 'Usuários',       Icon: UserCog },
      { to: '/configuracoes',   label: 'Configurações',  Icon: Settings },
      { to: '/logs',            label: 'Logs',           Icon: ScrollText },
    ],
  },
]

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/clientes': 'Clientes',
  '/contratos': 'Contratos',
  '/parceiros': 'Parceiros / Revendas',
  '/pedidos': 'Pedidos',
  '/produtos': 'Produtos',
  '/financeiro': 'Notas Fiscais',
  '/notas-empenho': 'Notas de Empenho',
  '/cobrancas': 'Cobranças',
  '/conciliacao': 'Conciliação',
  '/cupons': 'Cupons',
  '/relatorios': 'Relatórios',
  '/auditoria': 'Auditoria',
  '/integracao-tiny': 'Tiny / Olist',
  '/integracao-clm': 'CLM',
  '/usuarios': 'Usuários',
  '/configuracoes': 'Configurações',
  '/logs': 'Logs',
}

export default function Layout() {
  const { user, logout, sessionExpirando, renovarAviso } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const isAdmin = user?.role === 'admin'

  // Breadcrumb: resolve current path label
  const pathKey = '/' + location.pathname.split('/')[1]
  const pageLabel = ROUTE_LABELS[pathKey] ?? ''
  const isDetail = location.pathname.split('/').length > 2

  return (
    <div className={styles.shell}>
      {/* ── Sidebar ──────────────────────────────────────── */}
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
                {visibleItems.map(({ to, label, Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
                  >
                    <Icon size={16} className={styles.navIcon} strokeWidth={1.75} />
                    <span>{label}</span>
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
          <button className={styles.logoutBtn} onClick={handleLogout} title="Sair">
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────── */}
      <div className={styles.mainWrapper}>
        {/* Topbar */}
        <header className={styles.topbar}>
          <div className={styles.breadcrumb}>
            <span className={styles.breadcrumbRoot}>AtlasX</span>
            {pageLabel && (
              <>
                <span className={styles.breadcrumbSep}>/</span>
                <span className={styles.breadcrumbCurrent}>{pageLabel}</span>
              </>
            )}
            {isDetail && (
              <>
                <span className={styles.breadcrumbSep}>/</span>
                <span className={styles.breadcrumbCurrent}>Detalhe</span>
              </>
            )}
          </div>
          <div className={styles.topbarActions}>
            <button className={styles.topbarIconBtn} onClick={toggleTheme} title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}>
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button className={styles.topbarIconBtn} title="Notificações">
              <Bell size={17} />
            </button>
          </div>
        </header>

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
      </div>

      <Notifications />
    </div>
  )
}
