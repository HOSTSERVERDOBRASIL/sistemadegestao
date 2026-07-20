import { useState } from 'react'
import { NavLink, Link, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, FileText, Handshake, ClipboardList, Package,
  Receipt, FileStack, Zap, Scale, Tag, BarChart2,
  Link2, RefreshCw, UserCog, Settings, ScrollText, ShieldCheck,
  Sun, Moon, LogOut, Bell, Wallet, FilePlus, CheckCircle, Clock, XCircle,
  ChevronRight, AlertTriangle, History, Activity, PlusCircle,
} from 'lucide-react'

import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import Notifications from './Notifications'
import styles from './Layout.module.css'
import sessionStyles from './SessionBanner.module.css'
import AtlasLogo from './AtlasLogo'

type NavItem = { to: string; label: string; Icon: React.ElementType; adminOnly?: boolean; roles?: string[] }
type NavSubMenu = { label: string; Icon: React.ElementType; items: NavItem[]; adminOnly?: boolean; roles?: string[] }
type NavEntry = NavItem | NavSubMenu
type NavGroup = { label: string | null; entries: NavEntry[]; adminOnly?: boolean }

function isSubMenu(e: NavEntry): e is NavSubMenu {
  return 'items' in e
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    entries: [
      { to: '/', label: 'Dashboard', Icon: LayoutDashboard },
    ],
  },
  {
    label: 'Comercial',
    entries: [
      { to: '/clientes', label: 'Clientes', Icon: Users },
      {
        label: 'Contratos',
        Icon: FileText,
        items: [
          { to: '/contratos',          label: 'Todos os Contratos', Icon: FileText },
          { to: '/contratos/vencendo', label: 'Vencendo (30d)',     Icon: AlertTriangle },
        ],
      },
      { to: '/parceiros', label: 'Parceiros / Revendas', Icon: Handshake },
    ],
  },
  {
    label: 'Operações',
    entries: [
      {
        label: 'Pedidos',
        Icon: ClipboardList,
        items: [
          { to: '/pedidos',             label: 'Todos os Pedidos', Icon: ClipboardList },
          { to: '/pedidos/em-processo', label: 'Em Andamento',     Icon: Activity },
          { to: '/pedidos/faturados',   label: 'Aguard. Entrega',  Icon: Clock },
          { to: '/pedidos/concluidos',  label: 'Histórico',        Icon: History },
        ],
      },
      { to: '/produtos', label: 'Produtos', Icon: Package },
      { to: '/certificados-icp', label: 'Certificados ICP', Icon: ShieldCheck },
    ],
  },
  {
    label: 'Financeiro',
    entries: [
      {
        label: 'Notas Fiscais',
        Icon: Receipt,
        items: [
          { to: '/financeiro/dashboard',  label: 'Dashboard NF',     Icon: LayoutDashboard },
          { to: '/financeiro/emitir',     label: 'Emitir NF',        Icon: FilePlus },
          { to: '/financeiro/pendentes',  label: 'Pendentes',        Icon: Clock },
          { to: '/financeiro',            label: 'Todas as NFs',     Icon: Receipt },
          { to: '/financeiro/emitidas',   label: 'Emitidas',         Icon: CheckCircle },
          { to: '/financeiro/canceladas', label: 'Canceladas',       Icon: XCircle },
        ],
      },
      { to: '/notas-empenho', label: 'Notas de Empenho', Icon: FileStack },
      { to: '/cobrancas',     label: 'Cobranças',        Icon: Zap },
      { to: '/conciliacao',   label: 'Conciliação',      Icon: Scale, adminOnly: true },
      { to: '/cupons',        label: 'Cupons',           Icon: Tag,   adminOnly: true },
    ],
  },
  {
    label: 'Análise',
    entries: [
      { to: '/relatorios', label: 'Relatórios', Icon: BarChart2 },
      { to: '/auditoria',  label: 'Auditoria',  Icon: ShieldCheck, roles: ['admin', 'financeiro'] },
    ],
  },
  {
    label: 'Administração',
    adminOnly: true,
    entries: [
      { to: '/integracao-tiny', label: 'Tiny / Olist',  Icon: Link2 },
      { to: '/integracao-clm',  label: 'CLM',           Icon: RefreshCw },
      { to: '/usuarios',        label: 'Usuários',      Icon: UserCog },
      { to: '/configuracoes',   label: 'Configurações', Icon: Settings },
      { to: '/logs',            label: 'Logs',          Icon: ScrollText },
    ],
  },
]

