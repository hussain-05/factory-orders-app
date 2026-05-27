import { useCallback, useEffect, useMemo, useState } from 'react'
import { addMonths, differenceInCalendarDays, format, startOfMonth } from 'date-fns'
import { BarChart3, Clock, PackageCheck, RefreshCw, Repeat, TrendingUp } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { db } from '../../lib/firebase'
import { listOrdersForShop } from '../../lib/orderService'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import type { Order } from '../../types/models'
import { formatDate, formatDateTime } from '../../utils/format'

// ─── helpers ──────────────────────────────────────────────────────────────

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
      count: orders.filter(o => o.createdAt >= start && o.createdAt < monthEnd).length,
    }
  })
}

function topProducts(orders: Order[], limit = 8) {
  const map = new Map<string, { name: string; size?: string; totalQty: number; orderCount: number }>()
  for (const o of orders) {
    for (const item of o.items) {
      const key = item.productId
      const existing = map.get(key)
      if (existing) {
        existing.totalQty += item.quantity
        existing.orderCount += 1
      } else {
        map.set(key, {
          name: item.name,
          size: item.size,
          totalQty: item.quantity,
          orderCount: 1,
        })
      }
    }
  }
  return [...map.values()]
    .sort((a, b) => b.totalQty - a.totalQty)
    .slice(0, limit)
}

function orderStatusLabel(o: Order): { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' } {
  if (o.status === 'completed') return { label: 'Delivered', tone: 'success' }
  if (o.milestones.dispatchedAt) return { label: 'Dispatched', tone: 'neutral' }
  if (o.milestones.receivedAt) return { label: 'In production', tone: 'warning' }
  return { label: 'Order placed', tone: 'neutral' }
}

// ─── sub-components ───────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'default',
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  tone?: 'default' | 'warning' | 'success'
}) {
  const iconClass = {
    default: 'bg-slate-100 text-slate-600',
    warning: 'bg-amber-100 text-amber-700',
    success: 'bg-emerald-100 text-emerald-700',
  }[tone]

  return (
    <Card className="flex items-start gap-4 p-5">
      <div
        className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      </div>
    </Card>
  )
}

