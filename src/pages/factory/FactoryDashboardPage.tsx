import { useEffect, useMemo, useState } from 'react'

import { motion } from 'framer-motion'
import { addMonths, differenceInCalendarDays, format, startOfMonth } from 'date-fns'
import { AlertTriangle, BarChart3, Clock, Package, TrendingUp, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { db } from '../../lib/firebase'
import { subscribeAllOrdersForFactory } from '../../lib/orderService'
import { subscribeLimitedProducts } from '../../lib/productService'
import { Badge } from '../../components/ui/Badge'
import { Card } from '../../components/ui/Card'
import type { LimitedProduct, Order, OrderDispatch } from '../../types/models'
import { formatDateTime } from '../../utils/format'

// ─── helpers ──────────────────────────────────────────────────────────────

const SHOPS = ['Seva', 'Seva Mart', 'Seva Super Store', 'Test Shop'] as const

function lastActivityLabel(o: Order): { label: string; tone: 'success' | 'neutral' | 'warning' } {
  if (o.status === 'completed') return { label: 'Completed', tone: 'success' }
  if (o.milestones.dispatchedAt) return { label: 'Dispatched', tone: 'neutral' }
  if (o.milestones.receivedAt) return { label: 'In production', tone: 'warning' }
  return { label: 'Order placed', tone: 'neutral' }
}

function dispQtyByProduct(dispatches: OrderDispatch[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const d of dispatches) {
    for (const it of d.items) {
      if (it.confirmedAt !== -1) {
        map[it.productId] = (map[it.productId] ?? 0) + it.qty
      }
    }
  }
  return map
}

type DispatchStage = 'new' | 'partial' | 'awaiting'
function orderDispatchStage(o: Order): DispatchStage {
  const dispatches = o.dispatches ?? []
  if (dispatches.length === 0) return 'new'

  const hasActiveDispatch = dispatches.some(d => !d.receivedAt)
  if (hasActiveDispatch) return 'awaiting'

  return 'partial'
}

interface OutstandingItem {
  productId: string
  name: string
  size?: string
  remaining: number
  ordered: number
  shops: Set<string>
  oldestPlacedAt: number
}

function buildOutstandingItems(pendingOrders: Order[]): Array<OutstandingItem & { shopsWaiting: number; oldestAgeDays: number }> {
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
        existing.shops.add(o.shopName)
        if (o.createdAt < existing.oldestPlacedAt) {
          existing.oldestPlacedAt = o.createdAt
        }
      } else {
        const shopsSet = new Set<string>()
        shopsSet.add(o.shopName)
        map.set(it.productId, {
          productId: it.productId,
          name: it.name,
          size: it.size,
          remaining,
          ordered: it.quantity,
          shops: shopsSet,
          oldestPlacedAt: o.createdAt
        })
      }
    }
  }
  
  const today = new Date()
  return [...map.values()].map(item => {
    const oldestAgeDays = differenceInCalendarDays(today, new Date(item.oldestPlacedAt))
    return {
      ...item,
      shopsWaiting: item.shops.size,
      oldestAgeDays,
    }
  }).sort((a, b) => b.oldestAgeDays - a.oldestAgeDays)
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

function calcOnTimeDeliveryRate(orders: Order[]): number | null {
  const now = Date.now()
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000
  const completedLast30Days = orders.filter(
    o => o.status === 'completed' && o.completedAt && o.completedAt >= thirtyDaysAgo
  )
  if (completedLast30Days.length === 0) return null
  const onTimeCount = completedLast30Days.filter(
    o => o.createdAt && o.actualDeliveryDate && differenceInCalendarDays(o.actualDeliveryDate!, o.createdAt) <= 5
  ).length
  return Math.round((onTimeCount / completedLast30Days.length) * 100)
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

function buildWeeklyDispatchesTrend(orders: Order[]) {
  const today = new Date()
  const weeks = Array.from({ length: 6 }, (_, i) => {
    const startOfWeek = new Date(today.getTime() - (5 - i) * 7 * 24 * 60 * 60 * 1000)
    startOfWeek.setHours(0, 0, 0, 0)
    const day = startOfWeek.getDay()
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(startOfWeek.setDate(diff))
    monday.setHours(0, 0, 0, 0)
    const sunday = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)
    return {
      monday: monday.getTime(),
      sunday: sunday.getTime(),
      label: format(monday, 'dd/MM'),
      volume: 0,
    }
  })

  for (const o of orders) {
    const dispatches = o.dispatches ?? []
    for (const d of dispatches) {
      if (!d.dispatchedAt) continue
      const date = d.dispatchedAt
      for (const wk of weeks) {
        if (date >= wk.monday && date <= wk.sunday) {
          const qty = d.items.reduce((s, it) => s + it.qty, 0)
          wk.volume += qty
          break
        }
      }
    }
  }

  return weeks.map(wk => ({
    label: wk.label,
    volume: wk.volume,
  }))
}

