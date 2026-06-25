import { AlertTriangle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { MissingFirebase } from '../MissingFirebase'
import type { ShopName, UserRole } from '../../types/models'

const shops: ShopName[] = ['Seva', 'Seva Mart', 'Seva Super Store']

export function SignUpPage() {
  const { firebaseReady, loading, user, profile, signUpEmail, error } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('shop')
  const [shopName, setShopName] = useState<ShopName>('Seva')
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const title = useMemo(() => (role === 'factory' ? 'Factory access' : role === 'factory_staff' ? 'Factory Staff access' : 'Shop access'), [role])

  if (!firebaseReady) return <MissingFirebase />
  if (!loading && user && profile) {
    const dest = profile.isAdmin
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
      await signUpEmail({
        email,
        password,
        displayName,
        role,
        shopName: role === 'shop' ? shopName : undefined,
        whatsappNumber: whatsappNumber.trim() || undefined,
      })
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Sign-up failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh bg-slate-50 dark:bg-slate-950 transition-colors duration-200 px-6 py-14">
      <div className="mx-auto w-full max-w-md">
        <Card className="p-8">
          <img
            src="/seva-logo.png"
            alt="Seva"
            className="mb-1 block h-10 w-auto mx-auto"
          />
          <h1 className="mt-2 font-display text-2xl font-semibold text-slate-900 dark:text-slate-100 transition-colors duration-200">Create account</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 transition-colors duration-200">
            Choose whether you are signing up as a agent or a factory agent.
          </p>

          <form className="mt-8 space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200" htmlFor="role">
                Role
              </label>
              <Select
                id="role"
                className="mt-1"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
              >
                <option value="shop">Shopkeeper</option>
                <option value="factory">Factory Owner</option>
                <option value="factory_staff">Factory Staff</option>
              </Select>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">{title}</p>
            </div>

            {role === 'shop' ? (
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200" htmlFor="shop">
                  Shop
                </label>
                <Select
                  id="shop"
                  className="mt-1"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value as ShopName)}
                >
                  {shops.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200" htmlFor="name">
                Full name
              </label>
              <Input
                id="name"
                className="mt-1"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200" htmlFor="email">
                Email
              </label>
              <Input
                id="email"
                className="mt-1"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">Minimum 8 characters.</p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200" htmlFor="whatsapp">
                WhatsApp number <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <Input
                id="whatsapp"
                className="mt-1"
                type="tel"
                placeholder="e.g. 9876543210"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                autoComplete="tel"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">Used to receive order updates on WhatsApp.</p>
            </div>

            {(localError || error) && (
              <div className="flex items-start gap-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 px-4 py-3 ring-1 ring-rose-200 dark:ring-rose-800/50">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <p className="text-sm text-rose-800 dark:text-rose-300">{localError || error}
              </p>
        </div>
            )}

            <Button className="w-full" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create account'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400 transition-colors duration-200">
            Already have access?{' '}
            <Link className="font-semibold text-emerald-700 hover:text-emerald-800" to="/login">
              Sign in
            </Link>
          </p>
        </Card>
      </div>
    </div>
  )
}