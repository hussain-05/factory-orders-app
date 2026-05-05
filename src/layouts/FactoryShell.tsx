import { ClipboardList, LogOut, ScrollText, Warehouse } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/Button'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
    isActive ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-100'
  }`

export function FactoryShell() {
  const { profile, logout } = useAuth()
  const nav = useNavigate()

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              Factory console
            </p>
            <p className="truncate font-display text-lg font-semibold text-slate-900">Operations</p>
            <p className="truncate text-xs text-slate-500">{profile?.displayName}</p>
          </div>
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
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[240px_1fr] sm:px-6">
        <aside className="lg:sticky lg:top-[76px] lg:self-start">
          <nav className="flex flex-row gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm lg:flex-col lg:overflow-visible">
            <NavLink className={linkClass} to="/factory/products">
              <Warehouse className="h-4 w-4" />
              Products
            </NavLink>
            <NavLink className={linkClass} to="/factory/pending">
              <ClipboardList className="h-4 w-4" />
              Pending orders
            </NavLink>
            <NavLink className={linkClass} to="/factory/history">
              <ScrollText className="h-4 w-4" />
              Order history
            </NavLink>
          </nav>
        </aside>
        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
