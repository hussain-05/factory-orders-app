import { Shield } from 'lucide-react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/Button'

export function AdminShell() {
  const { profile } = useAuth()
  const nav = useNavigate()
  const location = useLocation()

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl transition-colors duration-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-3 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-400">
              Admin console
            </p>
            <p className="truncate font-display text-lg font-semibold leading-tight text-slate-900 dark:text-slate-100">
              User access
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{profile?.displayName}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="shrink-0"
              onClick={() => nav(location.state?.from || '/factory/dashboard')}
            >
              <Shield className="h-4 w-4" />
              Back to app
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}