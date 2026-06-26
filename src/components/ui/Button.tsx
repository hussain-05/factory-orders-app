import type { ButtonHTMLAttributes, ReactNode } from 'react'

const variants = {
  primary:
    'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-600/20 dark:bg-emerald-500 dark:hover:bg-emerald-600',
  secondary:
    'bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-700',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm dark:bg-rose-500 dark:hover:bg-rose-600',
} as const

type Variant = keyof typeof variants

import { triggerHaptic } from '../../utils/haptic'

export function Button({
  variant = 'primary',
  className = '',
  children,
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  children: ReactNode
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]'
  
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    triggerHaptic('light')
    if (onClick) {
      onClick(e)
    }
  }

  return (
    <button
      type="button"
      className={`${base} ${variants[variant]} ${className}`}
      onClick={handleClick}
      {...props}
    >
      {children}
    </button>
  )
}