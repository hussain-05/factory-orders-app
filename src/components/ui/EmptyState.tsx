import { motion } from 'framer-motion'
import { Button } from './Button'

type EmptyStateVariant = 'inbox' | 'search' | 'warehouse'

interface EmptyStateProps {
  title: string
  description: string
  variant?: EmptyStateVariant
  actionLabel?: string
  onAction?: () => void
  className?: string
}

export function EmptyState({
  title,
  description,
  variant = 'warehouse',
  actionLabel,
  onAction,
  className = '',
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={`flex flex-col items-center justify-center px-4 py-16 text-center ${className}`}
    >
      {/* Icon/Illustration Container with glass-morphic ring and pulsing glow */}
      <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-slate-50 dark:bg-slate-900/50 ring-1 ring-slate-200/50 dark:ring-slate-800/30 transition-all duration-300">
        <div className="absolute inset-0 -z-10 rounded-3xl bg-emerald-500/5 dark:bg-emerald-500/3 blur-xl animate-pulse" />
        
        {variant === 'inbox' && (
          <svg
            className="h-12 w-12 text-slate-400 dark:text-slate-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 12h-6l-2 3h-4l-2-3H2" />
            <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
          </svg>
        )}

        {variant === 'search' && (
          <svg
            className="h-12 w-12 text-slate-400 dark:text-slate-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
            <path strokeDasharray="3 3" d="M8 11h6" />
          </svg>
        )}

        {variant === 'warehouse' && (
          <svg
            className="h-12 w-12 text-slate-400 dark:text-slate-500"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
            <path d="M3.3 7 12 12l8.7-5" />
            <path d="M12 22V12" />
          </svg>
        )}
      </div>

      <h3 className="font-display text-base font-semibold text-slate-800 dark:text-slate-200 transition-colors duration-200">
        {title}
      </h3>
      <p className="mt-2 max-w-xs text-sm text-slate-500 dark:text-slate-400 transition-colors duration-200">
        {description}
      </p>

      {actionLabel && onAction && (
        <motion.div
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="mt-6"
        >
          <Button variant="secondary" onClick={onAction}>
            {actionLabel}
          </Button>
        </motion.div>
      )}
    </motion.div>
  )
}
