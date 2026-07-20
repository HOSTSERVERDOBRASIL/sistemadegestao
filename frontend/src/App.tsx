import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { ThemeProvider } from './context/ThemeContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Pedidos from './pages/Pedidos'
import PedidoDetalhe from './pages/PedidoDetalhe'
import Contratos from './pages/Contratos'
import ContratoDetalhe from './pages/ContratoDetalhe'
import Clientes from './pages/Clientes'
import ClienteDetalhe from './pages/ClienteDetalhe'
import Produtos from './pages/Produtos'
import Parceiros from './pages/Parceiros'
import Financeiro from './pages/Financeiro'
import Relatorios from './pages/Relatorios'
import Usuarios from './pages/Usuarios'
import Cobrancas from './pages/Cobrancas'
import IntegracaoTiny from './pages/IntegracaoTiny'
import Cupons from './pages/Cupons'
import Configuracoes from './pages/Configuracoes'
import Conciliacao from './pages/Conciliacao'
import NotasEmpenho from './pages/NotasEmpenho'
import Logs from './pages/Logs'
import Auditoria from './pages/Auditoria'
import IntegracaoCLM from './pages/IntegracaoCLM'
import ParceiroDetalhe from './pages/ParceiroDetalhe'
import PortalRevenda from './pages/PortalRevenda'
import EmitirNF from './pages/EmitirNF'

function PrivateRoute({ children, adminOnly = false, revendaOnly = false }: { children: React.ReactNode; adminOnly?: boolean; revendaOnly?: boolean }) {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', color: '#64748b', fontSize: '0.875rem' }}>Carregando...</div>
  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />
  if (revendaOnly && user.role !== 'revenda') return <Navigate to="/" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', color: '#64748b', fontSize: '0.875rem' }}>Carregando...</div>

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="pedidos" element={<Pedidos />} />
        <Route path="pedidos/rascunho" element={<Pedidos statusFixo="Rascunho" />} />
        <Route path="pedidos/aprovados" element={<Pedidos statusFixo="Aprovado" />} />
        <Route path="pedidos/em-processo" element={<Pedidos statusFixo="Em processo" />} />
        <Route path="pedidos/faturados" element={<Pedidos statusFixo="Faturado" />} />
        <Route path="pedidos/concluidos" element={<Pedidos statusFixo="Concluido" />} />
        <Route path="pedidos/cancelados" element={<Pedidos statusFixo="Cancelado" />} />
        <Route path="pedidos/:id" element={<PedidoDetalhe />} />
        <Route path="contratos" element={<Contratos />} />
        <Route path="contratos/vencendo" element={<Contratos vencendo />} />
        <Route path="contratos/:id" element={<ContratoDetalhe />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="clientes/:id" element={<ClienteDetalhe />} />
        <Route path="produtos" element={<Produtos />} />
        <Route path="produtos/ativos" element={<Produtos ativoFixo="ativos" />} />
        <Route path="produtos/inativos" element={<Produtos ativoFixo="inativos" />} />
        <Route path="parceiros" element={<Parceiros />} />
        <Route path="parceiros/ativos" element={<Parceiros ativoFixo="ativos" />} />
        <Route path="parceiros/inativos" element={<Parceiros ativoFixo="inativos" />} />
        <Route path="parceiros/:id" element={<ParceiroDetalhe />} />
        <Route path="financeiro" element={<Financeiro />} />
        <Route path="financeiro/emitidas" element={<Financeiro statusFixo="Emitida" />} />
        <Route path="financeiro/pendentes" element={<Financeiro statusFixo="Pendente" />} />
        <Route path="financeiro/canceladas" element={<Financeiro statusFixo="Cancelada" />} />
        <Route path="financeiro/emitir" element={<EmitirNF />} />
        <Route path="relatorios" element={<Relatorios />} />
        <Route path="cobrancas" element={<Cobrancas />} />
        <Route path="cupons" element={<PrivateRoute adminOnly><Cupons /></PrivateRoute>} />
        <Route path="integracao-tiny" element={<PrivateRoute adminOnly><IntegracaoTiny /></PrivateRoute>} />
        <Route path="usuarios" element={<PrivateRoute adminOnly><Usuarios /></PrivateRoute>} />
        <Route path="configuracoes" element={<PrivateRoute adminOnly><Configuracoes /></PrivateRoute>} />
        <Route path="notas-empenho" element={<NotasEmpenho />} />
        <Route path="conciliacao" element={<PrivateRoute adminOnly><Conciliacao /></PrivateRoute>} />
        <Route path="logs" element={<PrivateRoute adminOnly><Logs /></PrivateRoute>} />
        <Route path="auditoria" element={<Auditoria />} />
        <Route path="integracao-clm" element={<PrivateRoute adminOnly><IntegracaoCLM /></PrivateRoute>} />
        <Route path="portal-revenda" element={<PrivateRoute revendaOnly><PortalRevenda /></PrivateRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
