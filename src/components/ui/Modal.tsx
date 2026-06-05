import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './Button'

export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
}: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
  footer?: ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg rounded-t-2xl border border-slate-200 dark:border-slate-800/50 bg-white dark:bg-slate-900 transition-colors duration-200 shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800/50 px-5 py-4 transition-colors duration-200">
          <h2 className="font-display text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100 transition-colors duration-200">{title}</h2>
          <Button variant="ghost" className="!p-2" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="max-h-[min(70vh,720px)] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="border-t border-slate-100 dark:border-slate-800/50 px-5 py-4 transition-colors duration-200">{footer}</div> : null}
      </div>
    </div>
  )
}
