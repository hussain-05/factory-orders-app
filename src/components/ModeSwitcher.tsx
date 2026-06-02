import { useNavigate } from 'react-router-dom'
import { useAdminMode } from '../contexts/AdminModeContext'

export function ModeSwitcher() {
  const { mode, shopView, shops, setMode, setShopView } = useAdminMode()
  const nav = useNavigate()

  const switchTo = (next: 'factory' | 'shop') => {
    setMode(next)
    nav(next === 'factory' ? '/factory/dashboard' : '/shop/dashboard')
  }

  return (
    <div className="border-b border-slate-100 bg-slate-900/95">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-1.5 sm:px-6">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          View
        </span>
        <div className="flex rounded-lg bg-slate-800 p-0.5">
          {(['factory', 'shop'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => switchTo(m)}
              className={`rounded-md px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                mode === m
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {mode === 'shop' && (
          <select
            value={shopView}
            onChange={e => setShopView(e.target.value as typeof shopView)}
            className="ml-1 rounded-lg bg-slate-800 px-2 py-1 text-xs font-medium text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-500"
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