// ─── sub-components ───────────────────────────────────────────────────────

const iconToneClasses = {
  emerald:
    'bg-emerald-50 text-emerald-700 shadow-sm dark:bg-emerald-500/10 dark:text-emerald-400 dark:shadow-[0_0_24px_rgba(16,185,129,0.12)]',
  sky:
    'bg-sky-50 text-sky-700 shadow-sm dark:bg-sky-500/10 dark:text-sky-400 dark:shadow-[0_0_24px_rgba(56,189,248,0.12)]',
  amber:
    'bg-amber-50 text-amber-700 shadow-sm dark:bg-amber-500/10 dark:text-amber-400 dark:shadow-[0_0_24px_rgba(245,158,11,0.12)]',
  violet:
    'bg-violet-50 text-violet-700 shadow-sm dark:bg-violet-500/10 dark:text-violet-400 dark:shadow-[0_0_24px_rgba(139,92,246,0.12)]',
  rose:
    'bg-rose-50 text-rose-700 shadow-sm dark:bg-rose-500/10 dark:text-rose-400 dark:shadow-[0_0_24px_rgba(244,63,94,0.12)]',
  indigo:
    'bg-indigo-50 text-indigo-700 shadow-sm dark:bg-indigo-500/10 dark:text-indigo-400 dark:shadow-[0_0_24px_rgba(99,102,241,0.12)]',
}

