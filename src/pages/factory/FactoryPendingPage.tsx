import { useCallback, useEffect, useMemo, useState } from 'react'
import { db } from '../../lib/firebase'
import { listPendingOrdersForFactory, updateOrderMilestones } from '../../lib/orderService'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import type { Order } from '../../types/models'
import { formatDateTime } from '../../utils/format'

function ymdToMillis(ymd: string) {
  if (!ymd) return null
  const [y, m, d] = ymd.split('-').map((x) => Number(x))
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime()
}

function millisToYmd(ms: number | null | undefined) {
  if (!ms) return ''
  const dt = new Date(ms)
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function FactoryPendingPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [expectedDraft, setExpectedDraft] = useState<Record<string, string>>({})
  const [actualDraft, setActualDraft] = useState<Record<string, string>>({})

  const refresh = useCallback(async () => {
    if (!db) return
    setLoading(true)
    setError(null)
    try {
      setOrders(await listPendingOrdersForFactory(db))
    } catch {
      setError('Could not load pending orders.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void refresh()
    })
  }, [refresh])

  useEffect(() => {
    queueMicrotask(() => {
      setExpectedDraft((prev) => {
        const next = { ...prev }
        for (const o of orders) {
          if (next[o.id] === undefined) next[o.id] = millisToYmd(o.expectedDeliveryDate ?? null)
        }
        return next
      })
      setActualDraft((prev) => {
        const next = { ...prev }
        for (const o of orders) {
          if (next[o.id] === undefined) next[o.id] = millisToYmd(o.actualDeliveryDate ?? null)
        }
        return next
      })
    })
  }, [orders])

  const sorted = useMemo(() => orders, [orders])

  async function patch(order: Order, patch: Parameters<typeof updateOrderMilestones>[2]) {
    if (!db) return
    setBusyId(order.id)
    setError(null)
    try {
      await updateOrderMilestones(db, order.id, patch)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            Pending orders
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Track each order from receipt through dispatch, set an expected delivery date, and close
            the loop when the shipment lands.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void refresh()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
          Loading…
        </div>
      ) : sorted.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">No pending orders. Nice and quiet.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {sorted.map((o) => {
            const busy = busyId === o.id
            return (
              <Card key={o.id} className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-display text-lg font-semibold text-slate-900">{o.shopName}</p>
                      <Badge tone="neutral">{o.orderKind === 'limited' ? 'Limited' : 'Standard'}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDateTime(o.createdAt)} · {o.items.length} lines · {o.requestorName} ·{' '}
                      {o.requestorEmail}
                    </p>
                  </div>
                  <Badge tone="warning">Pending</Badge>
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Received
                    </p>
                    <p className="mt-2 text-sm text-slate-800">
                      {o.milestones.receivedAt ? formatDateTime(o.milestones.receivedAt) : 'Not marked'}
                    </p>
                    <Button
                      className="mt-3 w-full"
                      variant="secondary"
                      disabled={busy || Boolean(o.milestones.receivedAt)}
                      onClick={() =>
                        void patch(o, { milestones: { receivedAt: Date.now() } })
                      }
                    >
                      Mark received
                    </Button>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Dispatched
                    </p>
                    <p className="mt-2 text-sm text-slate-800">
                      {o.milestones.dispatchedAt ? formatDateTime(o.milestones.dispatchedAt) : 'Not marked'}
                    </p>
                    <Button
                      className="mt-3 w-full"
                      variant="secondary"
                      disabled={busy || Boolean(o.milestones.dispatchedAt)}
                      onClick={() =>
                        void patch(o, { milestones: { dispatchedAt: Date.now() } })
                      }
                    >
                      Mark dispatched
                    </Button>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Expected delivery
                    </p>
                    <Input
                      className="mt-2"
                      type="date"
                      value={expectedDraft[o.id] ?? ''}
                      onChange={(e) =>
                        setExpectedDraft((prev) => ({ ...prev, [o.id]: e.target.value }))
                      }
                      disabled={busy}
                    />
                    <Button
                      className="mt-3 w-full"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        const ms = ymdToMillis(expectedDraft[o.id] ?? '')
                        void patch(o, { expectedDeliveryDate: ms })
                      }}
                    >
                      Save expected date
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="min-w-[220px] flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Complete order
                    </p>
                    <Input
                      className="mt-2"
                      type="date"
                      value={actualDraft[o.id] ?? ''}
                      onChange={(e) =>
                        setActualDraft((prev) => ({ ...prev, [o.id]: e.target.value }))
                      }
                      disabled={busy}
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      Set the actual delivery date, then mark completed.
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    className="bg-slate-900 hover:bg-slate-800"
                    disabled={busy}
                    onClick={() => {
                      const ms = ymdToMillis(actualDraft[o.id] ?? '')
                      if (!ms) {
                        setError('Pick an actual delivery date before completing.')
                        return
                      }
                      void patch(o, { status: 'completed', actualDeliveryDate: ms })
                    }}
                  >
                    Mark completed
                  </Button>
                </div>

                <details className="rounded-xl border border-slate-100 bg-slate-50">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">
                    Line items
                  </summary>
                  <ul className="divide-y divide-slate-200 px-4 pb-3">
                    {o.items.map((it, idx) => (
                      <li key={`${it.productId}-${idx}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <span className="min-w-0 truncate text-slate-900">{it.name}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                          ×{it.quantity}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
