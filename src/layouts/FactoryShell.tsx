import { Bell, BellOff, ClipboardList, LayoutDashboard, Moon, PackagePlus, ScrollText, Sun, User, Warehouse } from 'lucide-react'

import { motion, AnimatePresence } from 'framer-motion'
import { NavLink, Outlet } from 'react-router-dom'
import { UserProfileDrawer } from '../components/UserProfileDrawer'
import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../hooks/useTheme'
import { useNotifications } from '../hooks/useNotifications'
import { Button } from '../components/ui/Button'
import { FactoryDispatchDraftProvider } from '../contexts/FactoryDispatchDraftContext'
import { ModeSwitcher } from '../components/ModeSwitcher'
import { db } from '../lib/firebase'
import { countPendingOrdersForFactory } from '../lib/orderService'

function usePendingOrderCount() {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    if (!db) return
    countPendingOrdersForFactory(db)
      .then((c) => setCount(c))
      .catch(() => setCount(null))
  }, [])
  return count
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm font-semibold transition-all sm:gap-2 sm:px-3 ${
    isActive
      ? 'bg-slate-900/90 text-white shadow-sm dark:bg-slate-800 dark:text-slate-100'
      : 'text-slate-600 hover:bg-white/70 dark:text-slate-400 dark:hover:bg-slate-800/50'
  }`

export function FactoryShell() {
  const { profile } = useAuth()
  const { status, toast, dismissToast, enable } = useNotifications()
  const pendingCount = usePendingOrderCount()
  const { theme, toggleTheme } = useTheme()
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl transition-colors duration-200">
        {profile?.isAdmin && <ModeSwitcher />}

        {/* Row 1: identity + actions */}
        <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-3 sm:px-6">
          {/* Left column: identity */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 dark:text-slate-400">
              Seva · Factory
            </p>
            <p className="truncate font-display text-lg font-semibold leading-tight text-slate-900 dark:text-slate-100">
              Factory
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{profile?.displayName}</p>
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
            {status === 'unknown' && (
              <Button variant="secondary" className="shrink-0 !gap-1.5" onClick={() => void enable()}>
                <Bell className="h-4 w-4" />
                <span className="hidden sm:inline">Enable notifications</span>
              </Button>
            )}
            {status === 'denied' && (
              <span className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 transition-colors duration-200 shrink-0">
                <BellOff className="h-4 w-4" />
                <span className="hidden sm:inline">Notifications blocked</span>
              </span>
            )}
            <Button
              variant="secondary"
              className="shrink-0 !p-2 sm:!px-4 sm:!py-2.5 !rounded-full sm:!rounded-lg"
              onClick={toggleTheme}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Theme</span>
            </Button>
            <Button
              variant="secondary"
              className="shrink-0 !p-2 sm:!px-4 sm:!py-2.5 !rounded-full sm:!rounded-lg"
              onClick={() => setIsDrawerOpen(true)}
            >
              <User className="h-4 w-4" aria-label="Profile" />
              <span className="hidden sm:inline">Profile</span>
            </Button>
          </div>
        </div>

        {/* Row 2: nav pill */}
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
          <div className="overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <nav
            aria-label="Main navigation"
            className="inline-flex min-w-max gap-0.5 rounded-2xl border border-white/50 bg-white/50 p-1 shadow-md shadow-slate-900/8 backdrop-blur-xl transition-colors duration-200 dark:border-slate-800/50 dark:bg-slate-900/50 dark:shadow-none sm:gap-1 sm:p-1.5"
          >
            {profile?.role !== 'factory_staff' && (
              <>
                <NavLink className={linkClass} to="/factory/dashboard">
                  <LayoutDashboard className="h-4 w-4 shrink-0" />
                  <span className="sm:hidden">Dash</span>
                  <span className="hidden sm:inline">Dashboard</span>
                </NavLink>
                <NavLink className={linkClass} to="/factory/products">
                  <Warehouse className="h-4 w-4 shrink-0" />
                  <span className="sm:hidden">Items</span>
                  <span className="hidden sm:inline">Products</span>
                </NavLink>
                <NavLink className={linkClass} to="/factory/create-order">
                  <PackagePlus className="h-4 w-4 shrink-0" />
                  <span className="sm:hidden">Send</span>
                  <span className="hidden sm:inline">Factory dispatch</span>
                </NavLink>
              </>
            )}
            <NavLink className={linkClass} to="/factory/pending" title="Orders awaiting production or dispatch">
              <ClipboardList className="h-4 w-4 shrink-0" />
              <span className="sm:hidden">Pending</span>
              <span className="hidden sm:inline">Pending orders</span>
              {pendingCount != null && pendingCount > 0 && (
                <span className="ml-0.5 animate-pulse rounded-full bg-rose-500 px-1.5 py-0.5 text-xs font-bold leading-none text-white">
                  {pendingCount}
                </span>
              )}
            </NavLink>
            <NavLink className={linkClass} to="/factory/history">
              <ScrollText className="h-4 w-4 shrink-0" />
              <span className="sm:hidden">History</span>
              <span className="hidden sm:inline">Order history</span>
            </NavLink>
          </nav>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <FactoryDispatchDraftProvider>
          <Outlet />
        </FactoryDispatchDraftProvider>
      </main>

      {/* Foreground notification toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.25 }}
            className="fixed bottom-6 left-1/2 z-50 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2"
          >
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
          </motion.div>
        )}
      </AnimatePresence>

      <UserProfileDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </div>
  )
}