function PipelineStage({
  label,
  count,
  total,
  color,
}: {
  label: string
  count: number
  total: number
  color: string
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex-1 text-center">
      <p className="font-display text-2xl font-bold tabular-nums text-slate-900">{count}</p>
      <div className="mx-auto my-2 h-1.5 w-full rounded-full bg-slate-100">
        <div
          className={`h-1.5 rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs font-medium text-slate-700">{label}</p>
      <p className="text-xs text-slate-400">{pct}%</p>
    </div>
  )
}

// ─── main page ────────────────────────────────────────────────────────────

export function ShopDashboardPage() {
  const { user } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!db || !user) return
    setLoading(true)
    setError(null)
    try {
      setOrders(await listOrdersForShop(db, user.uid))
    } catch {
      setError('Could not load dashboard data.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    queueMicrotask(() => { void refresh() })
  }, [refresh])

  // ── derived metrics ──────────────────────────────────────────────────────

  const pending = useMemo(() => orders.filter(o => o.status === 'pending'), [orders])
  const completed = useMemo(() => orders.filter(o => o.status === 'completed'), [orders])

  const stages = useMemo(() => ({
    placed: pending.filter(o => !o.milestones.receivedAt).length,
    inProduction: pending.filter(o => o.milestones.receivedAt && !o.milestones.dispatchedAt).length,
    dispatched: pending.filter(o => o.milestones.dispatchedAt).length,
  }), [pending])

  const placedThisMonth = useMemo(() => {
    const start = startOfMonth(new Date()).getTime()
    return orders.filter(o => o.createdAt >= start).length
  }, [orders])

  const lastOrderDate = useMemo(() => {
    if (orders.length === 0) return null
    return Math.max(...orders.map(o => o.createdAt))
  }, [orders])

  const avgLead = useMemo(() => calcAvgLeadDays(orders), [orders])

  const orderTypeSplit = useMemo(() => {
    const standard = orders.filter(o => o.orderKind === 'unlimited').length
    const limited = orders.filter(o => o.orderKind === 'limited').length
    const total = orders.length || 1
    return {
      standard,
      limited,
      standardPct: Math.round((standard / total) * 100),
      limitedPct: Math.round((limited / total) * 100),
    }
  }, [orders])

  const recentOrders = useMemo(
    () => [...orders].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6),
    [orders],
  )

  const frequentProducts = useMemo(() => topProducts(orders), [orders])
  const maxProductQty = useMemo(
    () => Math.max(...frequentProducts.map(p => p.totalQty), 1),
    [frequentProducts],
  )

  const trend = useMemo(() => buildMonthlyTrend(orders), [orders])
  const trendMax = useMemo(() => Math.max(...trend.map(m => m.count), 1), [trend])

  // ── render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-16 text-sm text-slate-600">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
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
            Your orders at a glance.
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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Active orders"
          value={pending.length}
          sub={pending.length === 0 ? 'All clear' : `${stages.placed} placed · ${stages.inProduction} in prod · ${stages.dispatched} dispatched`}
          icon={<PackageCheck className="h-5 w-5" />}
          tone={pending.length > 0 ? 'warning' : 'success'}
        />
        <StatCard
          label="Placed this month"
          value={placedThisMonth}
          sub={`${orders.length} all time`}
          icon={<TrendingUp className="h-5 w-5" />}
          tone="success"
        />
        <StatCard
          label="Last order"
          value={lastOrderDate ? format(new Date(lastOrderDate), 'dd MMM') : '—'}
          sub={lastOrderDate ? format(new Date(lastOrderDate), 'yyyy') : 'No orders yet'}
          icon={<BarChart3 className="h-5 w-5" />}
        />
        <StatCard
          label="Avg delivery time"
          value={avgLead != null ? `${avgLead}d` : '—'}
          sub="order placed → delivered"
          icon={<Clock className="h-5 w-5" />}
        />
      </div>

      {/* ── Pipeline + order type split ── */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* My pending pipeline */}
        <Card className="p-5">
          <p className="mb-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            My pending pipeline
          </p>
          {pending.length === 0 ? (
            <p className="text-sm text-slate-500">No active orders right now.</p>
          ) : (
            <div className="flex items-start gap-2">
              <PipelineStage
                label="Order placed"
                count={stages.placed}
                total={pending.length}
                color="bg-blue-400"
              />
              <span className="mt-4 shrink-0 text-slate-300">→</span>
              <PipelineStage
                label="In production"
                count={stages.inProduction}
                total={pending.length}
                color="bg-amber-400"
              />
              <span className="mt-4 shrink-0 text-slate-300">→</span>
              <PipelineStage
                label="Awaiting delivery"
                count={stages.dispatched}
                total={pending.length}
                color="bg-emerald-500"
              />
            </div>
          )}
        </Card>

        {/* Order type split */}
        <Card className="p-5">
          <p className="mb-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Order type split
          </p>
          {orders.length === 0 ? (
            <p className="text-sm text-slate-500">No orders yet.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">Standard catalogue</span>
                  <span className="text-xs text-slate-500">
                    {orderTypeSplit.standard} orders · {orderTypeSplit.standardPct}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-slate-700 transition-all"
                    style={{ width: `${orderTypeSplit.standardPct}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">Limited stock</span>
                  <span className="text-xs text-slate-500">
                    {orderTypeSplit.limited} orders · {orderTypeSplit.limitedPct}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${orderTypeSplit.limitedPct}%` }}
                  />
                </div>
              </div>
              <p className="text-xs text-slate-400 pt-1">{orders.length} total orders</p>
            </div>
          )}
        </Card>
      </div>

      {/* ── Monthly trend ── */}
      <Card className="p-5">
        <p className="mb-6 text-xs font-semibold uppercase tracking-wide text-slate-500">
          My orders — last 6 months
        </p>
        <div className="flex h-36 items-end justify-between gap-2">
          {trend.map(({ label, count }) => (
            <div key={label} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-xs font-semibold text-slate-700">
                {count > 0 ? count : ''}
              </span>
              <div
                className="w-full rounded-t-md bg-emerald-500 transition-all"
                style={{
                  height: `${Math.round((count / trendMax) * 100)}%`,
                  minHeight: count > 0 ? '4px' : '0',
                }}
              />
              <span className="text-xs text-slate-500">{label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Recent orders + Frequently ordered ── */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Recent orders */}
        <Card className="p-5">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Recent orders
          </p>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-slate-500">No orders yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentOrders.map(o => {
                const { label, tone } = orderStatusLabel(o)
                return (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">
                        {o.orderKind === 'limited' ? 'Limited stock' : 'Standard catalogue'}
                        {o.orderNumber ? (
                          <span className="ml-1.5 font-mono text-xs text-slate-500">
                            #{o.orderNumber}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDateTime(o.createdAt)} · {o.items.length} line{o.items.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <Badge tone={tone}>{label}</Badge>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* Frequently ordered products */}
        <Card className="p-5">
          <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Repeat className="h-3.5 w-3.5" />
            Frequently ordered
          </p>
          {frequentProducts.length === 0 ? (
            <p className="text-sm text-slate-500">No order history yet.</p>
          ) : (
            <ul className="space-y-3">
              {frequentProducts.map((p, i) => (
                <li key={i} className="text-sm">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-medium text-slate-800 truncate">
                      {p.name}{p.size ? ` · ${p.size}` : ''}
                    </span>
                    <span className="ml-3 shrink-0 text-xs text-slate-500">
                      ×{p.totalQty} across {p.orderCount} order{p.orderCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100">
                    <div
                      className="h-1.5 rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.round((p.totalQty / maxProductQty) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}