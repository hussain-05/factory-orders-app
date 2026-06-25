import { useId } from 'react'
import { motion } from 'framer-motion'

export function ThemeToggleIcon({
  theme,
  className = 'h-4 w-4',
}: {
  theme: 'light' | 'dark'
  className?: string
}) {
  const isDark = theme === 'dark'
  const maskId = useId()

  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      animate={{ rotate: isDark ? 40 : 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 15 }}
    >
      <mask id={maskId}>
        <rect x="0" y="0" width="24" height="24" fill="white" />
        <motion.circle
          fill="black"
          r="8"
          animate={{
            cx: isDark ? 17 : 25,
            cy: isDark ? 7 : -5,
          }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        />
      </mask>

      <motion.circle
        cx="12"
        cy="12"
        fill="currentColor"
        mask={`url(#${maskId})`}
        animate={{
          r: isDark ? 9 : 5,
        }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
      />

      <motion.g
        stroke="currentColor"
        animate={{
          opacity: isDark ? 0 : 1,
          scale: isDark ? 0.5 : 1,
        }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        style={{ transformOrigin: 'center' }}
      >
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="4.22" x2="19.78" y2="5.64" />
      </motion.g>
    </motion.svg>
  )
}
