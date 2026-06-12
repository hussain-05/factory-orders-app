import type { InputHTMLAttributes } from 'react'

export function Input({ className = '', onClick, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-slate-200 dark:border-slate-800/50 bg-white dark:bg-slate-900 transition-colors duration-200 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 ${className}`}
      onClick={(e) => {
        if (props.type === 'date') {
          try {
            ;(e.target as HTMLInputElement).showPicker?.()
          } catch { /* ignore unsupported browser error */ }
        }
        onClick?.(e)
      }}
    />
  )
}