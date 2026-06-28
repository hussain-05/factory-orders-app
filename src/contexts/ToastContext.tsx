import { createContext, useContext, useState, type ReactNode, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { triggerHaptic } from '../utils/haptic'

type ToastType = 'success' | 'error' | 'info'

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [timeoutId, setTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    // Clear any existing timeout
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    setToast({ message, type })

    // Tactile haptic feedback
    if (type === 'success') {
      triggerHaptic('success')
    } else if (type === 'error') {
      triggerHaptic('medium')
    }

    const id = setTimeout(() => {
      setToast(null)
      setTimeoutId(null)
    }, 3000)

    setTimeoutId(id)
  }, [timeoutId])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.95 }}
            className={`fixed top-6 right-6 z-[100] flex items-center gap-2 rounded-xl px-5 py-3 shadow-lg text-sm font-semibold text-white backdrop-blur-sm border ${
              toast.type === 'success'
                ? 'bg-emerald-600 border-emerald-500/20 dark:bg-emerald-950/90 dark:text-emerald-300 dark:border-emerald-800'
                : toast.type === 'error'
                ? 'bg-rose-600 border-rose-500/20 dark:bg-rose-950/90 dark:text-rose-300 dark:border-rose-800'
                : 'bg-slate-800 border-slate-700/20 dark:bg-slate-900/90 dark:text-slate-300 dark:border-slate-800'
            }`}
          >
            {toast.type === 'success' && <span>✓</span>}
            {toast.type === 'error' && <span>⚠</span>}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </ToastContext.Provider>
  )
}
