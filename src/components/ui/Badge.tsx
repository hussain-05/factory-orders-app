import type { ReactNode } from 'react'

const tones = {
  neutral: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:ring-sky-800/60',
  success: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-800/50',
  warning: 'bg-amber-50 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:ring-amber-800/50',
  danger: 'bg-rose-50 text-rose-800 ring-1 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:ring-rose-800/50',
} as const

type Tone = keyof typeof tones

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: Tone
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  )
}