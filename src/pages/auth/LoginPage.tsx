import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { motion } from 'framer-motion'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { MissingFirebase } from '../MissingFirebase'

export function LoginPage() {
  const { firebaseReady, loading, user, profile, signInEmail, error } = useAuth()
  const loc = useLocation() as { state?: { from?: string } }
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!firebaseReady) return <MissingFirebase />
  if (!loading && user && profile) {
    const dest =
      loc.state?.from && loc.state.from !== '/login'
        ? loc.state.from
        : profile.isAdmin
          ? (profile.role === 'shop' ? '/shop/dashboard' : '/factory/dashboard')
          : profile.role === 'factory'
            ? '/factory/dashboard'
            : profile.role === 'factory_staff'
              ? '/factory/pending'
              : '/shop/dashboard'
    return <Navigate to={dest} replace />
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLocalError(null)
    setBusy(true)
    try {
      await signInEmail(email, password)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-500/25 via-slate-950 to-slate-950" />
      <div className="relative mx-auto grid min-h-dvh max-w-6xl grid-cols-1 lg:grid-cols-2">
        <div className="hidden flex-col justify-end px-10 pb-16 pt-10 text-white lg:flex">
          <img
            src="/seva-logo.png"
            alt="Seva"
            className="mb-6 h-14 w-auto self-center"
          />
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300/80">
            Seva Supply Chain
          </p>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-tight tracking-tight">
            Order smarter.<br />Deliver faster.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-300/70">
            A focused workspace where shopkeepers place catalogue orders in seconds and factory teams manage production, dispatches, and deliveries — all in one place.
          </p>
        </div>

        <div className="flex items-center justify-center px-6 py-14">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            className="w-full max-w-md"
          >
            <Card className="w-full border-white/10 dark:border-slate-800/50 bg-white/95 dark:bg-slate-900/95 transition-colors duration-200 p-8 shadow-2xl shadow-emerald-900/20 dark:shadow-none backdrop-blur">
            <div className="lg:hidden">
              <img
                src="/seva-logo.png"
                alt="Seva"
                className="mb-3 block h-10 w-auto mx-auto"
              />
              <h2 className="mt-2 font-display text-2xl font-semibold text-slate-900 dark:text-slate-100 transition-colors duration-200">Sign in</h2>
            </div>
            <div className="hidden lg:block">
              <h2 className="font-display text-2xl font-semibold text-slate-900 dark:text-slate-100 transition-colors duration-200">Sign in</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 transition-colors duration-200">Use the account created for your shop or factory role.</p>
            </div>

            <form className="mt-8 space-y-4" onSubmit={onSubmit}>
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200" htmlFor="email">
                  Email
                </label>
                <Input
                  id="email"
                  className="mt-1"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200" htmlFor="password">
                  Password
                </label>
                <Input
                  id="password"
                  className="mt-1"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  required
                />
              </div>

              {(localError || error) && (
                <div className="flex items-start gap-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 px-4 py-3 ring-1 ring-rose-200 dark:ring-rose-800/50">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <p className="text-sm text-rose-800 dark:text-rose-300">{localError || error}
                </p>
        </div>
              )}

              <Button className="w-full" type="submit" disabled={busy} title="Sign in to your account">
                {busy ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                    </svg>
                    Signing in…
                  </span>
                ) : 'Continue'}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400 transition-colors duration-200">
              New here?{' '}
              <Link className="font-semibold text-emerald-700 hover:text-emerald-800" to="/signup">
                Create an account
              </Link>
            </p>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  )
}