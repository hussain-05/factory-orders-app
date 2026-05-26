import { ChevronDown, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { db } from '../../lib/firebase'
import { listPendingOrdersForFactory, updateOrderMilestones } from '../../lib/orderService'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import type { Order } from '../../types/models'
import { formatDate, formatDateTime } from '../../utils/format'

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

function groupByMonth(orders: Order[]): Array<{ label: string; orders: Order[] }> {
  const map = new Map<string, Order[]>()
  for (const o of orders) {
    const label = o.createdAt ? format(new Date(o.createdAt), 'MMMM yyyy') : 'Unknown'
    if (!map.has(label)) map.set(label, [])
    map.get(label)!.push(o)
  }
  return Array.from(map.entries()).map(([label, orders]) => ({ label, orders }))
}

function currentStageLabel(o: Order): string {
  if (o.milestones.dispatchedAt) return 'Awaiting delivery'
  if (o.milestones.receivedAt) return 'In production'
  return 'Order placed'
}

interface PendingCardProps {
  order: Order
  open: boolean
  onToggle: () => void
  busy: boolean
  expectedDraft: string
  actualDraft: string
  onExpectedChange: (v: string) => void
  onActualChange: (v: string) => void
  onPatch: (patch: Parameters<typeof updateOrderMilestones>[2]) => void
}

function PendingCard({
  order: o,
  open,
  onToggle,
  busy,
  expectedDraft,
  actualDraft,
  onExpectedChange,
  onActualChange,
  onPatch,
}: PendingCardProps) {
  return (
    <Card className="p-0">
      {/* ── Collapsed header ── */}
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        onClick={onToggle}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-base font-semibold text-slate-900">{o.shopName}</p>
            <Badge tone="neutral">{o.orderKind === 'limited' ? 'Limited' : 'Standard'}</Badge>
            <Badge tone="warning">{currentStageLabel(o)}</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {formatDateTime(o.createdAt)} · {o.items.length} line{o.items.length === 1 ? '' : 's'} · {o.requestorName}
          </p>
        </div>
        {open
          ? <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
          : <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
        }
      </button>

      {/* ── Expanded body ── */}
      {open && (
        <div className="border-t border-slate-100 px-5 py-5 space-y-5">

          {/* Interactive timeline */}
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Order progress
            </p>

            {/* Stage 1: Placed */}
            <TimelineStage
              done={true}
              isLast={false}
              nextDone={Boolean(o.milestones.receivedAt)}
              dot="check"
              label="Order placed"
              timestamp={formatDateTime(o.createdAt)}
              sub={`${o.requestorName} · ${o.requestorEmail}`}
            />

            {/* Stage 2: Received */}
            <TimelineStage
              done={Boolean(o.milestones.receivedAt)}
              isLast={false}
              nextDone={false}
              dot={o.milestones.receivedAt ? 'check' : 'empty'}
              label="Received by factory"
              timestamp={o.milestones.receivedAt ? formatDateTime(o.milestones.receivedAt) : undefined}
            >
              {!o.milestones.receivedAt && (
                <div className="mt-2 space-y-2">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Expected delivery date (required)</p>
                    <div className="flex items-center gap-2">
                      <Input
                        type="date"
                        className="!py-1 !text-xs"
                        value={expectedDraft}
                        onChange={(e) => onExpectedChange(e.target.value)}
                        disabled={busy}
                      />
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    className="!py-1.5 !text-xs"
                    disabled={busy || !expectedDraft}
                    onClick={() =>
                      onPatch({
                        milestones: { receivedAt: Date.now() },
                        expectedDeliveryDate: ymdToMillis(expectedDraft),
                      })
                    }
                  >
                    Mark received
                  </Button>
                </div>
              )}
              {o.milestones.receivedAt && o.expectedDeliveryDate && (
                <p className="mt-1 text-xs text-slate-500">
                  Expected delivery: {formatDate(o.expectedDeliveryDate)}
                </p>
              )}
            </TimelineStage>

            {/* Stage 3: Delivered */}
            <TimelineStage
              done={false}
              isLast={true}
              nextDone={false}
              dot="empty"
              label="Delivered"
              timestamp={undefined}
            >
              <div className="mt-2 space-y-2">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Actual delivery date (required to complete)</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="date"
                      className="!py-1 !text-xs"
                      value={actualDraft}
                      onChange={(e) => onActualChange(e.target.value)}
                      disabled={busy}
                    />
                    <Button
                      className="!py-1.5 !text-xs shrink-0 bg-slate-900 hover:bg-slate-800 text-white"
                      disabled={busy || !actualDraft}
                      onClick={() =>
                        onPatch({ status: 'completed', actualDeliveryDate: ymdToMillis(actualDraft) })
                      }
                    >
                      {busy ? 'Saving…' : 'Complete'}
                    </Button>
                  </div>
                </div>
              </div>
            </TimelineStage>
          </div>

          {/* Line items */}
          <details className="rounded-xl border border-slate-100 bg-slate-50">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">
              Line items ({o.items.length})
            </summary>
            <ul className="divide-y divide-slate-200 px-4 pb-3">
              {o.items.map((it, idx) => (
                <li
                  key={`${it.productId}-${idx}`}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate text-slate-900">{it.name}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                    ×{it.quantity}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </Card>
  )
}

interface TimelineStageProps {
  done: boolean
  isLast: boolean
  nextDone: boolean
  dot: 'check' | 'empty'
  label: string
  timestamp?: string
  sub?: string
  children?: React.ReactNode
}

function TimelineStage({ done, isLast, nextDone, dot, label, timestamp, sub, children }: TimelineStageProps) {
  return (
    <div className="flex gap-3">
      {/* Dot + connector */}
      <div className="flex flex-col items-center">
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
            done ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 bg-white'
          }`}
        >
          {dot === 'check' ? (
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
            className={`my-1 w-0.5 flex-1 min-h-[20px] ${nextDone ? 'bg-emerald-400' : 'bg-slate-200'}`}
          />
        )}
      </div>

      {/* Content */}
      <div className={`pb-4 min-w-0 flex-1 ${isLast ? 'pb-0' : ''}`}>
        <p className={`text-sm font-semibold leading-7 ${done ? 'text-slate-900' : 'text-slate-400'}`}>
          {label}
        </p>
        {timestamp && <p className="text-xs text-emerald-600">{timestamp}</p>}
        {sub && <p className="text-xs text-slate-500">{sub}</p>}
        {!timestamp && !children && <p className="text-xs text-slate-400">Pending</p>}
        {children}
      </div>
    </div>
  )
}

export function FactoryPendingPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
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
    queueMicrotask(() => { void refresh() })
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

  const grouped = useMemo(() => {
    const sorted = [...orders].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    return groupByMonth(sorted)
  }, [orders])

  const totalOrders = grouped.reduce((s, g) => s + g.orders.length, 0)

  async function patch(order: Order, p: Parameters<typeof updateOrderMilestones>[2]) {
    if (!db) return
    setBusyId(order.id)
    setError(null)
    try {
      await updateOrderMilestones(db, order.id, p)
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
            Track each order from receipt through dispatch, set delivery dates, and close the loop when the shipment lands.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void refresh()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
          Loading…
        </div>
      ) : totalOrders === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">No pending orders. Nice and quiet.</p>
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
                {groupOrders.map((o) => (
                  <PendingCard
                    key={o.id}
                    order={o}
                    open={openId === o.id}
                    onToggle={() => setOpenId(openId === o.id ? null : o.id)}
                    busy={busyId === o.id}
                    expectedDraft={expectedDraft[o.id] ?? ''}
                    actualDraft={actualDraft[o.id] ?? ''}
                    onExpectedChange={(v) => setExpectedDraft((p) => ({ ...p, [o.id]: v }))}
                    onActualChange={(v) => setActualDraft((p) => ({ ...p, [o.id]: v }))}
                    onPatch={(p) => void patch(o, p)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}