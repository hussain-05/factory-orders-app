import { AlertTriangle, BarChart3, Clock, PackageCheck, Repeat, TrendingUp, Truck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { motion } from 'framer-motion'
import { addMonths, differenceInCalendarDays, format, startOfMonth } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useAdminMode } from '../../contexts/AdminModeContext'
import { useOrderDraft } from '../../contexts/OrderDraftContext'
import { db } from '../../lib/firebase'
import { subscribeOrdersForShop } from '../../lib/orderService'
import { subscribeLimitedProducts } from '../../lib/productService'
import { Badge } from '../../components/ui/Badge'
import { Card } from '../../components/ui/Card'
import { StatCardsSkeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../contexts/ToastContext'
import { triggerHaptic } from '../../utils/haptic'
import type { Order, OrderDispatch, LimitedProduct } from '../../types/models'
import { formatDateTime } from '../../utils/format'


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
  const map = new Map<string, { productId: string; name: string; size?: string; totalQty: number; orderCount: number }>()
  for (const o of orders) {
    for (const item of o.items) {
      const key = item.productId
      const existing = map.get(key)
      if (existing) {
        existing.totalQty += item.quantity
        existing.orderCount += 1
      } else {
        map.set(key, {
          productId: key,
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
  const allSent = o.items.every(it => it.notAvailable || (dispatched[it.productId] ?? 0) >= it.quantity)
  return allSent ? 'awaiting' : 'partial'
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

export function ShopDashboardPage() {
  const { user } = useAuth()
  const { shopView } = useAdminMode()
  const effectiveShopName = shopView
  const nav = useNavigate()
  const { showToast } = useToast()
  const { setStandardQty, setLimitedQty } = useOrderDraft()
  const [orders, setOrders] = useState<Order[]>([])
  const [limitedProducts, setLimitedProducts] = useState<LimitedProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  // Real-time subscriptions — re-subscribes whenever the active shop changes
  useEffect(() => {
    if (!db || !user) return
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

    const unsubOrders = subscribeOrdersForShop(
      db,
      effectiveShopName,
      (rows) => {
        setOrders(rows)
        ordersLoaded = true
        checkDone()
      },
      () => {
        setError('Could not load dashboard data.')
        setLoading(false)
      },
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
  }, [user, effectiveShopName])

  // ── derived metrics ──────────────────────────────────────────────────────

  const pending = useMemo(() => orders.filter(o => o.status === 'pending'), [orders])


  const stages = useMemo(() => ({
    placed:   pending.filter(o => !o.milestones.receivedAt).length,
    inProduction: pending.filter(o => o.milestones.receivedAt && orderDispatchStage(o) === 'new').length,
    partial:  pending.filter(o => orderDispatchStage(o) === 'partial').length,
    awaiting: pending.filter(o => orderDispatchStage(o) === 'awaiting').length,
  }), [pending])

  const pendingConfirmations = useMemo(() =>
    pending.reduce((count, o) =>
      count + (o.dispatches ?? []).reduce((c, d) =>
        c + d.items.filter(it => !it.confirmedAt).length, 0), 0),
    [pending]
  )

  const placedThisMonth = useMemo(() => {
    const start = startOfMonth(new Date()).getTime()
    return orders.filter(o => o.createdAt >= start).length
  }, [orders])

  const lastOrder = useMemo(() => {
    const mine = orders.filter(o => o.shopUserId === user?.uid)
    if (mine.length === 0) return null
    return mine.reduce((latest, o) => o.createdAt > latest.createdAt ? o : latest)
  }, [orders, user?.uid])

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

  // Factory Stock Scarcity Alerts (FOMO Board) - cross-reference shop frequent products
  const scarceProducts = useMemo(() => {
    const freq = topProducts(orders, 8)
    return limitedProducts.filter(lp => {
      const isFreq = freq.some(fp => fp.productId === lp.id || fp.name.trim().toLowerCase() === lp.name.trim().toLowerCase())
      return isFreq && lp.stock <= 10
    })
  }, [orders, limitedProducts])

  // Active Dispatches (In-Transit Tracker)
  const inTransitDispatches = useMemo(() => {
    const list: Array<{
      orderId: string
      orderNumber?: string
      dispatchIndex: number
      dispatchedAt: number
      itemCount: number
    }> = []
    for (const o of pending) {
      const dispatches = o.dispatches ?? []
      dispatches.forEach((d, idx) => {
        const hasUnconfirmed = d.items.some(it => !it.confirmedAt)
        if (d.dispatchedAt && hasUnconfirmed) {
          list.push({
            orderId: o.id,
            orderNumber: o.orderNumber,
            dispatchIndex: idx,
            dispatchedAt: d.dispatchedAt,
            itemCount: d.items.filter(it => !it.confirmedAt).length,
          })
        }
      })
    }
    return list.sort((a, b) => b.dispatchedAt - a.dispatchedAt)
  }, [pending])

  // Smart Reorder Engine (Auto-Replenish Recommendation) — Checks top 3 products not ordered in last 7 days
  const smartRecommendations = useMemo(() => {
    const top3 = topProducts(orders, 3)
    const now = Date.now()
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000

    const recommendations: Array<{
      productId: string
      name: string
      size?: string
      lastOrderedAt: number | null
      daysSinceLastOrder: number | null
    }> = []

    for (const tp of top3) {
      let latestTime: number | null = null
      for (const o of orders) {
        const hasProduct = o.items.some(it => it.productId === tp.productId)
        if (hasProduct && o.createdAt) {
          if (latestTime === null || o.createdAt > latestTime) {
            latestTime = o.createdAt
          }
        }
      }

      const daysSince = latestTime ? differenceInCalendarDays(new Date(), new Date(latestTime)) : null

      if (latestTime === null || latestTime < sevenDaysAgo) {
        recommendations.push({
          productId: tp.productId,
          name: tp.name,
          size: tp.size,
          lastOrderedAt: latestTime,
          daysSinceLastOrder: daysSince,
        })
      }
    }
    return recommendations
  }, [orders])

  const handleReorder = (productId: string, name: string, isLimited: boolean) => {
    triggerHaptic('light')
    if (isLimited) {
      setLimitedQty(productId, 1)
      showToast(`Added ${name} to limited stock order draft!`, 'success')
      nav('/shop/available')
    } else {
      setStandardQty(productId, 1)
      showToast(`Added ${name} to standard catalogue draft!`, 'success')
      nav('/shop/new-order')
    }
  }

  // ── render ───────────────────────────────────────────────────────────────

  if (loading) {
    return <StatCardsSkeleton count={5} />
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
            Your order activity, delivery pipeline, and frequently ordered products at a glance.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Live
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 px-4 py-3 ring-1 ring-rose-200 dark:ring-rose-800/50">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <p className="text-sm text-rose-800 dark:text-rose-300">{error}
        </p>
        </div>
      )}

      {/* Proactive Actions & Alerts */}
      {(scarceProducts.length > 0 || inTransitDispatches.length > 0 || smartRecommendations.length > 0) && (
        <div className="space-y-6">
          {/* FOMO Stock Scarcity alerts */}
          {scarceProducts.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-500 dark:text-rose-400 transition-colors duration-200">
                  Factory Stock Scarcity Alerts
                </p>
                {scarceProducts.length > 2 && (
                  <span className="text-[10px] bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold px-2 py-0.5 rounded-full">
                    {scarceProducts.length} items
                  </span>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {scarceProducts.slice(0, 2).map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => nav('/shop/available', { state: { searchQuery: p.name } })}
                    className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/50 p-4 text-left dark:border-rose-900/30 dark:bg-rose-950/20 transition hover:shadow-md hover:ring-1 hover:ring-rose-300 dark:hover:ring-rose-800/50 w-full"
                  >
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400 animate-pulse" />
                    <div>
                      <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                        Only {p.stock} left in factory
                      </p>
                      <p className="mt-0.5 text-xs text-rose-700 dark:text-rose-400">
                        {p.name} {p.size ? `(${p.size})` : ''}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
              {scarceProducts.length > 2 && (
                <button
                  type="button"
                  onClick={() => nav('/shop/available')}
                  className="w-full text-center text-xs font-semibold text-rose-700 dark:text-rose-400 hover:underline py-1 transition-colors"
                >
                  + {scarceProducts.length - 2} more low-stock alert{scarceProducts.length - 2 === 1 ? '' : 's'}. View & restock all →
                </button>
              )}
            </motion.div>
          )}

          {/* Active Dispatches */}
          {inTransitDispatches.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 before:block before:h-3 before:w-0.5 before:rounded-full before:bg-amber-500 dark:before:bg-amber-400 transition-colors duration-200">
                    Active Dispatches (In-Transit)
                  </p>
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400 transition-colors duration-200">
                    {inTransitDispatches.length} shipment{inTransitDispatches.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {inTransitDispatches.slice(0, 4).map(d => (
                    <div
                      key={`${d.orderId}-${d.dispatchIndex}`}
                      className="flex flex-col justify-between rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800/50 dark:bg-slate-900/40 transition hover:shadow-sm hover:ring-1 hover:ring-amber-500/20"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Truck className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400 shrink-0 animate-pulse" />
                          <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                            {d.orderNumber ? `#${d.orderNumber}` : 'Shipment'}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 transition-colors duration-200">
                          Sent {format(d.dispatchedAt, 'dd MMM, HH:mm')}
                        </p>
                        <p className="text-[11px] font-medium text-slate-700 dark:text-slate-300 transition-colors duration-200">
                          <span className="font-bold text-amber-600 dark:text-amber-500">{d.itemCount}</span> items
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => nav('/shop/history', { state: { openId: d.orderId, filterAwaiting: true } })}
                        className="mt-3 w-full rounded-lg bg-amber-600 dark:bg-amber-500 py-1.5 text-center text-[10px] font-semibold text-white shadow-sm hover:opacity-90 transition shrink-0"
                      >
                        Confirm Receipt
                      </button>
                    </div>
                  ))}
                </div>

                {inTransitDispatches.length > 4 && (
                  <div className="mt-4 border-t border-slate-100 dark:border-slate-800/50 pt-3 text-center">
                    <button
                      type="button"
                      onClick={() => nav('/shop/history', { state: { filterAwaiting: true } })}
                      className="text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline transition-colors"
                    >
                      + {inTransitDispatches.length - 4} more shipment{inTransitDispatches.length - 4 === 1 ? '' : 's'} in transit. View & confirm all →
                    </button>
                  </div>
                )}
              </Card>
            </motion.div>
          )}

          {/* Smart Reorder Engine */}
          {smartRecommendations.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-500 dark:text-emerald-400 transition-colors duration-200">
                Smart Reorder Recommendations
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {smartRecommendations.map(rec => {
                  const isLimited = limitedProducts.some(lp => lp.id === rec.productId);
                  return (
                    <div
                      key={rec.productId}
                      className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-100 bg-white dark:border-slate-800/50 dark:bg-slate-900 p-4 shadow-sm transition-colors duration-200"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <Repeat className="h-4 w-4" />
                          </div>
                          <Badge tone={isLimited ? 'warning' : 'neutral'}>
                            {isLimited ? 'Limited' : 'Catalogue'}
                          </Badge>
                        </div>
                        <div className="mt-3">
                          <p className="text-sm font-semibold text-slate-950 dark:text-slate-50 line-clamp-1">
                            {rec.name}
                          </p>
                          {rec.size && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              Size: {rec.size}
                            </p>
                          )}
                          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                            {rec.daysSinceLastOrder !== null
                              ? `It has been ${rec.daysSinceLastOrder} days since your last order of this product.`
                              : 'You order this frequently but haven\'t ordered it recently.'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleReorder(rec.productId, rec.name, isLimited)}
                        className="w-full rounded-xl bg-emerald-600 dark:bg-emerald-500 py-2 text-center text-xs font-semibold text-white shadow-sm hover:opacity-90 transition"
                      >
                        Reorder Now
                      </button>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 items-stretch">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0, ease: [0.25, 0.1, 0.25, 1] }} className="flex w-full">
          <StatCard
            label="Last order"
            value={lastOrder ? format(new Date(lastOrder.createdAt), 'dd MMM') : '—'}
            sub={lastOrder ? format(new Date(lastOrder.createdAt), 'yyyy') : 'No orders yet'}
            icon={<BarChart3 className="h-5 w-5" />}
            tone="indigo"
            onClick={lastOrder ? () => nav('/shop/history', { state: { openId: lastOrder.id } }) : undefined}
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.06, ease: [0.25, 0.1, 0.25, 1] }} className="flex w-full">
          <StatCard
            label="Active orders"
            value={pending.length}
            sub={pending.length === 0 ? 'All clear' : [
              stages.placed > 0 && `${stages.placed} placed`,
              stages.inProduction > 0 && `${stages.inProduction} in prod`,
              stages.partial > 0 && `${stages.partial} partial`,
              stages.awaiting > 0 && `${stages.awaiting} awaiting`,
              pendingConfirmations > 0 && `${pendingConfirmations} to confirm`,
            ].filter(Boolean).join(' · ')}
            icon={<PackageCheck className="h-5 w-5" />}
            tone={pending.length > 0 ? 'rose' : 'violet'}
            onClick={() => nav('/shop/history')}
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.12, ease: [0.25, 0.1, 0.25, 1] }} className="flex w-full">
          <StatCard
            label="Avg delivery time"
            value={avgLead != null ? `${avgLead}d` : '—'}
            sub="order placed → delivered"
            icon={<Clock className="h-5 w-5" />}
            tone="emerald"
          />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.18, ease: [0.25, 0.1, 0.25, 1] }} className="flex w-full">
          <StatCard
            label="Placed this month"
            value={placedThisMonth}
            sub={`${orders.length} all time`}
            icon={<TrendingUp className="h-5 w-5" />}
            tone="sky"
            onClick={() => nav('/shop/history')}
          />
        </motion.div>
      </div>

      {/* ── Pipeline + order type split ── */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* My pending pipeline */}
        <Card className="p-5">
          <p className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 before:block before:h-3 before:w-0.5 before:rounded-full before:bg-emerald-500 dark:before:bg-emerald-400 transition-colors duration-200">
            My pending pipeline
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
                onClick={() => nav('/shop/history')}
              />
              <span className="mt-4 shrink-0 text-slate-300 dark:text-slate-600 transition-colors duration-200">→</span>
              <PipelineStage
                label="In production"
                count={stages.inProduction}
                total={pending.length}
                color="bg-amber-400"
                onClick={() => nav('/shop/history')}
              />
              <span className="mt-4 shrink-0 text-slate-300 dark:text-slate-600 transition-colors duration-200">→</span>
              <PipelineStage
                label="Partially dispatched"
                count={stages.partial}
                total={pending.length}
                color="bg-orange-400"
                onClick={() => nav('/shop/history')}
              />
              <span className="mt-4 shrink-0 text-slate-300 dark:text-slate-600 transition-colors duration-200">→</span>
              <PipelineStage
                label="Awaiting confirmation"
                count={stages.awaiting}
                total={pending.length}
                color="bg-emerald-500"
                onClick={() => nav('/shop/history')}
              />
            </div>
          )}
        </Card>

        {/* Order type split */}
        <Card className="p-5">
          <p className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 before:block before:h-3 before:w-0.5 before:rounded-full before:bg-emerald-500 dark:before:bg-emerald-400 transition-colors duration-200">
            Order type split
          </p>
          {orders.length === 0 ? (
            <EmptyState
              title="No orders placed yet"
              description="Start a new order to see your standard vs limited catalog breakdown."
              variant="warehouse"
            />
          ) : (
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300 transition-colors duration-200">Standard catalogue</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">
                    {orderTypeSplit.standard} orders · {orderTypeSplit.standardPct}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 transition-colors duration-200">
                  <div
                    className="h-2 rounded-full bg-violet-500 transition-all duration-700"
                    style={{ width: mounted ? `${orderTypeSplit.standardPct}%` : '0%' }}
                  />
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300 transition-colors duration-200">Limited stock</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">
                    {orderTypeSplit.limited} orders · {orderTypeSplit.limitedPct}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 transition-colors duration-200">
                  <div
                    className="h-2 rounded-full bg-emerald-500 transition-all duration-700"
                    style={{ width: mounted ? `${orderTypeSplit.limitedPct}%` : '0%' }}
                  />
                </div>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 pt-1 transition-colors duration-200">{orders.length} total orders</p>
            </div>
          )}
        </Card>
      </div>

      {/* ── Monthly trend ── */}
      <Card className="p-5 overflow-visible">
        <p className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 before:block before:h-3 before:w-0.5 before:rounded-full before:bg-emerald-500 dark:before:bg-emerald-400 transition-colors duration-200">
          My orders — last 6 months
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
                  ${trend.map((t, i) => `L ${5 + i * 18},${90 - (t.count / trendMax) * 80}`).join(' ')}
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
                d={trend.map((t, i) => `${i === 0 ? 'M' : 'L'} ${5 + i * 18},${90 - (t.count / trendMax) * 80}`).join(' ')}
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
                  top: `${90 - (trend[hoveredIdx].count / trendMax) * 80}%`
                }}
              />

              {/* Tooltip */}
              <div
                className="absolute pointer-events-none z-30 rounded-xl bg-slate-950/95 dark:bg-slate-900/95 border border-slate-800 dark:border-slate-700/80 px-3 py-1.5 text-xs text-white shadow-xl backdrop-blur-md transition-all duration-150 ease-out"
                style={{
                  left: `${5 + hoveredIdx * 18}%`,
                  top: `${90 - (trend[hoveredIdx].count / trendMax) * 80}%`,
                  transform: 'translate(-50%, calc(-100% - 10px))',
                }}
              >
                <div className="font-semibold text-[9px] uppercase tracking-wider text-slate-400">
                  {trend[hoveredIdx].label}
                </div>
                <div className="mt-0.5 text-[11px] font-bold text-emerald-400 whitespace-nowrap">
                  {trend[hoveredIdx].count} {trend[hoveredIdx].count === 1 ? 'order' : 'orders'}
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
                  top: `${90 - (t.count / trendMax) * 80}%`
                }}
              >
                {t.count}
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

        {/* X-Axis labels in pure HTML (never stretches) */}
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

      {/* ── Recent orders + Frequently ordered ── */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Recent orders */}
        <Card className="p-5">
          <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 before:block before:h-3 before:w-0.5 before:rounded-full before:bg-emerald-500 dark:before:bg-emerald-400 transition-colors duration-200">
            Recent orders
          </p>
          {recentOrders.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <span className="text-2xl">📦</span>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No orders placed yet. Start one to see your history here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800/50 transition-colors duration-200">
              {recentOrders.map(o => {
                const { label, tone } = orderStatusLabel(o)
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => nav('/shop/history', { state: { openId: o.id } })}
                      className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg px-1 -mx-1"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900 dark:text-slate-100 transition-colors duration-200">
                          {o.orderKind === 'limited' ? 'Limited stock' : 'Standard catalogue'}
                          {o.orderNumber ? (
                            <span className="ml-1.5 font-mono text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">
                              #{o.orderNumber}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">
                          {formatDateTime(o.createdAt)} · {o.items.length} line{o.items.length === 1 ? '' : 's'}
                        </p>
                      </div>
                      <Badge tone={tone}>{label}</Badge>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* Frequently ordered products */}
        <Card className="p-5">
          <p className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 before:block before:h-3 before:w-0.5 before:rounded-full before:bg-emerald-500 dark:before:bg-emerald-400 transition-colors duration-200">
            <Repeat className="h-3.5 w-3.5" />
            Frequently ordered
          </p>
          {frequentProducts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <span className="text-2xl">📊</span>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Your frequently ordered products will appear here.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {frequentProducts.map((p, i) => (
                <li key={i} className="text-sm">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-medium text-slate-800 dark:text-slate-200 transition-colors duration-200 truncate">
                      {p.name}{p.size ? ` · ${p.size}` : ''}
                    </span>
                    <span className="ml-3 shrink-0 text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">
                      ×{p.totalQty} across {p.orderCount} order{p.orderCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 transition-colors duration-200">
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
    </motion.div>
  )
}