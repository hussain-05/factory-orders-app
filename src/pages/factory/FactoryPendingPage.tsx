import { ChevronDown, ChevronRight, Filter, Printer, Search, Trash2 } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { useLocation } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useAuth } from '../../contexts/AuthContext'
import { previewOrderPdf } from '../../lib/downloadOrderPdf'
import { db } from '../../lib/firebase'
import { useUsersMap } from '../../hooks/useUsersMap'
import { addDispatch, deleteOrder, listPendingOrdersForFactory, updateOrderMilestones } from '../../lib/orderService'
import { whatsappLink } from '../../utils/whatsapp'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import type { Order, OrderDispatch } from '../../types/models'
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

// ─── Dispatch helpers ─────────────────────────────────────────────────────

function dispatchedQtyByProduct(dispatches: OrderDispatch[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const d of dispatches) {
    for (const it of d.items) {
      map[it.productId] = (map[it.productId] ?? 0) + it.qty
    }
  }
  return map
}

interface PendingCardProps {
  order: Order
  id: string
  open: boolean
  onToggle: () => void
  busy: boolean
  expectedDraft: string
  onExpectedChange: (v: string) => void
  onPatch: (patch: Parameters<typeof updateOrderMilestones>[2]) => void
  onAddDispatch: (items: OrderDispatch['items'], naUpdates?: Record<string, boolean>) => void
  dispatchFormOpen: boolean
  onToggleDispatchForm: (open: boolean) => void
}

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current shrink-0">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
)

function OrderActions({ order, onRefresh }: { order: Order, onRefresh?: () => void }) {
  const [busy, setBusy] = useState(false)
  const { profile } = useAuth()
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null)

  return (
    <>
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
          {busy ? 'Preparing…' : 'Print'}
        </Button>
        {profile?.isAdmin && (
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => setDeleteTarget(order)}
          >
            <Trash2 className="h-4 w-4" />
            Delete order
          </Button>
        )}
      </div>

      <Modal
        open={Boolean(deleteTarget)}
        title="Delete order?"
        onClose={() => { if (!busy) setDeleteTarget(null) }}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setDeleteTarget(null)}
            >
              Keep order
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                if (!db || !deleteTarget) return
                setBusy(true)
                try {
                  await deleteOrder(db, deleteTarget.id)
                  setDeleteTarget(null)
                  onRefresh?.()
                } catch (_e) {
                  alert('Failed to delete order.')
                  setDeleteTarget(null)
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? 'Deleting…' : 'Yes, delete'}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-700 dark:text-slate-300 transition-colors duration-200">
          This will permanently remove the order placed on{' '}
          <span className="font-semibold">
            {formatDateTime(deleteTarget?.createdAt)}
          </span>{' '}
          with {deleteTarget?.items.length} line{deleteTarget?.items.length === 1 ? '' : 's'}.
        </p>
      </Modal>
    </>
  )
}

// ─── Dispatch form ────────────────────────────────────────────────────────

