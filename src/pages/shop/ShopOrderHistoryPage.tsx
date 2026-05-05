import { ChevronDown, ChevronRight, Printer } from 'lucide-react'
import { FirebaseError } from 'firebase/app'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { downloadOrderPdf } from '../../lib/downloadOrderPdf'
import { db } from '../../lib/firebase'
import { listOrdersForShop } from '../../lib/orderService'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import type { Order } from '../../types/models'
import { formatDate, formatDateTime, fulfillmentSummary } from '../../utils/format'

export function ShopOrderHistoryPage() {
  const { user } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!db || !user) return
    setLoading(true)
    setError(null)
    try {
      setOrders(await listOrdersForShop(db, user.uid))
    } catch (e) {
      const msg =
        e instanceof FirebaseError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Could not load orders.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    queueMicrotask(() => {
      void refresh()
    })
  }, [refresh])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            Order history
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Track pending and completed orders, compare expected versus actual delivery, and print an
            A4-ready PDF for your records.
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
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          Loading…
        </div>
      ) : orders.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">No orders yet.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => {
            const open = openId === o.id
            return (
              <Card key={o.id} className="p-0">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                  onClick={() => setOpenId(open ? null : o.id)}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold text-slate-900">
                        {o.orderKind === 'limited' ? 'Limited stock' : 'Standard catalogue'}
                      </p>
                      <Badge tone={o.status === 'completed' ? 'success' : 'warning'}>
                        {o.status === 'completed' ? 'Completed' : 'Pending'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Placed {formatDateTime(o.createdAt)} · {o.items.length} lines
                    </p>
                  </div>
                  {open ? <ChevronDown className="h-5 w-5 shrink-0" /> : <ChevronRight className="h-5 w-5 shrink-0" />}
                </button>

                {open ? (
                  <div className="space-y-4 border-t border-slate-100 px-5 py-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Requestor
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{o.requestorName}</p>
                        <p className="text-xs text-slate-600">{o.requestorEmail}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Delivery
                        </p>
                        <p className="mt-1 text-sm text-slate-900">
                          Expected: <span className="font-semibold">{formatDate(o.expectedDeliveryDate)}</span>
                        </p>
                        <p className="text-sm text-slate-900">
                          Actual: <span className="font-semibold">{formatDate(o.actualDeliveryDate)}</span>
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Lead time
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{fulfillmentSummary(o)}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          setPdfBusyId(o.id)
                          try {
                            await downloadOrderPdf(o)
                          } finally {
                            setPdfBusyId(null)
                          }
                        }}
                        disabled={pdfBusyId === o.id}
                      >
                        <Printer className="h-4 w-4" />
                        {pdfBusyId === o.id ? 'Preparing PDF…' : 'Print / PDF'}
                      </Button>
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lines</p>
                      <ul className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-200">
                        {o.items.map((it, idx) => (
                          <li key={`${it.productId}-${idx}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                            <span className="min-w-0 truncate text-slate-900">{it.name}</span>
                            <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                              ×{it.quantity}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
