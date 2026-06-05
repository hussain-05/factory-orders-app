import type { ReactNode } from 'react'

export function Card({
  children,
  className = '',
  id,
}: {
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <div
      id={id}
      className={`rounded-2xl border border-slate-200/80 dark:border-slate-800/50 bg-white dark:bg-slate-900 transition-colors duration-200 p-6 shadow-sm shadow-slate-200/40 ${className}`}
    >
      {children}
    </div>
  )
}