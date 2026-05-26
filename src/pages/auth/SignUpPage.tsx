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
  const [localError, setLocalError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const title = useMemo(() => (role === 'factory' ? 'Factory access' : 'Shop access'), [role])

  if (!firebaseReady) return <MissingFirebase />
  if (!loading && user && profile) {
    const dest = profile.role === 'factory' ? '/factory/pending' : '/shop/available'
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
      })
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Sign-up failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-dvh bg-slate-50 px-6 py-14">
      <div className="mx-auto w-full max-w-md">
        <Card className="p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Seva</p>
          <h1 className="mt-2 font-display text-2xl font-semibold text-slate-900">Create account</h1>
          <p className="mt-2 text-sm text-slate-600">
            Choose whether you are signing up as a shop owner or a factory owner.
          </p>

          <form className="mt-8 space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="text-xs font-semibold text-slate-700" htmlFor="role">
                Role
              </label>
              <Select
                id="role"
                className="mt-1"
                value={role}
                onChange={(e) => setRole(e.target.value === 'factory' ? 'factory' : 'shop')}
              >
                <option value="shop">Shop owner</option>
                <option value="factory">Factory owner</option>
              </Select>
              <p className="mt-2 text-xs text-slate-500">{title}</p>
            </div>

            {role === 'shop' ? (
              <div>
                <label className="text-xs font-semibold text-slate-700" htmlFor="shop">
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
              <label className="text-xs font-semibold text-slate-700" htmlFor="name">
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
              <label className="text-xs font-semibold text-slate-700" htmlFor="email">
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
              <label className="text-xs font-semibold text-slate-700" htmlFor="password">
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
              <p className="mt-2 text-xs text-slate-500">Minimum 8 characters.</p>
            </div>

            {(localError || error) && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
                {localError || error}
              </p>
            )}

            <Button className="w-full" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create account'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600">
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