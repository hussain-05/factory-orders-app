import { Bell, BellOff, LayoutDashboard, LayoutGrid, PackagePlus, ScrollText, Shield, User } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { UserProfileDrawer } from '../components/UserProfileDrawer'
import { useNotifications } from '../hooks/useNotifications'
import { Button } from '../components/ui/Button'
import { ModeSwitcher } from '../components/ModeSwitcher'
import { useAdminMode } from '../contexts/AdminModeContext'
import { db } from '../lib/firebase'
import { listOrdersForShop } from '../lib/orderService'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-semibold transition-all sm:gap-2 sm:px-3 ${
    isActive
      ? 'bg-emerald-600/90 text-white shadow-sm'
      : 'text-slate-600 hover:bg-white/70'
  }`

export function ShopShell() {
  const { profile } = useAuth()
  const { shopView } = useAdminMode()
  const displayShopName = profile?.isAdmin ? shopView : (profile?.shopName ?? 'Shop')
  const [awaitingCount, setAwaitingCount] = useState(0)

  useEffect(() => {
    const shopName = profile?.isAdmin ? shopView : profile?.shopName
    if (!db || !shopName) return
    listOrdersForShop(db, shopName).then(orders => {
      const count = orders.filter(o =>
        o.status === 'pending' &&
        (o.dispatches ?? []).some(d => d.items.some(it => !it.confirmedAt))
      ).length
      setAwaitingCount(count)
    }).catch(() => {})
  }, [profile?.shopName, profile?.isAdmin, shopView])
  const nav = useNavigate()
  const { status, toast, dismissToast, enable } = useNotifications()
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-900 transition-colors">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
        {profile?.isAdmin && <ModeSwitcher />}
        {/* Row 1: identity + sign out */}
        <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-3 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Shop console
            </p>
            <p className="truncate font-display text-lg font-semibold leading-tight text-slate-900">
              {displayShopName}
            </p>
            <p className="truncate text-xs text-slate-500">{profile?.displayName}</p>
          </div>

          {/* Seva logo — absolutely centred so it's unaffected by unequal side widths */}
          <img
            src="/seva-logo.png"
            alt="Seva"
            className="absolute left-1/2 top-1/2 h-9 w-auto -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          />

          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              {status === 'unknown' && (
                <Button variant="secondary" className="shrink-0 !gap-1.5" onClick={() => void enable()}>
                  <Bell className="h-4 w-4" />
                  <span className="hidden sm:inline">Enable notifications</span>
                </Button>
              )}
              {status === 'denied' && (
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <BellOff className="h-4 w-4" />
                  <span className="hidden sm:inline">Notifications blocked</span>
                </span>
              )}
              <Button
                variant="secondary"
                className="shrink-0"
                onClick={() => setIsDrawerOpen(true)}
              >
                <User className="h-4 w-4" />
                Profile
              </Button>
            </div>
            {profile?.isAdmin && (
              <Button variant="secondary" className="shrink-0 !text-xs !py-1" onClick={() => nav('/admin')}>
                <Shield className="h-3.5 w-3.5" />
                Admin
              </Button>
            )}
          </div>
        </div>

        {/* Row 2: nav pill */}
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
          <nav
            aria-label="Main navigation"
            className="inline-flex gap-0.5 rounded-2xl border border-white/50 bg-white/50 p-1 shadow-md shadow-slate-900/8 backdrop-blur-xl sm:gap-1 sm:p-1.5"
          >
            <NavLink className={linkClass} to="/shop/dashboard">
              <LayoutDashboard className="h-4 w-4 shrink-0" />
              <span className="sm:hidden">Dash</span>
              <span className="hidden sm:inline">Dashboard</span>
            </NavLink>
            <NavLink className={linkClass} to="/shop/available">
              <LayoutGrid className="h-4 w-4 shrink-0" />
              <span className="sm:hidden">Available</span>
              <span className="hidden sm:inline">Available products</span>
            </NavLink>
            <NavLink className={linkClass} to="/shop/new-order">
              <PackagePlus className="h-4 w-4 shrink-0" />
              <span className="sm:hidden">Order</span>
              <span className="hidden sm:inline">New order</span>
            </NavLink>
            <NavLink className={linkClass} to="/shop/history">
              <ScrollText className="h-4 w-4 shrink-0" />
              <span className="sm:hidden">History</span>
              <span className="hidden sm:inline">Order history</span>
              {awaitingCount > 0 && (
                <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-xs font-bold leading-none text-white">
                  {awaitingCount}
                </span>
              )}
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>

      {/* Foreground notification toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2">
          <div className="flex items-start gap-3 rounded-2xl bg-slate-900 px-4 py-3 shadow-xl">
            <Bell className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <div>
              <p className="text-sm font-semibold text-white">{toast.title}</p>
              {toast.body && <p className="text-xs text-slate-400">{toast.body}</p>}
            </div>
            <button
              type="button"
              onClick={dismissToast}
              className="ml-2 shrink-0 text-slate-500 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <UserProfileDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </div>
  )
}