import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { MissingFirebase } from '../pages/MissingFirebase'

export function RequireAdmin() {
  const { firebaseReady, loading, user, profile } = useAuth()
  const loc = useLocation()

  if (!firebaseReady) return <MissingFirebase />
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  if (!profile?.isAdmin) {
    const dest = profile?.role === 'factory' ? '/factory/dashboard' : '/shop/dashboard'
    return <Navigate to={dest ?? '/login'} replace />
  }
  return <Outlet />
}