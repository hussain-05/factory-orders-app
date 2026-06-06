import { Shield, Trash2, UserCheck, UserX } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { db } from '../../lib/firebase'
import {
  addAllowedEmail,
  getFactoryWhatsappNumber,
  listAllowedEmails,
  removeAllowedEmail,
  setAdminStatus,
  setFactoryWhatsappNumber,
  type AllowedEmail,
} from '../../lib/adminService'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'

export function AdminPage() {
  const [emails, setEmails] = useState<AllowedEmail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [newIsAdmin, setNewIsAdmin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [factoryNumber, setFactoryNumber] = useState('')
  const [numberSaved, setNumberSaved] = useState(false)

  const refresh = useCallback(async () => {
    if (!db) return
    setLoading(true)
    setError(null)
    try {
      const [emailList, factNum] = await Promise.all([
        listAllowedEmails(db),
        getFactoryWhatsappNumber(db),
      ])
      setEmails(emailList)
      setFactoryNumber(factNum)
    } catch {
      setError('Could not load settings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => void refresh())
  }, [refresh])

  async function handleAdd() {
    if (!db || !newEmail.trim()) return
    setBusy(true)
    setError(null)
    try {
      await addAllowedEmail(db, newEmail.trim(), newIsAdmin)
      setNewEmail('')
      setNewIsAdmin(false)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add email.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(email: string) {
    if (!db) return
    setBusy(true)
    setError(null)
    try {
      await removeAllowedEmail(db, email)
      setConfirmDelete(null)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove email.')
    } finally {
      setBusy(false)
    }
  }

  async function handleToggleAdmin(email: string, current: boolean) {
    if (!db) return
    setBusy(true)
    setError(null)
    try {
      await setAdminStatus(db, email, !current)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update admin status.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-slate-700 dark:text-slate-300" />
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            User access
          </h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Only emails listed here can sign up. Admins can manage this list.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      {/* Factory WhatsApp number */}
      <Card>
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">Factory WhatsApp number</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Shop users will see a "Notify factory" button after placing an order, which opens WhatsApp with this number pre-filled.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <Input
            className="flex-1"
            type="tel"
            placeholder="e.g. 9876543210"
            value={factoryNumber}
            onChange={(e) => { setFactoryNumber(e.target.value); setNumberSaved(false) }}
            disabled={busy}
          />
          <Button
            variant="secondary"
            disabled={busy || !factoryNumber.trim()}
            onClick={async () => {
              if (!db) return
              setBusy(true)
              setError(null)
              try {
                await setFactoryWhatsappNumber(db, factoryNumber)
                setNumberSaved(true)
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not save number.')
              } finally {
                setBusy(false)
              }
            }}
          >
            {numberSaved ? '✓ Saved' : 'Save'}
          </Button>
        </div>
      </Card>

      {/* Add new email */}
      <Card>
        <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">Add email</h2>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Email address</label>
            <Input
              className="mt-1"
              type="email"
              placeholder="user@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd() }}
              disabled={busy}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-3">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only"
                checked={newIsAdmin}
                onChange={(e) => setNewIsAdmin(e.target.checked)}
                disabled={busy}
              />
              <div
                className={`h-5 w-5 rounded border-2 transition-colors ${
                  newIsAdmin
                    ? 'border-emerald-600 bg-emerald-600 dark:border-emerald-500 dark:bg-emerald-500'
                    : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'
                }`}
              >
                {newIsAdmin && (
                  <svg className="h-full w-full text-white p-0.5" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Admin access</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Can manage this user list</p>
            </div>
          </label>
          <Button
            onClick={() => void handleAdd()}
            disabled={busy || !newEmail.trim()}
            className="w-full"
          >
            {busy ? 'Adding…' : 'Add to allowlist'}
          </Button>
        </div>
      </Card>

      {/* Existing emails */}
      <Card className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/50 px-5 py-4">
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
            Allowed users
          </h2>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
              {emails.length}
            </span>
            <Button variant="secondary" onClick={() => void refresh()} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 px-5 py-10 text-sm text-slate-500 dark:text-slate-400">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            Loading…
          </div>
        ) : emails.length === 0 ? (
          <p className="px-5 py-10 text-sm text-slate-500 dark:text-slate-400">No emails added yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800/50">
            {emails.map((e) => (
              <li key={e.email} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{e.email}</p>
                  {e.isAdmin && (
                    <Badge tone="neutral">Admin</Badge>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    title={e.isAdmin ? 'Remove admin' : 'Make admin'}
                    disabled={busy}
                    onClick={() => void handleToggleAdmin(e.email, e.isAdmin)}
                    className={`rounded-lg p-2 transition-colors ${
                      e.isAdmin
                        ? 'text-emerald-600 dark:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                        : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    {e.isAdmin ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                  </button>

                  {confirmDelete === e.email ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="danger"
                        className="!py-1 !px-2 !text-xs"
                        disabled={busy}
                        onClick={() => void handleRemove(e.email)}
                      >
                        {busy ? '…' : 'Confirm'}
                      </Button>
                      <Button
                        variant="secondary"
                        className="!py-1 !px-2 !text-xs"
                        onClick={() => setConfirmDelete(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      title="Remove"
                      disabled={busy}
                      onClick={() => setConfirmDelete(e.email)}
                      className="rounded-lg p-2 text-slate-400 dark:text-slate-500 transition-colors hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}