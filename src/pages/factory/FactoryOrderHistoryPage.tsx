import { ChevronDown, ChevronRight, Filter, Printer, Search, Trash2 } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { previewOrderPdf } from '../../lib/downloadOrderPdf'
import { db } from '../../lib/firebase'
import { useAuth } from '../../contexts/AuthContext'
import { listAllOrdersForFactory, deleteOrder } from '../../lib/orderService'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
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
      sublabel: `${order.requestorName} · ${order.shopName}`,
      ts: order.createdAt,
      done: true,
    },
    {
      label: 'Received by factory',
      ts: order.milestones.receivedAt,
      done: Boolean(order.milestones.receivedAt),
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
                {stage.sublabel && (
                  <p className={`text-xs ${stage.done ? 'text-slate-500' : 'text-slate-400'}`}>
                    {stage.sublabel}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function FactoryOrderHistoryPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loc = useLocation() as { state?: { openId?: string } }
  const [openId, setOpenId] = useState<string | null>(loc.state?.openId ?? null)

  useEffect(() => {
    const id = loc.state?.openId
    if (!id || loading) return
    const t = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
    return () => clearTimeout(t)
  }, [loading, loc.state?.openId])
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null)
  const { profile } = useAuth()
  const [filterShop, setFilterShop] = useState<string>('all')
  const [filterRequestor, setFilterRequestor] = useState<string>('all')
  const [filterKind, setFilterKind] = useState<string>('all')
  const [filterStartDate, setFilterStartDate] = useState<string>('')
  const [filterEndDate, setFilterEndDate] = useState<string>('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [orderSearch, setOrderSearch] = useState('')

  const refresh = useCallback(async () => {
    if (!db) return
    setLoading(true)
    setError(null)
    try {
      setOrders(await listAllOrdersForFactory(db))
    } catch {
      setError('Could not load orders.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void refresh()
    })
  }, [refresh])

  const requestorOptions = useMemo(
    () => [...new Set(orders.map(o => o.requestorName).filter(Boolean))].sort(),
    [orders]
  )

  const grouped = useMemo(() => {
    const needle = orderSearch.trim()
    const filtered = orders.filter(o => {
      if (needle && !(o.orderNumber ?? '').includes(needle)) return false
      if (filterShop !== 'all' && o.shopName !== filterShop) return false
      if (filterRequestor !== 'all' && o.requestorName !== filterRequestor) return false
      if (filterKind !== 'all' && o.orderKind !== filterKind) return false
      if (filterStartDate) {
        const [y, m, d] = filterStartDate.split('-').map(Number); const start = new Date(y, m - 1, d, 0, 0, 0, 0).getTime()
        if ((o.createdAt ?? 0) < start) return false
      }

      if (filterEndDate) {
        const [ey, em, ed] = filterEndDate.split('-').map(Number); const end = new Date(ey, em - 1, ed, 23, 59, 59, 999).getTime(); if ((o.createdAt ?? 0) > end) return false
      }
      return true
    })
    const sorted = filtered.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    return groupByMonth(sorted)
  }, [orders, orderSearch, filterShop, filterRequestor, filterKind, filterStartDate, filterEndDate])

  const hasActiveFilters = filterShop !== 'all' || filterRequestor !== 'all' || filterKind !== 'all' || filterStartDate !== '' || filterEndDate !== ''

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            Order history
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Full visibility across shops, with printable PDFs for filing and reconciliation.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void refresh()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {/* ── Search + Filter bar ── */}
      <div className="rounded-xl border-2 border-slate-300 bg-slate-50/80 shadow-sm">
        <div className="flex divide-x divide-slate-200">

          {/* Filter toggle — wider */}
          <button
            type="button"
            onClick={() => setFilterOpen(!filterOpen)}
            className="flex flex-[2] items-center justify-between px-4 py-3 text-left"
          >
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">Filters</span>
              {hasActiveFilters && (
                <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-xs font-semibold text-white leading-none">
                  {[filterShop !== 'all', filterRequestor !== 'all', filterKind !== 'all', filterStartDate !== '', filterEndDate !== ''].filter(Boolean).length}
                </span>
              )}
            </div>
            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Order number search — narrower */}
          <div className="relative flex flex-1 items-center px-3">
            {loading ? <div className="pointer-events-none absolute left-6 h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" /> : <Search className="pointer-events-none absolute left-6 h-4 w-4 text-slate-400" />}
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="Order #…"
              value={orderSearch}
              onChange={e => setOrderSearch(e.target.value.replace(/\D/g, ''))}
              className="w-full bg-transparent py-3 pl-7 text-sm text-slate-700 placeholder-slate-400 focus:outline-none"
            />
          </div>
        </div>

        {filterOpen && (
          <div className="border-t border-slate-200 px-4 pb-4 pt-3 space-y-3">
            <div className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs font-medium text-slate-500">Shop</span>
              <div className="flex flex-wrap gap-1.5">
                {(['all', 'Seva', 'Seva Mart', 'Seva Super Store'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setFilterShop(s)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      filterShop === s
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {s === 'all' ? 'All' : s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs font-medium text-slate-500">Requestor</span>
              <select
                value={filterRequestor}
                onChange={e => setFilterRequestor(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="all">All</option>
                {requestorOptions.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs font-medium text-slate-500">Type</span>
              <div className="flex gap-1.5">
                {([['all', 'All'], ['unlimited', 'Standard'], ['limited', 'Limited']] as [string, string][]).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setFilterKind(val)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      filterKind === val
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs font-medium text-slate-500">Date Range</span>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={e => setFilterStartDate(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
                <span className="text-slate-400">to</span>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={e => setFilterEndDate(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            {hasActiveFilters && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => { setFilterShop('all'); setFilterRequestor('all'); setFilterKind('all'); setFilterStartDate(''); setFilterEndDate('') }}
                  className="text-xs font-medium text-rose-600 hover:text-rose-700"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        )}
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
      ) : orders.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">No orders yet.</p>
        </Card>
      ) : grouped.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">No orders match the current filters.</p>
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
                    <Card key={o.id} id={o.id} className="p-0">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                        onClick={() => setOpenId(open ? null : o.id)}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-semibold text-slate-900">{o.shopName}</p>
                            {o.orderNumber && (
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono font-semibold text-slate-600">#{o.orderNumber}</span>
                            )}
                            <Badge tone="neutral">{o.orderKind === 'limited' ? 'Limited' : 'Standard'}</Badge>
                            <Badge tone={o.status === 'completed' ? 'success' : 'warning'}>
                              {o.status === 'completed' ? 'Completed' : 'Pending'}
                            </Badge>
                            {o.requestorName && (
                              <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
                                {o.requestorName.split(' ')[0]}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            Placed {formatDateTime(o.createdAt)} · {o.items.length} lines
                          </p>
                        </div>
                        {open ? <ChevronDown className="h-5 w-5 shrink-0" /> : <ChevronRight className="h-5 w-5 shrink-0" />}
                      </button>

                      {open ? (
                        <div className="space-y-4 border-t border-slate-100 px-4 py-3">

                          {/* Timeline */}
                          <OrderTimeline order={o} />

                          {/* Requestor */}
                          <div className="rounded-xl bg-slate-50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Requestor
                            </p>
                            <p className="mt-1 text-sm font-semibold text-slate-900">{o.requestorName}</p>
                            <p className="text-xs text-slate-600">{o.requestorEmail}</p>
                          </div>

                          {/* Lead time — only when completed */}
                          {o.status === 'completed' && (
                            <div className="rounded-xl bg-slate-50 p-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Lead time
                              </p>
                              <p className="mt-1 text-sm font-semibold text-slate-900">{fulfillmentSummary(o)}</p>
                            </div>
                          )}

                          {/* Actions */}
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
                              {pdfBusyId === o.id ? 'Preparing…' : 'Print'}
                            </Button>
                            {profile?.isAdmin && (
                              <Button
                                variant="secondary"
                                className="!text-rose-600 hover:!bg-rose-50"
                                onClick={async () => {
                                  if (!db) return
                                  if (!confirm('Are you sure you want to permanently delete this order?')) return
                                  try {
                                    await deleteOrder(db, o.id)
                                    window.location.reload()
                                  } catch (e) {
                                    alert('Failed to delete order')
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </Button>
                            )}
                          </div>

                          {/* Line items */}
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lines</p>
                            <ul className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-200">
                              {o.items.map((it, idx) => (
                                <li key={`${it.productId}-${idx}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className={`truncate text-slate-900 ${it.notAvailable ? 'line-through text-slate-400' : ''}`}>
                                      {it.name}{it.size ? ` · ${it.size}` : ''}
                                    </span>
                                    {it.notAvailable && (
                                      <Badge tone="neutral">Not Available</Badge>
                                    )}
                                  </div>
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
    </div>
  )
}