import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { UserRole } from '../types/models'
import { MissingFirebase } from '../pages/MissingFirebase'

export function RequireAuth({ role }: { role: UserRole }) {
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
  if (!profile) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="font-display text-xl font-semibold text-slate-900">Finish your account</h1>
        <p className="mt-2 text-sm text-slate-600">
          We could not find your profile document. Please contact an administrator or sign up again.
        </p>
      </div>
    )
  }
  if (profile.role !== role) {
    const dest = profile.role === 'factory' ? '/factory/pending' : '/shop/available'
    return <Navigate to={dest} replace />
  }
  return <Outlet />
}
