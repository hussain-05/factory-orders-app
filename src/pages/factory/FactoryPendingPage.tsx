import { ChevronDown, ChevronRight, Filter, Printer } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { previewOrderPdf } from '../../lib/downloadOrderPdf'
import { db } from '../../lib/firebase'
import { listPendingOrdersForFactory, updateOrderMilestones } from '../../lib/orderService'
import { whatsappLink } from '../../utils/whatsapp'
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

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current shrink-0">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
)

function OrderActions({ order }: { order: Order }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try { await previewOrderPdf(order) } finally { setBusy(false) }
        }}
      >
        <Printer className="h-4 w-4" />
        {busy ? 'Preparing…' : 'Print / PDF'}
      </Button>
    </div>
  )
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
            {o.orderNumber && (
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono font-semibold text-slate-600">#{o.orderNumber}</span>
            )}
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

          {/* Actions */}
          <OrderActions order={o} />

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
                  <span className="min-w-0 truncate text-slate-900">
                    {it.name}{it.size ? ` · ${it.size}` : ''}
                  </span>
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
  const [notifyBanner, setNotifyBanner] = useState<{ message: string; number: string } | null>(null)
  const [filterShop, setFilterShop] = useState<string>('all')
  const [filterRequestor, setFilterRequestor] = useState<string>('all')
  const [filterKind, setFilterKind] = useState<string>('all')
  const [filterOpen, setFilterOpen] = useState(false)
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

  const requestorOptions = useMemo(
    () => [...new Set(orders.map(o => o.requestorName).filter(Boolean))].sort(),
    [orders]
  )

  const grouped = useMemo(() => {
    const filtered = orders.filter(o => {
      if (filterShop !== 'all' && o.shopName !== filterShop) return false
      if (filterRequestor !== 'all' && o.requestorName !== filterRequestor) return false
      if (filterKind !== 'all' && o.orderKind !== filterKind) return false
      return true
    })
    const sorted = filtered.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    return groupByMonth(sorted)
  }, [orders, filterShop, filterRequestor, filterKind])

  const totalOrders = grouped.reduce((s, g) => s + g.orders.length, 0)
  const hasActiveFilters = filterShop !== 'all' || filterRequestor !== 'all' || filterKind !== 'all'

  async function patch(order: Order, p: Parameters<typeof updateOrderMilestones>[2]) {
    if (!db) return
    setBusyId(order.id)
    setError(null)
    try {
      await updateOrderMilestones(db, order.id, p)

      if (order.shopWhatsappNumber) {
        if (p.milestones?.receivedAt) {
          const dateStr = p.expectedDeliveryDate
            ? formatDate(typeof p.expectedDeliveryDate === 'number' ? p.expectedDeliveryDate : null)
            : 'TBD'
          setNotifyBanner({
            number: order.shopWhatsappNumber,
            message: `Hi ${order.requestorName}, your order ${order.orderNumber ? `#${order.orderNumber}` : ''} from ${order.shopName} has been received.\nExpected delivery: ${dateStr}.\nWe will notify you once dispatched.`,
          })
        } else if (p.status === 'completed') {
          setNotifyBanner({
            number: order.shopWhatsappNumber,
            message: `Hi ${order.requestorName}, your order number: ${order.orderNumber ?? ''} has been dispatched and will reach you shortly.`,
          })
        }
      }

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

      {/* ── Filter bar ── */}
      <div className="rounded-xl border border-slate-200 bg-slate-50">
        <button
          type="button"
          onClick={() => setFilterOpen(o => !o)}
          className="flex w-full items-center justify-between px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filters</span>
            {hasActiveFilters && (
              <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-xs font-semibold text-white leading-none">
                {[filterShop !== 'all', filterRequestor !== 'all', filterKind !== 'all'].filter(Boolean).length}
              </span>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
        </button>

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

            {hasActiveFilters && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => { setFilterShop('all'); setFilterRequestor('all'); setFilterKind('all') }}
                  className="text-xs font-medium text-rose-600 hover:text-rose-700"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        )}
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
      ) : orders.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">No pending orders. Nice and quiet.</p>
        </Card>
      ) : totalOrders === 0 ? (
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

      {/* WhatsApp notify banner */}
      {notifyBanner && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 w-max max-w-[calc(100vw-2rem)]">
          <div className="flex items-center gap-3 rounded-xl bg-slate-900 px-5 py-3 shadow-lg shadow-slate-900/20">
            <p className="text-sm font-semibold text-white">Notify the shop?</p>
            <a
              href={whatsappLink(notifyBanner.number, notifyBanner.message)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1ebe5d]"
            >
              <WhatsAppIcon />
              Send on WhatsApp
            </a>
            <button
              type="button"
              className="shrink-0 text-slate-400 hover:text-white"
              onClick={() => setNotifyBanner(null)}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}