function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'sky',
  onClick,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ReactNode
  tone?: keyof typeof iconToneClasses
  onClick?: () => void
}) {
  const iconClass = iconToneClasses[tone]

  const inner = (
    <>
      <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 break-words whitespace-normal transition-colors duration-200">{label}</p>
        <p className="mt-1 font-display text-xl sm:text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100 break-words whitespace-normal transition-colors duration-200">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">{sub}</p>}
      </div>
    </>
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block w-full h-full text-left group min-w-0">
        <Card className="w-full flex h-full items-start gap-3 sm:gap-4 p-4 sm:p-5 transition-shadow group-hover:shadow-md group-hover:ring-1 group-hover:ring-slate-200 min-w-0">
          {inner}
        </Card>
      </button>
    )
  }

  return <Card className="w-full flex h-full items-start gap-3 sm:gap-4 p-4 sm:p-5 min-w-0">{inner}</Card>
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
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100)
    return () => clearTimeout(t)
  }, [])
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  const inner = (
    <>
      <p className="font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100 transition-colors duration-200">{count}</p>
      <div className="mx-auto my-2 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 transition-colors duration-200">
        <div className={`h-1.5 rounded-full transition-all duration-700 ${color}`} style={{ width: mounted ? `${pct}%` : '0%' }} />
      </div>
      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors duration-200">{label}</p>
      <p className="text-xs text-slate-400 dark:text-slate-500 transition-colors duration-200">{pct}%</p>
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
  const [mounted, setMounted] = useState(false)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  // Real-time subscriptions
  useEffect(() => {
    if (!db) return
    setLoading(true)
    setError(null)

    let ordersLoaded = false
    let productsLoaded = false

    const checkDone = () => {
      if (ordersLoaded && productsLoaded) {
        setLoading(false)
        setTimeout(() => setMounted(true), 100)
      }
    }

    const unsubOrders = subscribeAllOrdersForFactory(
      db,
      (rows) => {
        setOrders(rows)
        ordersLoaded = true
        checkDone()
      },
      () => {
        setError('Could not load dashboard data.')
        setLoading(false)
      }
    )

    const unsubProducts = subscribeLimitedProducts(
      db,
      (rows) => {
        setLimitedProducts(rows)
        productsLoaded = true
        checkDone()
      },
      () => {
        setError('Could not load dashboard data.')
        setLoading(false)
      }
    )

    return () => {
      unsubOrders()
      unsubProducts()
    }
  }, [])



  // ── derived metrics ──────────────────────────────────────────────────────

  const pending = useMemo(() => orders.filter(o => o.status === 'pending'), [orders])
  const completed = useMemo(() => orders.filter(o => o.status === 'completed'), [orders])

  const stages = useMemo(() => ({
    placed:   pending.filter(o => !o.milestones.receivedAt).length,
    inProduction: pending.filter(o => o.milestones.receivedAt && orderDispatchStage(o) === 'new').length,
    partial:  pending.filter(o => orderDispatchStage(o) === 'partial').length,
    awaiting: pending.filter(o => orderDispatchStage(o) === 'awaiting').length,
  }), [pending])

  const outstanding = useMemo(() => buildOutstandingItems(pending), [pending])

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

function isOrderOverdue(o: Order, today: Date): boolean {
  if (o.status !== 'pending') return false

  const dispatches = o.dispatches ?? []

  // 1.3: do not show those orders for which there is an active dispatch and the shop has still pending confirmations
  const hasPendingConfirmations = dispatches.some(d => d.items.some(it => !it.confirmedAt))
  if (hasPendingConfirmations) return false

  // Check if there is not a single dispatch made for the order
  if (dispatches.length === 0) {
    // 1.1: its been more than 5 days since order was placed and there is not a single dispatch made for the order
    const daysSincePlaced = differenceInCalendarDays(today, new Date(o.createdAt))
    return daysSincePlaced > 5
  }

  // If there are dispatches, check if there are remaining items to dispatch
  const totalQty = o.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
  const dispatchedQty = dispatches.reduce((sum, d) => sum + d.items.reduce((s, it) => {
    if (it.confirmedAt === -1) return s
    return s + Number(it.qty || 0)
  }, 0), 0)
  const hasRemainingItems = totalQty - dispatchedQty > 0

  if (hasRemainingItems) {
    // 1.2: its been more than 5 days since any partial dispatch was made, and there remaining items to dispatch
    // Note: since hasPendingConfirmations is false, all items from previous dispatches have been confirmed.
    const latestDispatchTime = Math.max(...dispatches.map(d => d.dispatchedAt ?? 0))
    if (latestDispatchTime > 0) {
      const daysSinceLatestDispatch = differenceInCalendarDays(today, new Date(latestDispatchTime))
      return daysSinceLatestDispatch > 5
    }
  }

  return false
}

  const overdueOrdersCount = useMemo(() => {
    const today = new Date()
    return pending.filter(o => isOrderOverdue(o, today)).length
  }, [pending])

  const onTimeRate = useMemo(() => calcOnTimeDeliveryRate(orders), [orders])

  const weeklyTrend = useMemo(() => buildWeeklyDispatchesTrend(orders), [orders])
  const weeklyMax = useMemo(() => Math.max(...weeklyTrend.map(w => w.volume), 1), [weeklyTrend])
  const [hoveredWeekIdx, setHoveredWeekIdx] = useState<number | null>(null)

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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 animate-pulse pt-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-20 rounded bg-slate-100 dark:bg-slate-800" />
                <div className="h-7 w-14 rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-2.5 w-28 rounded bg-slate-100 dark:bg-slate-800" />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      className="space-y-8"
    >

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 dark:from-slate-100 dark:to-slate-400">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 transition-colors duration-200">
            Live view of all pending orders, production stages, and delivery performance.
          </p>
        </div>

      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 px-4 py-3 ring-1 ring-rose-200 dark:ring-rose-800/50">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <p className="text-sm text-rose-800 dark:text-rose-300">{error}
        </p>
        </div>
      )}

      {overdueOrdersCount > 0 && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -2 }}
          onClick={() => nav('/factory/pending', { state: { filterOverdue: true } })}
          className="w-full flex items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50/40 p-4 text-left dark:border-rose-900/30 dark:bg-rose-950/10 hover:shadow-md hover:ring-1 hover:ring-rose-300 dark:hover:ring-rose-800/50 transition duration-200"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-800 dark:bg-rose-500/10 dark:text-rose-400">
              <AlertTriangle className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                {overdueOrdersCount} overdue order{overdueOrdersCount === 1 ? '' : 's'} waiting for dispatch
              </p>
              <p className="text-xs text-rose-700/80 dark:text-rose-400/80 mt-0.5">
                Click to review delayed orders.
              </p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-rose-400 dark:text-rose-500 shrink-0" />
        </motion.button>
      )}

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 items-stretch">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0, ease: [0.25, 0.1, 0.25, 1] }} className="flex w-full">
          <StatCard
            label="Pending orders"
            value={pending.length}
            sub={`${stages.placed} new · ${stages.inProduction} in prod · ${stages.partial} partial · ${stages.awaiting} awaiting`}
            icon={<Package className="h-5 w-5" />}
            tone={pending.length > 0 ? 'amber' : 'sky'}
            onClick={() => nav('/factory/pending')}
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.06, ease: [0.25, 0.1, 0.25, 1] }} className="flex w-full">
          <StatCard
            label="Completed this month"
            value={completedThisMonth}
            sub={`${completed.length} all time`}
            icon={<TrendingUp className="h-5 w-5" />}
            tone="emerald"
            onClick={() => nav('/factory/history')}
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.12, ease: [0.25, 0.1, 0.25, 1] }} className="flex w-full">
          <StatCard
            label="Avg lead time"
            value={avgLead != null ? `${avgLead}d` : '—'}
            sub={onTimeRate != null ? `${onTimeRate}% on time (5-day goal)` : "order placed → delivered"}
            icon={<Clock className="h-5 w-5" />}
            tone="violet"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.18, ease: [0.25, 0.1, 0.25, 1] }} className="flex w-full">
          <StatCard
            label="Total orders"
            value={orders.length}
            sub="all time"
            icon={<BarChart3 className="h-5 w-5" />}
            tone="indigo"
            onClick={() => nav('/factory/history')}
          />
        </motion.div>
      </div>

      {/* ── Pipeline + by shop ── */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Pending pipeline */}
        <Card className="p-5">
          <p className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 before:block before:h-3 before:w-0.5 before:rounded-full before:bg-emerald-500 dark:before:bg-emerald-400 transition-colors duration-200">
            Pending pipeline
          </p>
          {pending.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <span className="text-2xl">🎉</span>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                All clear — no active orders.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <PipelineStage
                label="Order placed"
                count={stages.placed}
                total={pending.length}
                color="bg-blue-400"
                onClick={() => nav('/factory/pending')}
              />
              <span className="mt-4 shrink-0 text-slate-300 dark:text-slate-600 transition-colors duration-200">→</span>
              <PipelineStage
                label="In production"
                count={stages.inProduction}
                total={pending.length}
                color="bg-amber-400"
                onClick={() => nav('/factory/pending')}
              />
              <span className="mt-4 shrink-0 text-slate-300 dark:text-slate-600 transition-colors duration-200">→</span>
              <PipelineStage
                label="Partially dispatched"
                count={stages.partial}
                total={pending.length}
                color="bg-orange-400"
                onClick={() => nav('/factory/pending')}
              />
              <span className="mt-4 shrink-0 text-slate-300 dark:text-slate-600 transition-colors duration-200">→</span>
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
          <p className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 before:block before:h-3 before:w-0.5 before:rounded-full before:bg-emerald-500 dark:before:bg-emerald-400 transition-colors duration-200">
            Orders by shop
          </p>
          <div className="space-y-4">
            {byShop.map(({ name, pending: p, completed: c, total, pct }) => (
              <div key={name}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300 transition-colors duration-200">{name}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">
                    {p} pending · {c} done · {total} total
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 transition-colors duration-200">
                  <div
                    className="h-2 rounded-full bg-emerald-500 transition-all duration-700"
                    style={{ width: mounted ? `${pct}%` : '0%' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ── Trend charts grid ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monthly Trend (Line Chart) */}
        <Card className="p-5 overflow-visible">
          <p className="mb-5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 transition-colors duration-200">
            Orders placed — last 6 months
          </p>
          
          <div className="relative w-full h-36">
            {/* HTML Grid Lines */}
            <div className="absolute inset-x-0 top-[10%] border-t border-slate-100 dark:border-slate-800/50 transition-colors duration-200" />
            <div className="absolute inset-x-0 top-[50%] border-t border-slate-100 dark:border-slate-800/50 transition-colors duration-200" />
            <div className="absolute inset-x-0 bottom-[10%] border-t border-slate-100 dark:border-slate-800/50 transition-colors duration-200" />

            {/* SVG Chart Line/Area */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Area path */}
              {mounted && trend.length > 0 && (
                <path
                  d={`
                    M 5,90
                    ${trend.map((t, i) => `L ${5 + i * 18},${90 - (t.placed / trendMax) * 80}`).join(' ')}
                    L 95,90
                    Z
                  `}
                  fill="url(#chartGradient)"
                  className="transition-all duration-700 ease-out"
                />
              )}

              {/* Line path */}
              {mounted && trend.length > 0 && (
                <path
                  d={trend.map((t, i) => `${i === 0 ? 'M' : 'L'} ${5 + i * 18},${90 - (t.placed / trendMax) * 80}`).join(' ')}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-all duration-700 ease-out"
                />
              )}
            </svg>

            {/* Active hover indicators (Line + Dot) */}
            {hoveredIdx !== null && trend[hoveredIdx] && (
              <>
                {/* Vertical Tracking Line */}
                <div
                  className="absolute top-[10%] bottom-[10%] w-[1.5px] bg-emerald-500/20 dark:bg-emerald-500/35 -translate-x-1/2 transition-all duration-150 ease-out"
                  style={{ left: `${5 + hoveredIdx * 18}%` }}
                />

                {/* Interactive Dot */}
                <div
                  className="absolute h-3 w-3 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 shadow-md -translate-x-1/2 -translate-y-1/2 transition-all duration-150 ease-out"
                  style={{
                    left: `${5 + hoveredIdx * 18}%`,
                    top: `${90 - (trend[hoveredIdx].placed / trendMax) * 80}%`
                  }}
                />

                {/* Tooltip */}
                <div
                  className="absolute pointer-events-none z-30 rounded-xl bg-slate-950/95 dark:bg-slate-900/95 border border-slate-800 dark:border-slate-700/80 px-3 py-1.5 text-xs text-white shadow-xl backdrop-blur-md transition-all duration-150 ease-out"
                  style={{
                    left: `${5 + hoveredIdx * 18}%`,
                    top: `${90 - (trend[hoveredIdx].placed / trendMax) * 80}%`,
                    transform: 'translate(-50%, calc(-100% - 10px))',
                  }}
                >
                  <div className="font-semibold text-[9px] uppercase tracking-wider text-slate-400">
                    {trend[hoveredIdx].label}
                  </div>
                  <div className="mt-0.5 text-[11px] font-bold text-emerald-400 whitespace-nowrap">
                    {trend[hoveredIdx].placed} {trend[hoveredIdx].placed === 1 ? 'order' : 'orders'}
                  </div>
                </div>
              </>
            )}

            {/* Static values above nodes on the line */}
            {mounted && trend.map((t, i) => (
              hoveredIdx !== i && (
                <div
                  key={`val-${i}`}
                  className="absolute -translate-x-1/2 -translate-y-5 text-[10px] font-bold text-slate-500 dark:text-slate-400 select-none pointer-events-none transition-colors duration-200"
                  style={{
                    left: `${5 + i * 18}%`,
                    top: `${90 - (t.placed / trendMax) * 80}%`
                  }}
                >
                  {t.placed}
                </div>
              )
            ))}

            {/* Interactive mouse targets (invisible blocks) */}
            <div className="absolute inset-0">
              {trend.map((_, i) => (
                <div
                  key={`target-${i}`}
                  className="absolute top-0 bottom-0 cursor-pointer"
                  style={{
                    left: `${5 + i * 18}%`,
                    width: '18%',
                    transform: 'translateX(-50%)'
                  }}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              ))}
            </div>
          </div>

          {/* X-Axis labels in pure HTML */}
          <div className="relative w-full h-5 mt-2">
            {trend.map((t, i) => (
              <span
                key={`label-${i}`}
                className="absolute text-[11px] font-semibold text-slate-400 dark:text-slate-500 tracking-wider -translate-x-1/2 select-none"
                style={{ left: `${5 + i * 18}%` }}
              >
                {t.label}
              </span>
            ))}
          </div>
        </Card>

        {/* Weekly Dispatches (Bar Chart) */}
        <Card className="p-5 overflow-visible">
          <p className="mb-5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 transition-colors duration-200">
            Units dispatched weekly — last 6 weeks
          </p>
          
          <div className="relative w-full h-36">
            {/* HTML Grid Lines */}
            <div className="absolute inset-x-0 top-[10%] border-t border-slate-100 dark:border-slate-800/50 transition-colors duration-200" />
            <div className="absolute inset-x-0 top-[50%] border-t border-slate-100 dark:border-slate-800/50 transition-colors duration-200" />
            <div className="absolute inset-x-0 bottom-[10%] border-t border-slate-100 dark:border-slate-800/50 transition-colors duration-200" />

            {/* SVG Bar Chart */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              {mounted && weeklyTrend.map((w, i) => {
                const height = (w.volume / weeklyMax) * 80
                const xPos = 10 + i * 16 - 4 // center is 10 + i * 16, width is 8
                return (
                  <rect
                    key={`bar-${i}`}
                    x={xPos}
                    y={90 - height}
                    width={8}
                    height={height}
                    rx={2}
                    fill="#10b981"
                    fillOpacity={hoveredWeekIdx === i ? 1 : 0.85}
                    className="transition-all duration-300 ease-out"
                  />
                )
              })}
            </svg>

            {/* Hover tooltip */}
            {hoveredWeekIdx !== null && weeklyTrend[hoveredWeekIdx] && (
              <>
                <div
                  className="absolute top-[10%] bottom-[10%] bg-emerald-500/5 dark:bg-emerald-500/10 -translate-x-1/2 rounded-xl transition-all duration-150 ease-out pointer-events-none"
                  style={{
                    left: `${10 + hoveredWeekIdx * 16}%`,
                    width: '12%',
                  }}
                />

                <div
                  className="absolute pointer-events-none z-30 rounded-xl bg-slate-950/95 dark:bg-slate-900/95 border border-slate-800 dark:border-slate-700/80 px-3 py-1.5 text-xs text-white shadow-xl backdrop-blur-md transition-all duration-150 ease-out"
                  style={{
                    left: `${10 + hoveredWeekIdx * 16}%`,
                    top: `${90 - (weeklyTrend[hoveredWeekIdx].volume / weeklyMax) * 80}%`,
                    transform: 'translate(-50%, calc(-100% - 10px))',
                  }}
                >
                  <div className="font-semibold text-[9px] uppercase tracking-wider text-slate-400">
                    Week of {weeklyTrend[hoveredWeekIdx].label}
                  </div>
                  <div className="mt-0.5 text-[11px] font-bold text-emerald-400 whitespace-nowrap">
                    {weeklyTrend[hoveredWeekIdx].volume} {weeklyTrend[hoveredWeekIdx].volume === 1 ? 'unit' : 'units'}
                  </div>
                </div>
              </>
            )}

            {/* Values above bars */}
            {mounted && weeklyTrend.map((w, i) => (
              hoveredWeekIdx !== i && (
                <div
                  key={`wk-val-${i}`}
                  className="absolute -translate-x-1/2 -translate-y-5 text-[10px] font-bold text-slate-500 dark:text-slate-400 select-none pointer-events-none transition-colors duration-200"
                  style={{
                    left: `${10 + i * 16}%`,
                    top: `${90 - (w.volume / weeklyMax) * 80}%`
                  }}
                >
                  {w.volume}
                </div>
              )
            ))}

            {/* Interactive hover targets */}
            <div className="absolute inset-0">
              {weeklyTrend.map((_, i) => (
                <div
                  key={`wk-target-${i}`}
                  className="absolute top-0 bottom-0 cursor-pointer"
                  style={{
                    left: `${10 + i * 16}%`,
                    width: '16%',
                    transform: 'translateX(-50%)'
                  }}
                  onMouseEnter={() => setHoveredWeekIdx(i)}
                  onMouseLeave={() => setHoveredWeekIdx(null)}
                />
              ))}
            </div>
          </div>

          {/* X Axis Labels */}
          <div className="relative w-full h-5 mt-2">
            {weeklyTrend.map((w, i) => (
              <span
                key={`wk-label-${i}`}
                className="absolute text-[10px] font-semibold text-slate-400 dark:text-slate-500 tracking-wider -translate-x-1/2 select-none"
                style={{ left: `${10 + i * 16}%` }}
              >
                {w.label}
              </span>
            ))}
          </div>
        </Card>
      </div>

      {/* ── Recent activity + Low stock ── */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Recent activity */}
        <Card className="p-5">
          <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 before:block before:h-3 before:w-0.5 before:rounded-full before:bg-emerald-500 dark:before:bg-emerald-400 transition-colors duration-200">
            Recent activity
          </p>
          {recentActivity.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <span className="text-2xl">📦</span>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No orders placed yet. Start one to see your history here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800/50 transition-colors duration-200">
              {recentActivity.map(o => {
                const { label, tone } = lastActivityLabel(o)
                const dest = o.status === 'completed' ? '/factory/history' : '/factory/pending'
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => nav(dest, { state: { openId: o.id } })}
                      className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg px-1 -mx-1"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900 dark:text-slate-100 transition-colors duration-200">
                          {o.shopName}
                          {o.orderNumber ? (
                            <span className="ml-1.5 font-mono text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">
                              #{o.orderNumber}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">{formatDateTime(o.updatedAt)}</p>
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
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 transition-colors duration-200">
            Low stock alerts
            {lowStock.length > 0 && (
              <span className="ml-2 rounded-full bg-rose-500 px-1.5 py-0.5 text-xs font-bold leading-none text-white">
                {lowStock.length}
              </span>
            )}
          </p>
          {lowStock.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 transition-colors duration-200">
              <AlertTriangle className="h-4 w-4 text-slate-300 dark:text-slate-600 transition-colors duration-200" />
              All limited products are well-stocked.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800/50 transition-colors duration-200">
              {lowStock.map(p => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => nav('/factory/products', { state: { searchQuery: p.name } })}
                    className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg px-1 -mx-1"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900 dark:text-slate-100 transition-colors duration-200">
                        {p.stock <= 5 ? `⚠ Low stock: ${p.name}` : p.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">{p.size}</p>
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

      {/* ── Prioritized Production Backlog ── */}
      {outstanding.length > 0 && (
        <Card className="p-5">
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 before:block before:h-3 before:w-0.5 before:rounded-full before:bg-emerald-500 dark:before:bg-emerald-400 transition-colors duration-200">
              Prioritized Production Backlog
            </p>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
              Sorted by oldest pending request
            </span>
          </div>
          <div className="space-y-4">
            {outstanding.map(item => {
              const pct = Math.round((item.remaining / item.ordered) * 100)
              const isOverdue = item.oldestAgeDays > 5
              return (
                <div key={item.productId} className="space-y-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate transition-colors duration-200">
                      {item.name}{item.size ? ` · ${item.size}` : ''}
                    </span>
                    <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">
                      <span className="font-bold text-amber-600 dark:text-amber-500 tabular-nums">{item.remaining}</span> remaining of {item.ordered}
                    </span>
                  </div>
                  
                  <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 transition-colors duration-200">
                    <div
                      className="h-2 rounded-full bg-amber-400 transition-all duration-700"
                      style={{ width: mounted ? `${pct}%` : '0%' }}
                    />
                  </div>
                  
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${
                      isOverdue
                        ? 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20'
                        : 'bg-slate-50 text-slate-600 ring-slate-500/10 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700'
                    }`}>
                      Oldest order: {item.oldestAgeDays} {item.oldestAgeDays === 1 ? 'day' : 'days'} ago
                    </span>
                    <span className="inline-flex items-center rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 ring-1 ring-inset ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-500/20">
                      {item.shopsWaiting} {item.shopsWaiting === 1 ? 'shop' : 'shops'} waiting
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </motion.div>
  )
}