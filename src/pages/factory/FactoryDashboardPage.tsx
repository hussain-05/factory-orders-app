import { useCallback, useEffect, useMemo, useState } from 'react'
import { addMonths, differenceInCalendarDays, format, formatDistanceToNow, startOfMonth } from 'date-fns'
import { AlertTriangle, Clock, Package, RefreshCw, TrendingUp } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { db } from '../../lib/firebase'
import { listAllOrdersForFactory } from '../../lib/orderService'
import { listLimitedProducts } from '../../lib/productService'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import type { LimitedProduct, Order, OrderDispatch } from '../../types/models'
import { formatDateTime } from '../../utils/format'

// ─── helpers ──────────────────────────────────────────────────────────────

const SHOPS = ['Seva', 'Seva Mart', 'Seva Super Store'] as const

function lastActivityLabel(o: Order): { label: string; tone: 'success' | 'neutral' | 'warning' } {
  if (o.status === 'completed') return { label: 'Completed', tone: 'success' }
  if (o.milestones.dispatchedAt) return { label: 'Dispatched', tone: 'neutral' }
  if (o.milestones.receivedAt) return { label: 'In production', tone: 'warning' }
  return { label: 'Order placed', tone: 'neutral' }
}

function dispQtyByProduct(dispatches: OrderDispatch[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const d of dispatches) {
    for (const it of d.items) map[it.productId] = (map[it.productId] ?? 0) + it.qty
  }
  return map
}

type DispatchStage = 'new' | 'partial' | 'awaiting'
function orderDispatchStage(o: Order): DispatchStage {
  const dispatches = o.dispatches ?? []
  if (dispatches.length === 0) return 'new'
  const dispatched = dispQtyByProduct(dispatches)
  const allSent = o.items.every(it => (dispatched[it.productId] ?? 0) >= it.quantity)
  return allSent ? 'awaiting' : 'partial'
}

interface OutstandingItem {
  productId: string
  name: string
  size?: string
  remaining: number
  ordered: number
}

function buildOutstandingItems(pendingOrders: Order[]): OutstandingItem[] {
  const map = new Map<string, OutstandingItem>()
  for (const o of pendingOrders) {
    const dispatched = dispQtyByProduct(o.dispatches ?? [])
    for (const it of o.items) {
      const remaining = it.quantity - (dispatched[it.productId] ?? 0)
      if (remaining <= 0) continue
      const existing = map.get(it.productId)
      if (existing) {
        existing.remaining += remaining
        existing.ordered += it.quantity
      } else {
        map.set(it.productId, { productId: it.productId, name: it.name, size: it.size, remaining, ordered: it.quantity })
      }
    }
  }
  return [...map.values()].sort((a, b) => b.remaining - a.remaining)
}

function calcAvgLeadDays(orders: Order[]): number | null {
  const done = orders.filter(o => o.status === 'completed' && o.createdAt && o.actualDeliveryDate)
  if (done.length === 0) return null
  const sum = done.reduce(
    (s, o) => s + differenceInCalendarDays(o.actualDeliveryDate!, o.createdAt),
    0,
  )
  return Math.round(sum / done.length)
}

function buildMonthlyTrend(orders: Order[]) {
  return Array.from({ length: 6 }, (_, i) => {
    const monthStart = startOfMonth(addMonths(new Date(), i - 5))
    const monthEnd = startOfMonth(addMonths(monthStart, 1)).getTime()
    const start = monthStart.getTime()
    return {
      label: format(monthStart, 'MMM'),
      placed: orders.filter(o => o.createdAt >= start && o.createdAt < monthEnd).length,
      completed: orders.filter(
        o => (o.completedAt ?? 0) >= start && (o.completedAt ?? 0) < monthEnd,
      ).length,
    }
  })
}

// ─── sub-components ───────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'default',
  onClick,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  tone?: 'default' | 'warning' | 'success'
  onClick?: () => void
}) {
  const iconClass = {
    default: 'bg-slate-100 text-slate-600',
    warning: 'bg-amber-100 text-amber-700',
    success: 'bg-emerald-100 text-emerald-700',
  }[tone]

  const inner = (
    <>
      <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      </div>
    </>
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block w-full h-full text-left group">
        <Card className="flex h-full items-start gap-4 p-5 transition-shadow group-hover:shadow-md group-hover:ring-1 group-hover:ring-slate-200">
          {inner}
        </Card>
      </button>
    )
  }

  return <Card className="flex h-full items-start gap-4 p-5">{inner}</Card>
}

