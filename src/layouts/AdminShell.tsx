import { LayoutDashboard, LogOut, Shield, Users } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/Button'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${
    isActive
      ? 'bg-slate-900/90 text-white shadow-sm'
      : 'text-slate-600 hover:bg-white/70'
  }`

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
                const dest = profile?.role === 'factory' ? '/factory/dashboard' : '/shop/available'
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

        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
          <nav
            aria-label="Admin navigation"
            className="inline-flex gap-1 rounded-2xl border border-white/50 bg-white/50 p-1.5 shadow-md shadow-slate-900/8 backdrop-blur-xl"
          >
            <NavLink className={linkClass} to="/admin/dashboard">
              <LayoutDashboard className="h-4 w-4 shrink-0" />
              Dashboard
            </NavLink>
            <NavLink className={linkClass} to="/admin" end>
              <Users className="h-4 w-4 shrink-0" />
              User access
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}