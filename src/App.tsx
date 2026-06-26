import { useEffect } from 'react'
import { Navigate, Route, Routes, useNavigate, useLocation } from 'react-router-dom'
import { RequireAuth } from './components/RequireAuth'
import { RequireAdmin } from './components/RequireAdmin'
import { useAuth } from './contexts/AuthContext'
import { AdminModeProvider } from './contexts/AdminModeContext'
import { AdminShell } from './layouts/AdminShell'
import { FactoryShell } from './layouts/FactoryShell'
import { ShopShell } from './layouts/ShopShell'
import { MissingFirebase } from './pages/MissingFirebase'
import { LoginPage } from './pages/auth/LoginPage'
import { SignUpPage } from './pages/auth/SignUpPage'
import { AdminPage } from './pages/admin/AdminPage'
import { FactoryDashboardPage } from './pages/factory/FactoryDashboardPage'
import { FactoryOrderHistoryPage } from './pages/factory/FactoryOrderHistoryPage'
import { FactoryPendingPage } from './pages/factory/FactoryPendingPage'
import { FactoryProductsPage } from './pages/factory/FactoryProductsPage'
import { FactoryCreateOrderPage } from './pages/factory/FactoryCreateOrderPage'
import { ShopAvailablePage } from './pages/shop/ShopAvailablePage'
import { ShopDashboardPage } from './pages/shop/ShopDashboardPage'
import { ShopNewOrderPage } from './pages/shop/ShopNewOrderPage'
import { ShopOrderHistoryPage } from './pages/shop/ShopOrderHistoryPage'

function HomeRedirect() {
  const { firebaseReady, loading, user, profile } = useAuth()

  if (!firebaseReady) return <MissingFirebase />
  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
        <img src="/seva-logo.png" alt="Seva" className="h-10 w-auto animate-pulse" />
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 transition-colors duration-200">
          <div className="h-full w-1/2 animate-[shimmer_1.2s_ease-in-out_infinite] rounded-full bg-emerald-500" />
        </div>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (!profile) return <Navigate to="/login" replace />

  const dest = profile.isAdmin
    ? (profile.role === 'shop' ? '/shop/dashboard' : '/factory/dashboard')
    : profile.role === 'factory'
      ? '/factory/dashboard'
      : profile.role === 'factory_staff'
        ? '/factory/pending'
        : '/shop/dashboard'

  return <Navigate to={dest} replace />
}

function AppRoutes() {
  const { profile, loading, user } = useAuth()
  const defaultMode = (profile?.role ?? 'factory') as 'factory' | 'shop'
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (loading || !user || !profile) return

    // If session is starting, redirect to default landing page (dashboard)
    const sessionRedirectKey = 'seva_session_redirected'
    if (!sessionStorage.getItem(sessionRedirectKey)) {
      sessionStorage.setItem(sessionRedirectKey, 'true')

      // Avoid overriding deep links (e.g. if the user explicitly clicked a link containing queries or specific paths)
      // Standard app entries land on `/`, `/login`, `/signup`
      const isStandardEntry = 
        location.pathname === '/' || 
        location.pathname === '/login' || 
        location.pathname === '/signup'

      if (isStandardEntry) {
        const dest = profile.isAdmin
          ? (profile.role === 'shop' ? '/shop/dashboard' : '/factory/dashboard')
          : profile.role === 'factory'
            ? '/factory/dashboard'
            : profile.role === 'factory_staff'
              ? '/factory/pending'
              : '/shop/dashboard'

        navigate(dest, { replace: true })
      }
    }
  }, [loading, user, profile, location.pathname, navigate])

  return (
    <AdminModeProvider defaultMode={defaultMode}>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />

        <Route element={<RequireAuth role="shop" />}>
          <Route path="/shop" element={<ShopShell />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<ShopDashboardPage />} />
            <Route path="available" element={<ShopAvailablePage />} />
            <Route path="new-order" element={<ShopNewOrderPage />} />
            <Route path="history" element={<ShopOrderHistoryPage />} />
          </Route>
        </Route>

        <Route element={<RequireAuth role="factory" />}>
          <Route path="/factory" element={<FactoryShell />}>
            <Route index element={<Navigate to={profile?.role === 'factory_staff' ? 'pending' : 'dashboard'} replace />} />
            <Route path="dashboard" element={profile?.role === 'factory_staff' ? <Navigate to="/factory/pending" replace /> : <FactoryDashboardPage />} />
            <Route path="products" element={profile?.role === 'factory_staff' ? <Navigate to="/factory/pending" replace /> : <FactoryProductsPage />} />
            <Route path="create-order" element={profile?.role === 'factory_staff' ? <Navigate to="/factory/pending" replace /> : <FactoryCreateOrderPage />} />
            <Route path="pending" element={<FactoryPendingPage />} />
            <Route path="history" element={<FactoryOrderHistoryPage />} />
          </Route>
        </Route>

        <Route element={<RequireAdmin />}>
          <Route path="/admin" element={<AdminShell />}>
            <Route index element={<AdminPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AdminModeProvider>
  )
}

import { ToastProvider } from './contexts/ToastContext'

export default function App() {
  return (
    <ToastProvider>
      <AppRoutes />
    </ToastProvider>
  )
}