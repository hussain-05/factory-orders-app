import { LayoutDashboard, LayoutGrid, PackagePlus, ScrollText, User } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { UserProfileDrawer } from '../components/UserProfileDrawer'
import { Button } from '../components/ui/Button'
import { ModeSwitcher } from '../components/ModeSwitcher'
import { useAdminMode } from '../contexts/AdminModeContext'
import { OrderDraftProvider } from '../contexts/OrderDraftContext'
import { useTheme } from '../hooks/useTheme'
import { db } from '../lib/firebase'
import { subscribeOrdersForShop } from '../lib/orderService'
import type { ShopName } from '../types/models'
import { ThemeToggleIcon } from '../components/ThemeToggleIcon'
import { ConnectionStatus } from '../components/ConnectionStatus'
import { motion, AnimatePresence } from 'framer-motion'
import { useOfflineSync } from '../hooks/useOfflineSync'
import { subscribeUnlimitedProducts, subscribeLimitedProducts } from '../lib/productService'

// Base class — background on active is provided by the sliding motion.div pill
const linkClass = ({ isActive }: { isActive: boolean }) =>
  `relative flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-semibold transition-colors sm:gap-2 sm:px-3 ${
    isActive
      ? 'text-white'
      : 'text-slate-600 hover:bg-white/70 dark:text-slate-400 dark:hover:bg-slate-800/50'
  }`

export function ShopShell() {
  const { profile } = useAuth()
  const { shopView, shops, setShopView } = useAdminMode()
  const displayShopName = shopView
  const [awaitingCount, setAwaitingCount] = useState(0)
  const { theme, toggleTheme } = useTheme()
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const { toastMessage } = useOfflineSync()

  useEffect(() => {
    if (!db || !shopView) return
    const unsub = subscribeOrdersForShop(
      db,
      shopView,
      (orders) => {
        const count = orders.filter(o =>
          o.status === 'pending' &&
          (o.dispatches ?? []).some(d => d.items.some(it => !it.confirmedAt))
        ).length
        setAwaitingCount(count)
      },
      () => {
        setAwaitingCount(0)
      }
    )
    return unsub
  }, [shopView])

  // Sync PWA home screen application badge with awaiting confirmation count
  useEffect(() => {
    if ('setAppBadge' in navigator) {
      if (awaitingCount > 0) {
        navigator.setAppBadge(awaitingCount).catch(() => {})
      } else {
        navigator.clearAppBadge().catch(() => {})
      }
    }
  }, [awaitingCount])

  // Eagerly pre-cache product catalogs in Firestore's persistent cache for offline usage
  useEffect(() => {
    if (!db) return
    const unsubUnlimited = subscribeUnlimitedProducts(
      db,
      () => {},
      () => {}
    )
    const unsubLimited = subscribeLimitedProducts(
      db,
      () => {},
      () => {}
    )
    return () => {
      unsubUnlimited()
      unsubLimited()
    }
  }, [])

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl transition-colors duration-200">
        {profile?.isAdmin && <ModeSwitcher />}

        {/* Row 1: identity + actions */}
        <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-3 sm:px-6">
          {/* Left column: identity */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-500">
              Seva · Shop
            </p>
            {shops.length > 1 && !profile?.isAdmin ? (
              <div className="relative mt-0.5 flex items-center gap-1.5">
                <select
                  value={shopView}
                  onChange={e => setShopView(e.target.value as ShopName)}
                  className="max-w-[140px] sm:max-w-none rounded-lg border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 px-2 py-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors duration-200"
                >
                  {shops.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="truncate font-display text-lg font-semibold leading-tight text-slate-900 dark:text-slate-100 transition-colors duration-200">
                {displayShopName}
              </p>
            )}
            <p className="truncate text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">{profile?.displayName}</p>
          </div>

          {/* Middle column: Seva logo */}
          <div className="shrink-0 flex items-center justify-center px-1">
            <img
              src="/seva-logo.png"
              alt="Seva"
              className="h-8 sm:h-9 w-auto pointer-events-none"
            />
          </div>

          {/* Right column: actions */}
          <div className="flex items-center justify-end gap-1.5 sm:gap-2 flex-1 min-w-0">
            <ConnectionStatus />
            <Button
              variant="secondary"
              className="shrink-0 !p-2.5 !rounded-full"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              <ThemeToggleIcon theme={theme} className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              className="shrink-0 !p-2.5 sm:!px-4 sm:!py-2.5 !rounded-full sm:!rounded-lg"
              onClick={() => setIsDrawerOpen(true)}
            >
              <User className="h-4 w-4" aria-label="Profile" />
              <span className="hidden sm:inline">Profile</span>
            </Button>
          </div>
        </div>

        {/* Row 2: nav pill */}
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
          <nav
            aria-label="Main navigation"
            className="inline-flex gap-0.5 rounded-2xl border border-white/50 dark:border-slate-800/50 bg-white/50 dark:bg-slate-900/50 p-1 shadow-md shadow-slate-900/8 dark:shadow-none backdrop-blur-xl sm:gap-1 sm:p-1.5 transition-colors duration-200"
          >
            <NavLink className={linkClass} to="/shop/dashboard">
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.div
                      layoutId="shop-nav-pill"
                      className="absolute inset-0 rounded-xl bg-emerald-600/90 shadow-sm dark:bg-emerald-700/90"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    />
                  )}
                  <LayoutDashboard className="relative h-4 w-4 shrink-0" />
                  <span className="relative sm:hidden">Dash</span>
                  <span className="relative hidden sm:inline">Dashboard</span>
                </>
              )}
            </NavLink>
            <NavLink className={linkClass} to="/shop/available">
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.div
                      layoutId="shop-nav-pill"
                      className="absolute inset-0 rounded-xl bg-emerald-600/90 shadow-sm dark:bg-emerald-700/90"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    />
                  )}
                  <LayoutGrid className="relative h-4 w-4 shrink-0" />
                  <span className="relative sm:hidden">Stock</span>
                  <span className="relative hidden sm:inline">Available products</span>
                </>
              )}
            </NavLink>
            <NavLink className={linkClass} to="/shop/new-order">
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.div
                      layoutId="shop-nav-pill"
                      className="absolute inset-0 rounded-xl bg-emerald-600/90 shadow-sm dark:bg-emerald-700/90"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    />
                  )}
                  <PackagePlus className="relative h-4 w-4 shrink-0" />
                  <span className="relative sm:hidden">Order</span>
                  <span className="relative hidden sm:inline">New order</span>
                </>
              )}
            </NavLink>
            <NavLink className={linkClass} to="/shop/history">
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.div
                      layoutId="shop-nav-pill"
                      className="absolute inset-0 rounded-xl bg-emerald-600/90 shadow-sm dark:bg-emerald-700/90"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    />
                  )}
                  <ScrollText className="relative h-4 w-4 shrink-0" />
                  <span className="relative sm:hidden">History</span>
                  <span className="relative hidden sm:inline">Order history</span>
                  {awaitingCount > 0 && (
                    <span className="relative animate-pulse rounded-full bg-rose-500 px-1.5 py-0.5 text-xs font-bold leading-none text-white">
                      {awaitingCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <OrderDraftProvider key={shopView}>
          <Outlet />
        </OrderDraftProvider>
      </main>



      <UserProfileDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />

      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-50 rounded-xl bg-emerald-600 dark:bg-slate-900 border border-emerald-500/20 dark:border-slate-800 px-5 py-3 shadow-lg shadow-emerald-900/10 text-sm font-semibold text-white transition-colors duration-200"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}