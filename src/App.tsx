import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './components/RequireAuth'
import { useAuth } from './contexts/AuthContext'
import { FactoryShell } from './layouts/FactoryShell'
import { ShopShell } from './layouts/ShopShell'
import { MissingFirebase } from './pages/MissingFirebase'
import { LoginPage } from './pages/auth/LoginPage'
import { SignUpPage } from './pages/auth/SignUpPage'
import { FactoryOrderHistoryPage } from './pages/factory/FactoryOrderHistoryPage'
import { FactoryPendingPage } from './pages/factory/FactoryPendingPage'
import { FactoryProductsPage } from './pages/factory/FactoryProductsPage'
import { ShopAvailablePage } from './pages/shop/ShopAvailablePage'
import { ShopNewOrderPage } from './pages/shop/ShopNewOrderPage'
import { ShopOrderHistoryPage } from './pages/shop/ShopOrderHistoryPage'

function HomeRedirect() {
  const { firebaseReady, loading, user, profile } = useAuth()

  if (!firebaseReady) return <MissingFirebase />
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (!profile) return <Navigate to="/login" replace />
  const dest = profile.role === 'factory' ? '/factory/pending' : '/shop/available'
  return <Navigate to={dest} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />

      <Route element={<RequireAuth role="shop" />}>
        <Route path="/shop" element={<ShopShell />}>
          <Route index element={<Navigate to="available" replace />} />
          <Route path="available" element={<ShopAvailablePage />} />
          <Route path="new-order" element={<ShopNewOrderPage />} />
          <Route path="history" element={<ShopOrderHistoryPage />} />
        </Route>
      </Route>

      <Route element={<RequireAuth role="factory" />}>
        <Route path="/factory" element={<FactoryShell />}>
          <Route index element={<Navigate to="pending" replace />} />
          <Route path="products" element={<FactoryProductsPage />} />
          <Route path="pending" element={<FactoryPendingPage />} />
          <Route path="history" element={<FactoryOrderHistoryPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