const NAV_GROUPS_REVENDA: NavGroup[] = [
  {
    label: null,
    entries: [{ to: '/', label: 'Dashboard', Icon: LayoutDashboard }],
  },
  {
    label: 'Minha Conta',
    entries: [
      { to: '/portal-revenda?aba=visao-geral', label: 'Visão Geral',         Icon: LayoutDashboard },
      { to: '/portal-revenda?aba=carteira',    label: 'Carteira',            Icon: Wallet },
      { to: '/portal-revenda?aba=pedidos',     label: 'Meus Pedidos',        Icon: ClipboardList },
      { to: '/portal-revenda?aba=relatorio',   label: 'Relatório de Consumo', Icon: BarChart2 },
    ],
  },
]

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/portal-revenda': 'Portal da Revenda',
  '/clientes': 'Clientes',
  '/contratos': 'Contratos',
  '/contratos/vencendo': 'Contratos Vencendo',
  '/parceiros': 'Parceiros / Revendas',
  '/parceiros/ativos': 'Parceiros Ativos',
  '/parceiros/inativos': 'Parceiros Inativos',
  '/pedidos': 'Pedidos',
  '/pedidos/rascunho': 'Pedidos — Rascunho',
  '/pedidos/aprovados': 'Pedidos — Aprovados',
  '/pedidos/em-processo': 'Pedidos — Em Processo',
  '/pedidos/faturados': 'Pedidos — Faturados',
  '/pedidos/concluidos': 'Pedidos — Concluídos',
  '/pedidos/cancelados': 'Pedidos — Cancelados',
  '/produtos': 'Produtos',
  '/certificados-icp': 'Certificados ICP',
  '/produtos/ativos': 'Produtos Ativos',
  '/produtos/inativos': 'Produtos Inativos',
  '/financeiro/dashboard': 'Dashboard NF',
  '/financeiro': 'Notas Fiscais',
  '/financeiro/emitidas': 'Notas Emitidas',
  '/financeiro/pendentes': 'Notas Pendentes',
  '/financeiro/canceladas': 'Notas Canceladas',
  '/financeiro/emitir': 'Emitir Nota Fiscal',
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

function NavItemLink({ to, label, Icon, sub = false }: NavItem & { sub?: boolean }) {
  const location = useLocation()
  const hasQuery = to.includes('?')
  const cls = sub ? styles.navSubItem : styles.navItem

  if (hasQuery) {
    const fullPath = location.pathname + location.search
    const isActive = fullPath === to || (fullPath.startsWith(to.split('?')[0]) && fullPath.includes(to.split('?')[1]))
    return (
      <Link key={to} to={to} className={`${cls} ${isActive ? styles.active : ''}`}>
        <Icon size={sub ? 14 : 16} className={styles.navIcon} strokeWidth={1.75} />
        <span>{label}</span>
      </Link>
    )
  }
  return (
    <NavLink
      key={to}
      to={to}
      end={to === '/'}
      className={({ isActive }) => `${cls} ${isActive ? styles.active : ''}`}
    >
      <Icon size={sub ? 14 : 16} className={styles.navIcon} strokeWidth={1.75} />
      <span>{label}</span>
    </NavLink>
  )
}

function NavSubMenuEntry({ entry, isAdmin, userRole }: { entry: NavSubMenu; isAdmin: boolean; userRole: string }) {
  const location = useLocation()
  const isAnyChildActive = entry.items.some(item => location.pathname === item.to || location.pathname.startsWith(item.to + '/'))
  const [open, setOpen] = useState(isAnyChildActive)

  const visibleItems = entry.items.filter(item => {
    if (item.adminOnly && !isAdmin) return false
    return !item.roles || item.roles.includes(userRole)
  })
  if (visibleItems.length === 0) return null

  return (
    <div>
      <button
        className={`${styles.navParent} ${open ? styles.open : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <entry.Icon size={16} className={styles.navIcon} strokeWidth={1.75} />
        <span>{entry.label}</span>
        <ChevronRight size={13} className={styles.navChevron} />
      </button>
      <div className={`${styles.navSubmenu} ${open ? styles.open : ''}`}>
        {visibleItems.map(item => (
          <NavItemLink key={item.to} {...item} sub />
        ))}
      </div>
    </div>
  )
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
  const groups = user?.role === 'revenda' ? NAV_GROUPS_REVENDA : NAV_GROUPS

  const pathKey = ROUTE_LABELS[location.pathname]
    ? location.pathname
    : '/' + location.pathname.split('/')[1]
  const pageLabel = ROUTE_LABELS[pathKey] ?? ''
  const isDetail = location.pathname.split('/').length > 2 && !ROUTE_LABELS[location.pathname]

  return (
    <div className={styles.shell}>
      {/* ── Sidebar ──────────────────────────────────────── */}
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <AtlasLogo variant={theme === 'dark' ? 'white' : 'navy'} width={152} />
        </div>

        <nav className={styles.nav}>
          {groups.map((group, gi) => {
            if (group.adminOnly && !isAdmin) return null
            const visibleEntries = group.entries.filter(entry => {
              if (entry.adminOnly && !isAdmin) return false
              if (!isSubMenu(entry)) {
                return !entry.roles || entry.roles.includes(user?.role ?? '')
              }
              return true
            })
            if (visibleEntries.length === 0) return null
            return (
              <div key={gi} className={styles.navGroup}>
                {group.label && <span className={styles.navGroupLabel}>{group.label}</span>}
                {visibleEntries.map((entry, ei) =>
                  isSubMenu(entry) ? (
                    <NavSubMenuEntry
                      key={ei}
                      entry={entry}
                      isAdmin={isAdmin}
                      userRole={user?.role ?? ''}
                    />
                  ) : (
                    <NavItemLink key={entry.to} {...entry} />
                  )
                )}
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
