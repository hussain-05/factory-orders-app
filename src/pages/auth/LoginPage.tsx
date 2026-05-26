import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
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
        : profile.role === 'factory'
          ? '/factory/pending'
          : '/shop/available'
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
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-200/90">
            Seva supply chain
          </p>
          <h1 className="mt-4 font-display text-4xl font-semibold leading-tight tracking-tight">
            Factory Orders
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-200/80">
            A focused workspace for shopkeepers placing frequent catalogue orders and for factory
            teams managing limited-stock items, milestones, and deliveries.
          </p>
        </div>

        <div className="flex items-center justify-center px-6 py-14">
          <Card className="w-full max-w-md border-white/10 bg-white/95 p-8 shadow-2xl shadow-emerald-900/20 backdrop-blur">
            <div className="lg:hidden">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                Seva
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-slate-900">Sign in</h2>
            </div>
            <div className="hidden lg:block">
              <h2 className="font-display text-2xl font-semibold text-slate-900">Sign in</h2>
              <p className="mt-2 text-sm text-slate-600">Use the account created for your shop or factory role.</p>
            </div>

            <form className="mt-8 space-y-4" onSubmit={onSubmit}>
              <div>
                <label className="text-xs font-semibold text-slate-700" htmlFor="email">
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
                <label className="text-xs font-semibold text-slate-700" htmlFor="password">
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
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
                  {localError || error}
                </p>
              )}

              <Button className="w-full" type="submit" disabled={busy}>
                {busy ? 'Signing in…' : 'Continue'}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-600">
              New here?{' '}
              <Link className="font-semibold text-emerald-700 hover:text-emerald-800" to="/signup">
                Create an account
              </Link>
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}