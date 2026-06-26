import { useLocation, useNavigate } from 'react-router-dom'
import { useAdminMode } from '../contexts/AdminModeContext'
import { motion } from 'framer-motion'

export function ModeSwitcher() {
  const { mode: contextMode, shopView, shops, setMode, setShopView } = useAdminMode()
  const nav = useNavigate()
  const location = useLocation()

  // Use the URL to determine the true active mode, fallback to context mode
  const mode = location.pathname.startsWith('/shop')
    ? 'shop'
    : location.pathname.startsWith('/factory')
      ? 'factory'
      : contextMode

  const switchTo = (next: 'factory' | 'shop') => {
    setMode(next)
    nav(next === 'factory' ? '/factory/dashboard' : '/shop/dashboard')
  }

  return (
    <div className="bg-amber-50/80 dark:bg-amber-900/20 border-b border-amber-200/60 dark:border-amber-800/40">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-1.5 sm:px-6">
        <span className="text-xs font-semibold uppercase tracking-widest text-amber-800 dark:text-amber-300">
          View
        </span>
        <div className="flex rounded-lg bg-amber-200/50 dark:bg-amber-800/50 p-0.5">
          {(['factory', 'shop'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => switchTo(m)}
              className={`relative rounded-md px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                mode === m
                  ? 'text-amber-900 dark:text-amber-100'
                  : 'text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-200'
              }`}
            >
              {mode === m && (
                <motion.div
                  layoutId="mode-pill"
                  className="absolute inset-0 rounded-md bg-white dark:bg-amber-900 shadow-sm"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
              <span className="relative">{m}</span>
            </button>
          ))}
        </div>

        {mode === 'shop' && (
          <select
            value={shopView}
            onChange={e => setShopView(e.target.value as typeof shopView)}
            className="ml-1 rounded-lg bg-amber-100 dark:bg-amber-900/50 border border-amber-200/50 dark:border-amber-800/50 px-2 py-1 text-xs font-medium text-amber-900 dark:text-amber-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            {shops.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}