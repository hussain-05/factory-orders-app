import { LayoutGrid, LogOut, PackagePlus, ScrollText, Shield } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/Button'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${
    isActive
      ? 'bg-emerald-600/90 text-white shadow-sm'
      : 'text-slate-600 hover:bg-white/70'
  }`

export function ShopShell() {
  const { profile, logout } = useAuth()
  const nav = useNavigate()

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
        {/* Row 1: identity + sign out */}
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-3 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Shop console
            </p>
            <p className="truncate font-display text-lg font-semibold leading-tight text-slate-900">
              {profile?.shopName ?? 'Shop'}
            </p>
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

        {/* Row 2: floating nav pill */}
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
          <nav
            aria-label="Main navigation"
            className="inline-flex gap-1 rounded-2xl border border-white/50 bg-white/50 p-1.5 shadow-md shadow-slate-900/8 backdrop-blur-xl"
          >
            <NavLink className={linkClass} to="/shop/available">
              <LayoutGrid className="h-4 w-4 shrink-0" />
              <span className="sm:hidden">Available</span>
              <span className="hidden sm:inline">Available products</span>
            </NavLink>
            <NavLink className={linkClass} to="/shop/new-order">
              <PackagePlus className="h-4 w-4 shrink-0" />
              New order
            </NavLink>
            <NavLink className={linkClass} to="/shop/history">
              <ScrollText className="h-4 w-4 shrink-0" />
              <span className="sm:hidden">History</span>
              <span className="hidden sm:inline">Order history</span>
            </NavLink>
            {profile?.isAdmin && (
              <NavLink className={linkClass} to="/admin">
                <Shield className="h-4 w-4 shrink-0" />
                Admin
              </NavLink>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}