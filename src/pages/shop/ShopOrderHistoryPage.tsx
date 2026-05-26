import { ChevronDown, ChevronRight, Printer, Trash2 } from 'lucide-react'
import { FirebaseError } from 'firebase/app'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useAuth } from '../../contexts/AuthContext'
import { previewOrderPdf } from '../../lib/downloadOrderPdf'
import { db } from '../../lib/firebase'
import { deleteOrder, listOrdersForShop } from '../../lib/orderService'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'
import type { Order } from '../../types/models'
import { formatDate, formatDateTime, fulfillmentSummary } from '../../utils/format'

function groupByMonth(orders: Order[]): Array<{ label: string; orders: Order[] }> {
  const map = new Map<string, Order[]>()
  for (const o of orders) {
    const label = o.createdAt ? format(new Date(o.createdAt), 'MMMM yyyy') : 'Unknown'
    if (!map.has(label)) map.set(label, [])
    map.get(label)!.push(o)
  }
  return Array.from(map.entries()).map(([label, orders]) => ({ label, orders }))
}

interface TimelineStage {
  label: string
  sublabel?: string
  ts: number | null | undefined
  done: boolean
}

function OrderTimeline({ order }: { order: Order }) {
  const stages: TimelineStage[] = [
    {
      label: 'Order placed',
      sublabel: order.requestorName,
      ts: order.createdAt,
      done: true,
    },
    {
      label: 'Received by factory',
      ts: order.milestones.receivedAt,
      done: Boolean(order.milestones.receivedAt),
    },
    {
      label: 'Dispatched',
      ts: order.milestones.dispatchedAt,
      done: Boolean(order.milestones.dispatchedAt),
    },
    {
      label: 'Delivered',
      sublabel: order.expectedDeliveryDate
        ? `Expected ${formatDate(order.expectedDeliveryDate)}`
        : undefined,
      ts: order.actualDeliveryDate,
      done: order.status === 'completed',
    },
  ]

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Order progress
      </p>
      <div className="flex flex-col gap-0">
        {stages.map((stage, idx) => {
          const isLast = idx === stages.length - 1
          const nextDone = !isLast && stages[idx + 1].done

          return (
            <div key={stage.label} className="flex gap-3">
              {/* Column: dot + connector line */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    stage.done
                      ? 'border-emerald-500 bg-emerald-500'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {stage.done ? (
                    <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M2 6l3 3 5-5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <div className="h-2 w-2 rounded-full bg-slate-300" />
                  )}
                </div>
                {!isLast && (
                  <div
                    className={`w-0.5 flex-1 my-1 min-h-[20px] ${
                      nextDone ? 'bg-emerald-400' : 'bg-slate-200'
                    }`}
                  />
                )}
              </div>

              {/* Content */}
              <div className={`pb-4 ${isLast ? 'pb-0' : ''}`}>
                <p
                  className={`text-sm font-semibold leading-7 ${
                    stage.done ? 'text-slate-900' : 'text-slate-400'
                  }`}
                >
                  {stage.label}
                </p>
                {stage.done && stage.ts ? (
                  <p className="text-xs text-emerald-600">{formatDateTime(stage.ts)}</p>
                ) : !stage.done ? (
                  <p className="text-xs text-slate-400">Pending</p>
                ) : null}
                {stage.sublabel && !stage.ts ? (
                  <p className="text-xs text-slate-400">{stage.sublabel}</p>
                ) : stage.sublabel && stage.done ? (
                  <p className="text-xs text-slate-500">{stage.sublabel}</p>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ShopOrderHistoryPage() {
  const { user } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

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

  const grouped = useMemo(() => {
    const sorted = [...orders].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    return groupByMonth(sorted)
  }, [orders])

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
      ) : grouped.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">No orders yet.</p>
        </Card>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ label, orders: groupOrders }) => (
            <div key={label}>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400">
                  {label}
                </h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                  {groupOrders.length}
                </span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <div className="space-y-3">
                {groupOrders.map((o) => {
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
                          {/* Timeline */}
                          <OrderTimeline order={o} />

                          {/* Delivery info */}
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

                          {o.status === 'completed' && (
                            <div className="rounded-xl bg-slate-50 p-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Lead time
                              </p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">{fulfillmentSummary(o)}</p>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="secondary"
                              onClick={async () => {
                                setPdfBusyId(o.id)
                                try {
                                  await previewOrderPdf(o)
                                } finally {
                                  setPdfBusyId(null)
                                }
                              }}
                              disabled={pdfBusyId === o.id}
                            >
                              <Printer className="h-4 w-4" />
                              {pdfBusyId === o.id ? 'Preparing PDF…' : 'Print / PDF'}
                            </Button>

                            {o.status === 'pending' && (
                              <Button
                                variant="danger"
                                onClick={() => setDeleteTarget(o)}
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete order
                              </Button>
                            )}
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
            </div>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(deleteTarget)}
        title="Delete order?"
        onClose={() => { if (!deleteBusy) setDeleteTarget(null) }}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              disabled={deleteBusy}
              onClick={() => setDeleteTarget(null)}
            >
              Keep order
            </Button>
            <Button
              variant="danger"
              disabled={deleteBusy}
              onClick={async () => {
                if (!db || !deleteTarget) return
                setDeleteBusy(true)
                setError(null)
                try {
                  await deleteOrder(db, deleteTarget.id)
                  setDeleteTarget(null)
                  if (openId === deleteTarget.id) setOpenId(null)
                  await refresh()
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Could not delete order.')
                  setDeleteTarget(null)
                } finally {
                  setDeleteBusy(false)
                }
              }}
            >
              {deleteBusy ? 'Deleting…' : 'Yes, delete'}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-700">
          This will permanently remove the order placed on{' '}
          <span className="font-semibold">
            {formatDateTime(deleteTarget?.createdAt)}
          </span>{' '}
          with {deleteTarget?.items.length} line{deleteTarget?.items.length === 1 ? '' : 's'}.
        </p>
      </Modal>
    </div>
  )
}