function DispatchForm({
  order,
  dispatchedQty,
  busy,
  onSubmit,
  onCancel,
  showNaToggle,
}: {
  order: Order
  dispatchedQty: Record<string, number>
  busy: boolean
  onSubmit: (items: OrderDispatch['items'], naUpdates?: Record<string, boolean>) => void
  onCancel: () => void
  showNaToggle?: boolean
}) {
  const remainingItems = order.items.filter(
    it => (it.quantity - (dispatchedQty[it.productId] ?? 0)) > 0,
  )

  const [localNa, setLocalNa] = useState<Record<string, boolean>>({})

  const [draft, setDraft] = useState<Record<string, number>>(() => {
    const r: Record<string, number> = {}
    for (const it of remainingItems) {
      r[it.productId] = it.quantity - (dispatchedQty[it.productId] ?? 0)
    }
    return r
  })

  const handleSubmit = () => {
    const items: OrderDispatch['items'] = remainingItems
      .filter(it => {
        const isNa = localNa[it.productId] ?? it.notAvailable
        return !isNa && (draft[it.productId] ?? 0) > 0
      })
      .map(it => ({
        productId: it.productId,
        name: it.name,
        size: it.size,
        qty: draft[it.productId] ?? 0,
      }))

    // Check if there are any NA updates or items to dispatch
    const hasNaUpdates = Object.keys(localNa).length > 0
    if (items.length === 0 && !hasNaUpdates) return

    onSubmit(items, Object.keys(localNa).length > 0 ? localNa : undefined)
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/50 p-3 space-y-3 transition-colors duration-200">
      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200">New dispatch</p>
      <div className="space-y-2">
        {remainingItems.map(it => {
          const remaining = it.quantity - (dispatchedQty[it.productId] ?? 0)
          const isNa = localNa[it.productId] ?? it.notAvailable
          return (
            <div key={it.productId} className="flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0">
                <p className={`font-medium truncate ${isNa ? 'text-slate-400 dark:text-slate-500 line-through transition-colors duration-200' : 'text-slate-800 dark:text-slate-200 transition-colors duration-200'}`}>
                  {it.name}{it.size ? ` · ${it.size}` : ''}
                </p>
                <p className="text-slate-400 dark:text-slate-500 transition-colors duration-200">
                  Ordered {it.quantity} · {dispatchedQty[it.productId] ?? 0} already sent · {remaining} remaining
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {showNaToggle && (
                  <button
                    type="button"
                    onClick={() => setLocalNa(prev => ({ ...prev, [it.productId]: !isNa }))}
                    disabled={busy || order.status === 'completed'}
                    className={`flex h-7 w-7 items-center justify-center rounded border ${ isNa ? 'border-emerald-600 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border-rose-600 bg-rose-50 text-rose-700 hover:bg-rose-100' } disabled:opacity-50`}
                    title={isNa ? 'Mark Available' : 'Mark Not Available'}
                  >
                    <span className="text-[10px] font-bold">{isNa ? 'A' : 'NA'}</span>
                  </button>
                )}
                <Input
                  type="number"
                  min={0}
                  max={remaining}
                  value={isNa ? 0 : (draft[it.productId] ?? 0)}
                  onChange={e => setDraft(prev => ({
                    ...prev,
                    [it.productId]: Math.min(remaining, Math.max(0, Number(e.target.value))),
                  }))}
                  onFocus={e => e.target.select()}
                  disabled={busy || isNa}
                  className="!w-20 !py-1 !text-xs"
                />
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="!py-1.5 !text-xs"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button
          className="!py-1.5 !text-xs bg-slate-900 hover:bg-slate-800 text-white"
          onClick={handleSubmit}
          disabled={busy || (remainingItems.every(it => (localNa[it.productId] ?? it.notAvailable) || (draft[it.productId] ?? 0) === 0) && Object.keys(localNa).length === 0)}
        >
          {busy ? 'Saving…' : 'Dispatch'}
        </Button>
      </div>
    </div>
  )
}

function PendingCard({
  order: o,
  id,
  open,
  onToggle,
  busy,
  expectedDraft,
  onExpectedChange,
  onPatch,
  onAddDispatch,
  dispatchFormOpen,
  onToggleDispatchForm,
}: PendingCardProps) {
  const dispatches = o.dispatches ?? []
  const dispatchedQty = dispatchedQtyByProduct(dispatches)
  const allDispatched = o.items.every(it => (dispatchedQty[it.productId] ?? 0) >= it.quantity)
  const allReceived = dispatches.length > 0 && dispatches.every(d => d.items.every(it => it.confirmedAt))
  return (
    <Card id={id} className="p-0">
      {/* ── Collapsed header ── */}
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={onToggle}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 transition-colors duration-200">{o.shopName}</p>
            {o.orderNumber && (
              <span className="rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-mono font-semibold text-slate-600 dark:text-slate-400 transition-colors duration-200">#{o.orderNumber}</span>
            )}
            <Badge tone="neutral">{o.orderKind === 'limited' ? 'Limited' : 'Standard'}</Badge>
            <Badge tone="warning">{currentStageLabel(o)}</Badge>
            {o.requestorName && (
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
                {o.requestorName.split(' ')[0]}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">
            {formatDateTime(o.createdAt)} · {o.items.length} line{o.items.length === 1 ? '' : 's'} · {o.requestorName}
          </p>
        </div>
        {open
          ? <ChevronDown className="h-5 w-5 shrink-0 text-slate-400 dark:text-slate-500 transition-colors duration-200" />
          : <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 dark:text-slate-500 transition-colors duration-200" />
        }
      </button>

      {/* ── Expanded body ── */}
      {open && (
        <div className="border-t border-slate-100 dark:border-slate-800/50 px-4 py-4 space-y-4 transition-colors duration-200">

          {/* Interactive timeline */}
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 transition-colors duration-200">
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
                    <label htmlFor={`expected-delivery-date-${o.id}`} className="block cursor-pointer text-xs text-slate-500 dark:text-slate-400 mb-1 transition-colors duration-200">Expected delivery date (required)</label>
                    <div className="flex items-center gap-2">
                      <Input
                        id={`expected-delivery-date-${o.id}`}
                        type="date"
                        className="!py-1 !text-xs [color-scheme:light] dark:[color-scheme:dark]"
                        value={expectedDraft}
                        onChange={(e) => onExpectedChange(e.target.value)}
                        onClick={(e) => {
                          const target = e.target as HTMLInputElement;
                          if (target.showPicker) target.showPicker();
                        }}
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
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">
                  Expected delivery: {formatDate(o.expectedDeliveryDate)}
                </p>
              )}
            </TimelineStage>

            {/* Stage 3: Dispatches */}
            <TimelineStage
              done={allReceived}
              isLast={true}
              nextDone={false}
              dot={allReceived ? 'check' : 'empty'}
              label="Dispatches"
              timestamp={undefined}
            >
              {!o.milestones.receivedAt ? (
                <p className="mt-2 text-xs text-slate-400 dark:text-slate-500 italic transition-colors duration-200">Mark order as received first.</p>
              ) : (
                <div className="mt-2 space-y-3">

                  {/* Existing dispatches */}
                  {dispatches.map((d, i) => (
                    <div key={d.id} className="rounded-lg border border-slate-200 dark:border-slate-800/50 bg-white dark:bg-slate-900 transition-colors duration-200 p-3 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200">
                          Dispatch {i + 1} · {format(d.dispatchedAt, 'dd MMM yyyy')}
                        </span>
                        {d.receivedAt
                          ? <span className="text-emerald-600 font-medium">✓ All confirmed</span>
                          : <span className="text-amber-600 font-medium">⏳ Awaiting confirmation</span>
                        }
                      </div>
                      {d.items.map(it => (
                        <div key={it.productId} className="flex justify-between text-slate-600 dark:text-slate-400 transition-colors duration-200">
                          <span>{it.name}{it.size ? ` · ${it.size}` : ''}</span>
                          <span className="flex items-center gap-2">
                            <span className="font-semibold tabular-nums">×{it.qty}</span>
                            {it.confirmedAt
                              ? <span className="text-emerald-600">✓ {format(it.confirmedAt, 'dd MMM')}</span>
                              : <span className="text-amber-500">⏳</span>
                            }
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}

                  {/* Fulfillment progress */}
                  {dispatches.length > 0 && (
                    <div className="rounded-lg border border-slate-100 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/50 p-3 space-y-1.5 transition-colors duration-200">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2 transition-colors duration-200">Fulfillment</p>
                      {o.items.map(it => {
                        const sent = dispatchedQty[it.productId] ?? 0
                        const full = sent >= it.quantity
                        return (
                          <div key={it.productId} className="flex items-center justify-between text-xs">
                            <span className="text-slate-600 dark:text-slate-400 truncate transition-colors duration-200">{it.name}{it.size ? ` · ${it.size}` : ''}</span>
                            <span className={`ml-3 shrink-0 font-semibold tabular-nums ${full ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {sent}/{it.quantity} {full ? '✓' : 'remaining'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* All dispatched, awaiting shop confirmation */}
                  {allDispatched && !allReceived && (
                    <p className="text-xs text-amber-600 font-medium">
                      All items dispatched · awaiting shop confirmation
                    </p>
                  )}

                  {/* Add dispatch form */}
                  {!allDispatched && (
                    dispatchFormOpen ? (
                      <DispatchForm
                        order={o}
                        dispatchedQty={dispatchedQty}
                        busy={busy}
                        onSubmit={(items, naUpdates) => {
                          onToggleDispatchForm(false)
                          onAddDispatch(items, naUpdates)
                        }}
                        onCancel={() => onToggleDispatchForm(false)}
                        showNaToggle={o.orderKind === 'unlimited'}
                      />
                    ) : (
                      <Button
                        variant="secondary"
                        className="!py-1.5 !text-xs"
                        onClick={() => onToggleDispatchForm(true)}
                        disabled={busy}
                      >
                        + Add dispatch
                      </Button>
                    )
                  )}
                </div>
              )}
            </TimelineStage>
          </div>

          {/* Actions */}
          <OrderActions order={o} onRefresh={() => window.location.reload()} />

          {/* Line items */}
          <details className="rounded-xl border border-slate-100 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/50 transition-colors duration-200">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 transition-colors duration-200">
              Line items ({o.items.length})
            </summary>
            <ul className="divide-y divide-slate-200 dark:divide-slate-800/50 px-4 pb-3 transition-colors duration-200">
              {o.items.map((it, idx) => (
                <li
                  key={`${it.productId}-${idx}`}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`truncate text-slate-900 dark:text-slate-100 ${it.notAvailable ? 'line-through text-slate-400' : ''} transition-colors duration-200`}>
                      {it.name}{it.size ? ` · ${it.size}` : ''}
                    </span>
                    {it.notAvailable && (
                      <Badge tone="neutral">Not Available</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100 transition-colors duration-200">
                      ×{it.quantity}
                    </span>
                  </div>
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
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${ done ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 bg-white' }`}
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
        {sub && <p className="text-xs text-slate-500 dark:text-slate-400 transition-colors duration-200">{sub}</p>}
        {!timestamp && !children && <p className="text-xs text-slate-400 dark:text-slate-500 transition-colors duration-200">Pending</p>}
        {children}
      </div>
    </div>
  )
}

export function FactoryPendingPage() {
  const usersMap = useUsersMap()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
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
  const [expectedDraft, setExpectedDraft] = useState<Record<string, string>>({})
  const [dispatchFormOpenId, setDispatchFormOpenId] = useState<string | null>(null)
  const [notifyBanner, setNotifyBanner] = useState<{ message: string; number: string } | null>(null)
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
    })
  }, [orders])

  const requestorOptions = useMemo(
    () => [...new Set(orders.map(o => usersMap[o.shopUserId]?.displayName || o.requestorName).filter(Boolean))].sort(),
    [orders, usersMap]
  )

  const grouped = useMemo(() => {
    const needle = orderSearch.trim()

    const filtered = orders.filter(o => {
      if (needle && !(o.orderNumber ?? '').includes(needle)) return false
      if (filterShop !== 'all' && o.shopName !== filterShop) return false

      const reqName = usersMap[o.shopUserId]?.displayName || o.requestorName
      if (filterRequestor !== 'all' && reqName !== filterRequestor) return false

      if (filterKind !== 'all' && o.orderKind !== filterKind) return false

      if (filterStartDate) {
        const [y, m, d] = filterStartDate.split('-').map(Number)
        const start = new Date(y, m - 1, d, 0, 0, 0, 0).getTime()
        if ((o.createdAt ?? 0) < start) return false
      }

      if (filterEndDate) {
        const [ey, em, ed] = filterEndDate.split('-').map(Number)
        const end = new Date(ey, em - 1, ed, 23, 59, 59, 999).getTime()
        if ((o.createdAt ?? 0) > end) return false
      }

      return true
    })

    const sorted = filtered.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    return groupByMonth(sorted)
  }, [
    orders,
    orderSearch,
    filterShop,
    filterRequestor,
    filterKind,
    filterStartDate,
    filterEndDate,
    usersMap,
  ])

  const totalOrders = grouped.reduce((s, g) => s + g.orders.length, 0)
  const hasActiveFilters = filterShop !== 'all' || filterRequestor !== 'all' || filterKind !== 'all' || filterStartDate !== '' || filterEndDate !== ''

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


  async function handleAddDispatch(order: Order, items: OrderDispatch['items'], naUpdates?: Record<string, boolean>) {
    if (!db) return
    setBusyId(order.id)
    setError(null)
    try {
      await addDispatch(db, order.id, items, naUpdates)
      if (order.shopWhatsappNumber) {
        setNotifyBanner({
          number: order.shopWhatsappNumber,
          message: `Hi ${order.requestorName}, a dispatch for your order ${order.orderNumber ? `#${order.orderNumber}` : ''} from ${order.shopName} is on its way. Please confirm receipt when delivered.`,
        })
      }
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dispatch failed.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 transition-colors duration-200">
            Pending orders
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400 transition-colors duration-200">
            Track each order from receipt through dispatch, set delivery dates, and close the loop when the shipment lands.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void refresh()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {/* ── Search + Filter bar ── */}
      <div className="rounded-xl border-2 border-slate-300 dark:border-slate-700/50 bg-slate-50/80 dark:bg-slate-900/80 transition-colors duration-200 shadow-sm">
        <div className="flex divide-x divide-slate-200 dark:divide-slate-800/50 transition-colors duration-200">

          {/* Filter toggle — wider */}
          <button
            type="button"
            onClick={() => setFilterOpen(!filterOpen)}
            className="flex flex-[2] items-center justify-between px-4 py-3 text-left"
          >
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400 dark:text-slate-500 transition-colors duration-200" />
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300 transition-colors duration-200">Filters</span>
              {hasActiveFilters && (
                <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-xs font-semibold text-white leading-none">
                  {[filterShop !== 'all', filterRequestor !== 'all', filterKind !== 'all', filterStartDate !== '', filterEndDate !== ''].filter(Boolean).length}
                </span>
              )}
            </div>
            <ChevronDown className={`h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform ${filterOpen ? 'rotate-180' : ''} transition-colors duration-200`} />
          </button>

          {/* Order number search — narrower */}
          <div className="relative flex flex-1 items-center px-3">
            {loading ? <div className="pointer-events-none absolute left-6 h-4 w-4 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-700/50 border-t-slate-600" /> : <Search className="pointer-events-none absolute left-6 h-4 w-4 text-slate-400 dark:text-slate-500 transition-colors duration-200" />}
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="Order #…"
              aria-label="Search by order number"
              value={orderSearch}
              onChange={e => setOrderSearch(e.target.value.replace(/\D/g, ''))}
              className="w-full bg-transparent py-3 pl-7 text-sm text-slate-700 dark:text-slate-300 placeholder-slate-400 focus:outline-none transition-colors duration-200"
            />
          </div>
        </div>

        {filterOpen && (
          <div className="border-t border-slate-200 dark:border-slate-800/50 px-4 pb-4 pt-3 space-y-3 transition-colors duration-200">
            <div className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400 transition-colors duration-200">Shop</span>
              <div className="flex flex-wrap gap-1.5">
                {(['all', 'Seva', 'Seva Mart', 'Seva Super Store'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setFilterShop(s)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${ filterShop === s ? 'bg-slate-900 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 ring-1 ring-slate-200 hover:bg-slate-100' }`}
                  >
                    {s === 'all' ? 'All' : s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400 transition-colors duration-200">Requestor</span>
              <select
                value={filterRequestor}
                onChange={e => setFilterRequestor(e.target.value)}
                aria-label="Filter by requestor"
                className="rounded-lg border border-slate-200 dark:border-slate-800/50 bg-white dark:bg-slate-900 transition-colors duration-200 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="all">All</option>
                {requestorOptions.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400 transition-colors duration-200">Type</span>
              <div className="flex gap-1.5">
                {([['all', 'All'], ['unlimited', 'Standard'], ['limited', 'Limited']] as [string, string][]).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setFilterKind(val)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${ filterKind === val ? 'bg-slate-900 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 ring-1 ring-slate-200 hover:bg-slate-100' }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400 transition-colors duration-200">Date Range</span>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={e => setFilterStartDate(e.target.value)}
                  aria-label="Start date"
                  className="rounded-lg border border-slate-200 dark:border-slate-800/50 bg-white dark:bg-slate-900 transition-colors duration-200 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"

                />
                <span className="text-slate-400 dark:text-slate-500 transition-colors duration-200">to</span>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={e => setFilterEndDate(e.target.value)}
                  aria-label="End date"
                  className="rounded-lg border border-slate-200 dark:border-slate-800/50 bg-white dark:bg-slate-900 transition-colors duration-200 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
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

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400 transition-colors duration-200">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-900 dark:border-slate-100 border-t-transparent transition-colors duration-200" />
          Loading…
        </div>
      ) : orders.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600 dark:text-slate-400 transition-colors duration-200">No pending orders. Nice and quiet.</p>
        </Card>
      ) : totalOrders === 0 ? (
        <Card>
          <p className="text-sm text-slate-600 dark:text-slate-400 transition-colors duration-200">No orders match the current filters.</p>
        </Card>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ label, orders: groupOrders }) => (
            <div key={label}>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 transition-colors duration-200">
                  {label}
                </h2>
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400 transition-colors duration-200">
                  {groupOrders.length}
                </span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <div className="space-y-3">
                {groupOrders.map((o) => (
                  <PendingCard
                    key={o.id}
                    id={o.id}
                    order={o}
                    open={openId === o.id}
                    onToggle={() => setOpenId(openId === o.id ? null : o.id)}
                    busy={busyId === o.id}
                    expectedDraft={expectedDraft[o.id] ?? ''}
                    onExpectedChange={(v) => setExpectedDraft((p) => ({ ...p, [o.id]: v }))}
                    onPatch={(p) => void patch(o, p)}
                    onAddDispatch={(items, naUpdates) => void handleAddDispatch(o, items, naUpdates)}
                    dispatchFormOpen={dispatchFormOpenId === o.id}
                    onToggleDispatchForm={(open) => setDispatchFormOpenId(open ? o.id : null)}
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
          <div className="flex items-center gap-3 rounded-xl bg-emerald-600 px-5 py-3 shadow-lg shadow-emerald-900/20">
            <p className="text-sm font-semibold text-white">Notify the shop?</p>
            <a
              href={whatsappLink(notifyBanner.number, notifyBanner.message)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-[#25D366] dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1ebe5d] dark:hover:bg-slate-800 transition-colors duration-200"
            >
              <WhatsAppIcon />
              Send on WhatsApp
            </a>
            <button
              type="button"
              className="shrink-0 text-emerald-200 hover:text-white transition-colors duration-200"
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