function PipelineStage({
  label,
  count,
  total,
  color,
  onClick,
}: {
  label: string
  count: number
  total: number
  color: string
  onClick?: () => void
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  const inner = (
    <>
      <p className="font-display text-2xl font-bold tabular-nums text-slate-900">{count}</p>
      <div className="mx-auto my-2 h-1.5 w-full rounded-full bg-slate-100">
        <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs font-medium text-slate-700">{label}</p>
      <p className="text-xs text-slate-400">{pct}%</p>
    </>
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="flex-1 text-center transition-opacity hover:opacity-70">
        {inner}
      </button>
    )
  }
  return <div className="flex-1 text-center">{inner}</div>
}

// ─── main page ────────────────────────────────────────────────────────────

export function FactoryDashboardPage() {
  const nav = useNavigate()
  const [orders, setOrders] = useState<Order[]>([])
  const [limitedProducts, setLimitedProducts] = useState<LimitedProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!db) return
    setLoading(true)
    setError(null)
    try {
      const [o, p] = await Promise.all([listAllOrdersForFactory(db), listLimitedProducts(db)])
      setOrders(o)
      setLimitedProducts(p)
    } catch {
      setError('Could not load dashboard data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => { void refresh() })
  }, [refresh])

  // ── derived metrics ──────────────────────────────────────────────────────

  const pending = useMemo(() => orders.filter(o => o.status === 'pending'), [orders])


  const stages = useMemo(() => ({
    placed:   pending.filter(o => !o.milestones.receivedAt).length,
    inProduction: pending.filter(o => o.milestones.receivedAt && orderDispatchStage(o) === 'new').length,
    partial:  pending.filter(o => orderDispatchStage(o) === 'partial').length,
    awaiting: pending.filter(o => orderDispatchStage(o) === 'awaiting').length,
  }), [pending])

  const outstanding = useMemo(() => buildOutstandingItems(pending), [pending])



  const avgLead = useMemo(() => calcAvgLeadDays(orders), [orders])

  const placedThisMonth = useMemo(() => {
    const start = startOfMonth(new Date()).getTime()
    return orders.filter(o => o.createdAt >= start).length
  }, [orders])

  const lastOrderDate = useMemo(() => {
    if (orders.length === 0) return null
    const latest = [...orders].sort((a, b) => b.createdAt - a.createdAt)[0]
    return latest.createdAt
  }, [orders])

  const byShop = useMemo(() => {
    const maxTotal = Math.max(
      ...SHOPS.map(s => orders.filter(o => o.shopName === s).length),
      1,
    )
    return SHOPS.map(shop => {
      const total = orders.filter(o => o.shopName === shop).length
      return {
        name: shop,
        pending: orders.filter(o => o.shopName === shop && o.status === 'pending').length,
        completed: orders.filter(o => o.shopName === shop && o.status === 'completed').length,
        total,
        pct: Math.round((total / maxTotal) * 100),
      }
    })
  }, [orders])

  const trend = useMemo(() => buildMonthlyTrend(orders), [orders])
  const trendMax = useMemo(() => Math.max(...trend.map(m => m.placed), 1), [trend])

  const recentActivity = useMemo(
    () => [...orders].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8),
    [orders],
  )

  const lowStock = useMemo(
    () => limitedProducts.filter(p => p.stock <= 10).sort((a, b) => a.stock - b.stock),
    [limitedProducts],
  )

  // ── render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-16 text-sm text-slate-600">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
        Loading dashboard…
      </div>
    )
  }

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Operations overview across all shops and orders.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5 items-stretch">
        <StatCard
          label="Last order"
          value={lastOrderDate ? formatDistanceToNow(lastOrderDate, { addSuffix: true }) : '—'}
          sub={lastOrderDate ? format(lastOrderDate, 'MMM d, h:mm a') : ''}
          icon={<Clock className="h-5 w-5" />}
          onClick={() => nav('/factory/pending')}
        />
        <StatCard
          label="Awaiting confirmation"
          value={stages.awaiting}
          sub="shop action needed"
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={stages.awaiting > 0 ? 'warning' : 'default'}
          onClick={() => nav('/factory/pending')}
        />
        <StatCard
          label="Active orders"
          value={pending.length}
          sub={`${stages.placed} new · ${stages.inProduction} in prod · ${stages.partial} partial`}
          icon={<Package className="h-5 w-5" />}
          tone={pending.length > 0 ? 'warning' : 'default'}
          onClick={() => nav('/factory/pending')}
        />
        <StatCard
          label="Avg lead time"
          value={avgLead != null ? `${avgLead}d` : '—'}
          sub="order placed → delivered"
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          label="Placed this month"
          value={placedThisMonth}
          sub="total incoming orders"
          icon={<TrendingUp className="h-5 w-5" />}
          tone="success"
          onClick={() => nav('/factory/history')}
        />
      </div>

      {/* ── Pipeline + by shop ── */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Pending pipeline */}
        <Card className="p-5">
          <p className="mb-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Pending pipeline
          </p>
          {pending.length === 0 ? (
            <p className="text-sm text-slate-500">No pending orders — all clear.</p>
          ) : (
            <div className="flex items-start gap-2">
              <PipelineStage
                label="Order placed"
                count={stages.placed}
                total={pending.length}
                color="bg-blue-400"
                onClick={() => nav('/factory/pending')}
              />
              <span className="mt-4 shrink-0 text-slate-300">→</span>
              <PipelineStage
                label="In production"
                count={stages.inProduction}
                total={pending.length}
                color="bg-amber-400"
                onClick={() => nav('/factory/pending')}
              />
              <span className="mt-4 shrink-0 text-slate-300">→</span>
              <PipelineStage
                label="Partially dispatched"
                count={stages.partial}
                total={pending.length}
                color="bg-orange-400"
                onClick={() => nav('/factory/pending')}
              />
              <span className="mt-4 shrink-0 text-slate-300">→</span>
              <PipelineStage
                label="Awaiting confirmation"
                count={stages.awaiting}
                total={pending.length}
                color="bg-emerald-500"
                onClick={() => nav('/factory/pending')}
              />
            </div>
          )}
        </Card>

        {/* Orders by shop */}
        <Card className="p-5">
          <p className="mb-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Orders by shop
          </p>
          <div className="space-y-4">
            {byShop.map(({ name, pending: p, completed: c, total, pct }) => (
              <div key={name}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{name}</span>
                  <span className="text-xs text-slate-500">
                    {p} pending · {c} done · {total} total
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── Outstanding quantities ── */}
      {outstanding.length > 0 && (
        <Card className="p-5">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Outstanding quantities
          </p>
          <div className="space-y-3">
            {outstanding.map(item => {
              const pct = Math.round((item.remaining / item.ordered) * 100)
              return (
                <div key={item.productId}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700 truncate">
                      {item.name}{item.size ? ` · ${item.size}` : ''}
                    </span>
                    <span className="ml-3 shrink-0 text-xs text-slate-500">
                      <span className="font-semibold text-amber-600">{item.remaining}</span>
                      {' '}remaining of {item.ordered} ordered
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-amber-400 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* ── Monthly trend ── */}
      <Card className="p-5">
        <p className="mb-6 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Orders placed — last 6 months
        </p>
        <div className="flex h-36 items-end justify-between gap-2">
          {trend.map(({ label, placed }) => (
            <div key={label} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs font-semibold text-slate-700">
                {placed > 0 ? placed : ''}
              </span>
              <div
                className="w-full rounded-t-md bg-emerald-500 transition-all"
                style={{
                  height: `${Math.round((placed / trendMax) * 100)}%`,
                  minHeight: placed > 0 ? '4px' : '0',
                }}
              />
              <span className="text-xs text-slate-500">{label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Recent activity + Low stock ── */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Recent activity */}
        <Card className="p-5">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Recent activity
          </p>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-slate-500">No orders yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentActivity.map(o => {
                const { label, tone } = lastActivityLabel(o)
                const dest = o.status === 'completed' ? '/factory/history' : '/factory/pending'
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => nav(dest, { state: { openId: o.id } })}
                      className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm transition-colors hover:bg-slate-50 rounded-lg px-1 -mx-1"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">
                          {o.shopName}
                          {o.orderNumber ? (
                            <span className="ml-1.5 font-mono text-xs text-slate-500">
                              #{o.orderNumber}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-slate-500">{formatDateTime(o.updatedAt)}</p>
                      </div>
                      <Badge tone={tone}>{label}</Badge>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* Low stock alerts */}
        <Card className="p-5">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Low stock alerts
            {lowStock.length > 0 && (
              <span className="ml-2 rounded-full bg-rose-500 px-1.5 py-0.5 text-xs font-bold leading-none text-white">
                {lowStock.length}
              </span>
            )}
          </p>
          {lowStock.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <AlertTriangle className="h-4 w-4 text-slate-300" />
              All limited products are well-stocked.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {lowStock.map(p => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => nav('/factory/products')}
                    className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm transition-colors hover:bg-slate-50 rounded-lg px-1 -mx-1"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-500">{p.size}</p>
                    </div>
                    <Badge tone={p.stock === 0 ? 'danger' : 'warning'}>
                      {p.stock === 0 ? 'Out of stock' : `${p.stock} left`}
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}