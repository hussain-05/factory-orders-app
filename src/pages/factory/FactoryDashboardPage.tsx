import { useCallback, useEffect, useMemo, useState } from 'react'
import { addMonths, differenceInCalendarDays, format, startOfMonth } from 'date-fns'
import { AlertTriangle, BarChart3, Clock, Package, RefreshCw, TrendingUp } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { db } from '../../lib/firebase'
import { listAllOrdersForFactory } from '../../lib/orderService'
import { listLimitedProducts } from '../../lib/productService'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import type { LimitedProduct, Order } from '../../types/models'
import { formatDateTime } from '../../utils/format'

// ─── helpers ──────────────────────────────────────────────────────────────

const SHOPS = ['Seva', 'Seva Mart', 'Seva Super Store'] as const

function lastActivityLabel(o: Order): { label: string; tone: 'success' | 'neutral' | 'warning' } {
  if (o.status === 'completed') return { label: 'Completed', tone: 'success' }
  if (o.milestones.dispatchedAt) return { label: 'Dispatched', tone: 'neutral' }
  if (o.milestones.receivedAt) return { label: 'In production', tone: 'warning' }
  return { label: 'Order placed', tone: 'neutral' }
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
  const completed = useMemo(() => orders.filter(o => o.status === 'completed'), [orders])

  const stages = useMemo(() => ({
    placed: pending.filter(o => !o.milestones.receivedAt).length,
    inProduction: pending.filter(o => o.milestones.receivedAt && !o.milestones.dispatchedAt).length,
    dispatched: pending.filter(o => o.milestones.dispatchedAt).length,
  }), [pending])

  const completedThisMonth = useMemo(() => {
    const start = startOfMonth(new Date()).getTime()
    return completed.filter(o => (o.completedAt ?? 0) >= start).length
  }, [completed])

  const avgLead = useMemo(() => calcAvgLeadDays(orders), [orders])

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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 items-stretch">
        <StatCard
          label="Pending orders"
          value={pending.length}
          sub={`${stages.placed} placed · ${stages.inProduction} in prod · ${stages.dispatched} dispatched`}
          icon={<Package className="h-5 w-5" />}
          tone={pending.length > 0 ? 'warning' : 'default'}
          onClick={() => nav('/factory/pending')}
        />
        <StatCard
          label="Completed this month"
          value={completedThisMonth}
          sub={`${completed.length} all time`}
          icon={<TrendingUp className="h-5 w-5" />}
          tone="success"
          onClick={() => nav('/factory/history')}
        />
        <StatCard
          label="Avg lead time"
          value={avgLead != null ? `${avgLead}d` : '—'}
          sub="order placed → delivered"
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          label="Total orders"
          value={orders.length}
          sub="all time"
          icon={<BarChart3 className="h-5 w-5" />}
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
                label="Awaiting delivery"
                count={stages.dispatched}
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