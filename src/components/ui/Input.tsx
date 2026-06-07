import type { InputHTMLAttributes } from 'react'

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-slate-200 dark:border-slate-800/50 bg-white dark:bg-slate-900 transition-all duration-150 px-3 py-2.5 text-base sm:text-sm text-slate-900 dark:text-slate-100 shadow-sm outline-none placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 ${className}`}
      {...props}
    />
  )
}