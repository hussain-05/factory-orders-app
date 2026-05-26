import { LogOut, Shield } from 'lucide-react'
import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/Button'

export function AdminShell() {
  const { profile, logout } = useAuth()
  const nav = useNavigate()

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-3 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              Admin console
            </p>
            <p className="truncate font-display text-lg font-semibold leading-tight text-slate-900">
              User access
            </p>
            <p className="truncate text-xs text-slate-500">{profile?.displayName}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="shrink-0"
              onClick={() => {
                const dest = profile?.role === 'factory' ? '/factory/pending' : '/shop/available'
                nav(dest)
              }}
            >
              <Shield className="h-4 w-4" />
              Back to app
            </Button>
            <Button
              variant="secondary"
              className="shrink-0"
              onClick={async () => {
                await logout()
                nav('/login')
              }}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
        <div className="h-3" />
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}