import { AlertTriangle, Shield, Trash2, UserCheck, UserX, Users, CheckCircle, Clock, Trash, KeyRound } from 'lucide-react'
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
import { listAllUsers, updateAccessibleShops, deleteUserProfileDoc } from '../../lib/userService'
import type { ShopName, UserProfile } from '../../types/models'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'

const SHOPS: ShopName[] = ['Seva', 'Seva Mart', 'Seva Super Store']

export function AdminPage() {
  const [emails, setEmails] = useState<AllowedEmail[]>([])
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [newIsAdmin, setNewIsAdmin] = useState(false)
  const [newRole, setNewRole] = useState('shop')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<string | null>(null)
  const [deleteWarningUser, setDeleteWarningUser] = useState<string | null>(null)
  const [factoryNumber, setFactoryNumber] = useState('')
  const [numberSaved, setNumberSaved] = useState(false)
  const [activeTab, setActiveTab] = useState<'emails' | 'users'>('emails')
  const [updatingUserUid, setUpdatingUserUid] = useState<string | null>(null)
  const [userSearch, setUserSearch] = useState('')

  const refresh = useCallback(async () => {
    if (!db) return
    setLoading(true)
    setError(null)
    try {
      const [emailList, factNum, userList] = await Promise.all([
        listAllowedEmails(db),
        getFactoryWhatsappNumber(db),
        listAllUsers(db),
      ])
      setEmails(emailList)
      setFactoryNumber(factNum)
      setUsers(userList)
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
      await addAllowedEmail(db, newEmail.trim(), newIsAdmin, newRole)
      setNewEmail('')
      setNewIsAdmin(false)
      setNewRole('shop')
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

  async function handleToggleShopAccess(user: UserProfile, shop: ShopName, enabled: boolean) {
    if (!db) return
    setUpdatingUserUid(user.uid)
    setError(null)
    try {
      const current = user.accessibleShops || []
      let next: ShopName[]
      if (enabled) {
        next = [...new Set([...current, shop])]
      } else {
        next = current.filter(s => s !== shop)
      }
      await updateAccessibleShops(db, user.uid, next)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update accessible shops.')
    } finally {
      setUpdatingUserUid(null)
    }
  }

  async function handleDeleteUser(user: UserProfile) {
    if (!db) return
    setBusy(true)
    setError(null)
    try {
      await deleteUserProfileDoc(db, user.uid)
      await removeAllowedEmail(db, user.email)
      setConfirmDeleteUser(null)
      setDeleteWarningUser(user.email)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete user.')
    } finally {
      setBusy(false)
    }
  }

  const isEmailSignedUp = (email: string) => {
    return users.some(u => u.email.toLowerCase() === email.toLowerCase())
  }

  const filteredUsers = users.filter(u => {
    const query = userSearch.toLowerCase()
    return (
      u.email.toLowerCase().includes(query) ||
      u.displayName.toLowerCase().includes(query)
    )
  })

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-slate-700 dark:text-slate-300" />
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Admin console
          </h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Manage system configurations, user invitations, database profiles, and coverage access.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 px-4 py-3 ring-1 ring-rose-200 dark:ring-rose-800/50">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <p className="text-sm text-rose-800 dark:text-rose-300">{error}</p>
        </div>
      )}

      {deleteWarningUser && (
        <div className="flex flex-col gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 p-4 ring-1 ring-amber-200 dark:ring-amber-800/50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Database Profile Revoked Successfully</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                The database profile for <strong>{deleteWarningUser}</strong> has been deleted, and their email was removed from the allowlist. They can no longer read or write data.
              </p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                <strong>Important Action Required:</strong> Client-side code cannot delete other users from Firebase Authentication. To fully delete their credentials and prevent them from signing in, you must log into the <strong>Firebase Console &gt; Authentication</strong> tab and delete the user matching <strong>{deleteWarningUser}</strong>.
              </p>
            </div>
          </div>
          <div className="mt-2 flex justify-end">
            <Button variant="secondary" className="!py-1 !px-2.5 !text-xs" onClick={() => setDeleteWarningUser(null)}>
              Dismiss
            </Button>
          </div>
        </div>
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

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 transition-colors duration-200">
        <button
          type="button"
          onClick={() => setActiveTab('emails')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-all ${
            activeTab === 'emails'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-500 dark:text-emerald-500'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
          }`}
        >
          <KeyRound className="h-4 w-4" />
          Invites & Allowlist
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-all ${
            activeTab === 'users'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-500 dark:text-emerald-500'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
          }`}
        >
          <Users className="h-4 w-4" />
          Registered Users
          {users.length > 0 && (
            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-xs text-slate-600 dark:text-slate-400">
              {users.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'emails' ? (
        <div className="space-y-6">
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
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Role</label>
                <Select
                  className="mt-1"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  disabled={busy}
                >
                  <option value="shop">Shopkeeper</option>
                  <option value="factory">Factory Owner</option>
                  <option value="factory_staff">Factory Staff</option>
                </Select>
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
                Allowed emails
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
                {emails.map((e) => {
                  const signedUp = isEmailSignedUp(e.email)
                  return (
                    <li key={e.email} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{e.email}</p>
                          {signedUp ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-600/10 dark:ring-emerald-500/20">
                              <CheckCircle className="h-3 w-3" /> Signed Up
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 dark:bg-slate-900/50 px-2.5 py-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400 ring-1 ring-slate-600/10 dark:ring-slate-700/20">
                              <Clock className="h-3 w-3 animate-pulse" /> Pending
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          {e.isAdmin && (
                            <Badge tone="neutral">Admin</Badge>
                          )}
                          {e.role && (
                            <Badge tone="neutral">
                              {e.role === 'factory' ? 'Factory Owner' : e.role === 'factory_staff' ? 'Factory Staff' : 'Shopkeeper'}
                            </Badge>
                          )}
                        </div>
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
                              className="!py-1 !px-2 !text-base sm:!text-xs"
                              disabled={busy}
                              onClick={() => void handleRemove(e.email)}
                            >
                              {busy ? '…' : 'Confirm'}
                            </Button>
                            <Button
                              variant="secondary"
                              className="!py-1 !px-2 !text-base sm:!text-xs"
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
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      ) : (
        <Card className="p-0">
          <div className="flex flex-col gap-3 border-b border-slate-100 dark:border-slate-800/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Registered users
            </h2>
            <div className="flex items-center gap-3">
              <Input
                type="text"
                placeholder="Search name or email..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full sm:w-60"
              />
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
          ) : filteredUsers.length === 0 ? (
            <p className="px-5 py-10 text-sm text-slate-500 dark:text-slate-400">No users found.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {filteredUsers.map((u) => {
                const isShopkeeper = u.role === 'shop'
                const currentCoverage = u.accessibleShops || []

                return (
                  <li key={u.uid} className="flex flex-col gap-4 px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {u.displayName || 'No Name'}
                        </p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {u.email}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          {u.isAdmin && (
                            <Badge tone="neutral">Admin</Badge>
                          )}
                          <Badge tone="neutral">
                            {u.role === 'factory' ? 'Factory Owner' : u.role === 'factory_staff' ? 'Factory Staff' : `Shopkeeper (${u.shopName || 'No Default Shop'})`}
                          </Badge>
                        </div>
                      </div>
                      
                      {/* Delete user button */}
                      <div className="flex shrink-0 items-center gap-2">
                        {confirmDeleteUser === u.uid ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="danger"
                              className="!py-1 !px-2 !text-xs"
                              disabled={busy}
                              onClick={() => void handleDeleteUser(u)}
                            >
                              {busy ? '…' : 'Revoke & Delete'}
                            </Button>
                            <Button
                              variant="secondary"
                              className="!py-1 !px-2 !text-xs"
                              onClick={() => setConfirmDeleteUser(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            title="Delete user profile & revoke database access"
                            disabled={busy}
                            onClick={() => setConfirmDeleteUser(u.uid)}
                            className="rounded-lg p-2 text-slate-400 dark:text-slate-500 transition-colors hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400"
                          >
                            <Trash className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Shopkeeper coverage access editor */}
                    {isShopkeeper && (
                      <div className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-3 transition-colors duration-200">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Shop coverage access
                          </p>
                          {updatingUserUid === u.uid && (
                            <div className="h-3.5 w-3.5 animate-spin rounded-full border border-emerald-600 border-t-transparent" />
                          )}
                        </div>
                        <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2">
                          {SHOPS.map((shop) => {
                            const isDefault = u.shopName === shop
                            const hasAccess = isDefault || currentCoverage.includes(shop)
                            
                            return (
                              <label
                                key={shop}
                                className={`inline-flex items-center gap-2 text-xs font-medium ${
                                  isDefault
                                    ? 'text-slate-400 dark:text-slate-600 cursor-not-allowed'
                                    : 'text-slate-700 dark:text-slate-300 cursor-pointer hover:text-slate-900 dark:hover:text-slate-100'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={hasAccess}
                                  disabled={isDefault || updatingUserUid === u.uid}
                                  onChange={(e) => void handleToggleShopAccess(u, shop, e.target.checked)}
                                  className="rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
                                />
                                {shop} {isDefault && <span className="text-[10px] italic">(Default)</span>}
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      )}
    </div>
  )
}