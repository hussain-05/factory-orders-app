import { AlertTriangle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ChevronDown, ChevronRight, Filter, Printer, Search, Trash2, X } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { useLocation } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import Fuse from 'fuse.js'
import { OrderCardsSkeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../contexts/ToastContext'
import { format, differenceInCalendarDays } from 'date-fns'
import { useAuth } from '../../contexts/AuthContext'
import { previewOrderPdf } from '../../lib/downloadOrderPdf'
import { db } from '../../lib/firebase'
import { useUsersMap } from '../../hooks/useUsersMap'
import { addDispatch, deleteOrder, subscribePendingOrdersForFactory, updateOrderMilestones, closeOrderFromPortal } from '../../lib/orderService'
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

function currentStageMeta(o: Order): {
  label: 'Order placed' | 'In production' | 'Awaiting delivery'
  tone: 'neutral' | 'warning' | 'success'
} {
  const hasActiveDispatch = (o.dispatches ?? []).some(d => !d.receivedAt)
  if (hasActiveDispatch) {
    return { label: 'Awaiting delivery', tone: 'success' }
  }

  if (o.milestones?.receivedAt || o.expectedDeliveryDate) {
    return { label: 'In production', tone: 'warning' }
  }

  return { label: 'Order placed', tone: 'neutral' }
}

// ─── Dispatch helpers ─────────────────────────────────────────────────────

function getFulfilmentMeta(order: Order) {
  const totalQty = order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)

  const dispatchedQty = (order.dispatches ?? []).reduce((sum, dispatch) => {
    return (
      sum +
      dispatch.items.reduce((itemSum, item) => {
        if (item.confirmedAt === -1) return itemSum
        return itemSum + Number(item.qty || 0)
      }, 0)
    )
  }, 0)

  const remainingQty = Math.max(totalQty - dispatchedQty, 0)

  return {
    totalQty,
    dispatchedQty,
    remainingQty,
  }
}

function dispatchedQtyByProduct(dispatches: OrderDispatch[]): Record<string, number> {
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

function OrderActions({ order }: { order: Order }) {
  const [busy, setBusy] = useState(false)
  const [closeBusy, setCloseBusy] = useState(false)
  const { profile, user } = useAuth()
  const { showToast } = useToast()
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null)

  async function handleCloseOrder() {
    if (!db || !user) return
    const confirmClose = window.confirm("Are you sure you want to close this order? Outstanding items will be marked as unavailable, and the order will be finalized.")
    if (!confirmClose) return

    setCloseBusy(true)
    try {
      await closeOrderFromPortal(db, order.id, {
        uid: user.uid,
        displayName: profile?.displayName || user.displayName || user.email || "Factory Owner",
        email: user.email || ""
      }, 'factory')
      showToast("Order closed successfully!", "success")
    } catch (err) {
      showToast("Failed to close order.", "error")
    } finally {
      setCloseBusy(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={busy || closeBusy}
          onClick={async () => {
            setBusy(true)
            try { await previewOrderPdf(order) } finally { setBusy(false) }
          }}
        >
          <Printer className="h-4 w-4" />
          {busy ? 'Preparing…' : 'Print'}
        </Button>
        {order.status === 'pending' && (
          <Button
            variant="secondary"
            className="!border-amber-500 !text-amber-600 dark:!text-amber-500 hover:!bg-amber-50 dark:hover:!bg-amber-950/10 shrink-0"
            disabled={closeBusy || busy}
            onClick={() => void handleCloseOrder()}
          >
            {closeBusy ? 'Closing…' : '✗ Close Order'}
          </Button>
        )}
        {profile?.isAdmin && (
          <Button
            variant="danger"
            disabled={busy || closeBusy}
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
                  showToast("Order deleted successfully!", "success")
                } catch (_e) {
                  setDeleteTarget(null)
                  showToast("Failed to delete order.", "error")
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
                <p className={`font-medium min-w-0 whitespace-normal break-words text-sm ${isNa ? 'text-slate-400 dark:text-slate-500 line-through transition-colors duration-200' : 'text-slate-800 dark:text-slate-200 transition-colors duration-200'}`}>
                  {it.name}{it.size ? ` · ${it.size}` : ''}
                  {it.cancelledReason && (
                    <span className="ml-2 inline-flex items-center rounded-md bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300 ring-1 ring-inset ring-amber-600/20">
                      {it.cancelledReason}
                    </span>
                  )}
                </p>
                {!it.cancelledReason && (
                  <p className="mt-0.5 whitespace-normal break-words text-xs text-slate-400 dark:text-slate-500 transition-colors duration-200">
                    Ordered {it.quantity} {(it as any).unit || ((it as any)?.source === 'limited' || order.orderKind === 'limited' ? 'pcs' : 'box')} · {dispatchedQty[it.productId] ?? 0} already sent · {remaining} remaining
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {showNaToggle && !it.cancelledReason && (
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
                {!it.cancelledReason && (
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
                    className="!w-20 !py-1 text-base sm:!text-xs"
                  />
                )}
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
  const stage = currentStageMeta(o)

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
            <Badge tone="neutral">{o.orderKind === 'factory_dispatch' ? 'Factory sent' : o.orderKind === 'limited' ? 'Limited' : 'Standard'}</Badge>
            <Badge tone={stage.tone}>{stage.label}</Badge>
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
      <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
          className="overflow-hidden"
        >
        <div className="border-t border-slate-100 dark:border-slate-800/50 px-4 py-4 space-y-4 transition-colors duration-200">

          {/* Interactive timeline */}
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 transition-colors duration-200">
              Production timeline
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
                        className="!py-1 !text-base sm:!text-sm [color-scheme:light] dark:[color-scheme:dark]"
                        value={expectedDraft}
                        onChange={(e) => onExpectedChange(e.target.value)}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const target = e.target as HTMLInputElement;
                          if (target.showPicker) target.showPicker();
                        }}
                        disabled={busy}
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
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
                        {(() => {
                          const statuses = d.items.map(it => it.confirmedAt)
                          const hasAwaiting = statuses.some(s => s === undefined || s === null || s === 0)
                          const hasNotReceived = statuses.some(s => s === -1)
                          if (hasAwaiting) {
                            return <span className="text-amber-600 font-medium">⏳ Awaiting confirmation</span>
                          }
                          if (hasNotReceived) {
                            return <span className="text-rose-600 dark:text-rose-400 font-semibold">❌ Not received by shop</span>
                          }
                          return <span className="text-emerald-600 font-medium">✓ All confirmed</span>
                        })()}
                      </div>
                      {d.items.map(it => {
                        const originalItem = o.items.find(oi => oi.productId === it.productId)
                        const unit = (originalItem as any)?.unit || ((originalItem as any)?.source === 'limited' || o.orderKind === 'limited' ? 'pcs' : 'box')
                        return (
                          <div key={it.productId} className="flex justify-between text-slate-600 dark:text-slate-400 transition-colors duration-200">
                            <span>{it.name}{it.size ? ` · ${it.size}` : ''}</span>
                            <span className="flex items-center gap-2">
                              <span className="font-semibold tabular-nums">×{it.qty} {unit}</span>
                              {it.confirmedAt === -1 ? (
                                <span className="text-rose-600 dark:text-rose-400 font-medium">❌ Not received</span>
                              ) : it.confirmedAt && it.confirmedAt > 0 ? (
                                <span className="text-emerald-600">✓ {format(it.confirmedAt, 'dd MMM')}</span>
                              ) : (
                                <span className="text-amber-500">⏳</span>
                              )}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  ))}

                  {/* Fulfillment progress */}
                  {dispatches.length > 0 && (() => {
                    const meta = getFulfilmentMeta(o)
                    const fullyDispatched = meta.remainingQty === 0
                    return (
                      <div className="rounded-lg border border-slate-100 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/50 p-3 space-y-1.5 transition-colors duration-200">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 transition-colors duration-200">Fulfillment summary</p>
                          <span className={`text-xs font-semibold tabular-nums ${fullyDispatched ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {meta.remainingQty}/{meta.totalQty} {fullyDispatched ? '✓' : 'remaining'}
                          </span>
                        </div>
                        {o.items.map(it => {
                          const sent = dispatchedQty[it.productId] ?? 0
                          const full = sent >= it.quantity
                          const remaining = Math.max(it.quantity - sent, 0)
                          const unit = (it as any).unit || ((it as any)?.source === 'limited' || o.orderKind === 'limited' ? 'pcs' : 'box')
                          return (
                            <div key={it.productId} className="flex items-center justify-between text-xs">
                              <span className="text-slate-600 dark:text-slate-400 truncate transition-colors duration-200">{it.name}{it.size ? ` · ${it.size}` : ''}</span>
                              <span className={`ml-3 shrink-0 font-semibold tabular-nums ${full ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {remaining}/{it.quantity} {unit} {full ? '✓' : 'remaining'}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}

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

          <OrderActions order={o} />

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
                      <Badge tone={it.cancelledReason ? "warning" : "neutral"}>
                        {it.cancelledReason || "Not Available"}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100 transition-colors duration-200">
                      ×{it.quantity} {(it as any).unit || ((it as any)?.source === 'limited' || o.orderKind === 'limited' ? 'pcs' : 'box')}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </details>
        </div>
        </motion.div>
      )}
      </AnimatePresence>
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

function TimelineStage({ isLast, nextDone, dot, label, timestamp, sub, children }: TimelineStageProps) {
  return (
    <div className="flex gap-3">
      {/* Dot + connector */}
      <div className="flex flex-col items-center">
        {dot === 'check' ? (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm transition-colors duration-200">
            <Check className="h-4 w-4" />
          </div>
        ) : (
          <div className="h-7 w-7 shrink-0 rounded-full border-2 border-slate-300 bg-slate-200 dark:border-slate-600 dark:bg-slate-700 transition-colors duration-200" />
        )}
        {!isLast && (
          <div
            className={`my-1 w-0.5 flex-1 min-h-[20px] ${nextDone ? 'bg-emerald-400' : 'bg-slate-200 dark:bg-slate-700'} transition-colors duration-200`}
          />
        )}
      </div>

      {/* Content */}
      <div className={`pb-4 min-w-0 flex-1 ${isLast ? 'pb-0' : ''}`}>
        <p className="text-sm font-semibold leading-7 text-slate-800 dark:text-slate-200 transition-colors duration-200">
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

export function FactoryPendingPage() {
  const usersMap = useUsersMap()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const { showToast } = useToast()
  const loc = useLocation() as { state?: { openId?: string; filterOverdue?: boolean } }
  const [openId, setOpenId] = useState<string | null>(loc.state?.openId ?? null)
  const [filterOverdue, setFilterOverdue] = useState<boolean>(loc.state?.filterOverdue ?? false)

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
  // ── Filter state — persisted across navigation via sessionStorage ──────────
  const FILTER_KEY = 'seva_pending_filters'
  const loadFilters = () => {
    try { return JSON.parse(sessionStorage.getItem(FILTER_KEY) ?? '{}') } catch { return {} }
  }
  const saved = loadFilters()
  const [filterShop, setFilterShopRaw] = useState<string>(saved.shop ?? 'all')
  const [filterRequestor, setFilterRequestorRaw] = useState<string>(saved.requestor ?? 'all')
  const [filterKind, setFilterKindRaw] = useState<string>(saved.kind ?? 'all')
  const [filterStartDate, setFilterStartDateRaw] = useState<string>(saved.startDate ?? '')
  const [filterEndDate, setFilterEndDateRaw] = useState<string>(saved.endDate ?? '')
  const [filterOpen, setFilterOpen] = useState(
    !!(
      (saved.shop && saved.shop !== 'all') ||
      (saved.requestor && saved.requestor !== 'all') ||
      (saved.kind && saved.kind !== 'all') ||
      saved.startDate ||
      saved.endDate
    )
  )
  const [orderSearch, setOrderSearch] = useState('')

  const persistFilters = (patch: Record<string, unknown>) => {
    const current = loadFilters()
    sessionStorage.setItem(FILTER_KEY, JSON.stringify({ ...current, ...patch }))
  }
  const setFilterShop = (v: string) => { setFilterShopRaw(v); persistFilters({ shop: v }) }
  const setFilterRequestor = (v: string) => { setFilterRequestorRaw(v); persistFilters({ requestor: v }) }
  const setFilterKind = (v: string) => { setFilterKindRaw(v); persistFilters({ kind: v }) }
  const setFilterStartDate = (v: string) => { setFilterStartDateRaw(v); persistFilters({ startDate: v }) }
  const setFilterEndDate = (v: string) => { setFilterEndDateRaw(v); persistFilters({ endDate: v }) }

  // Real-time subscription
  useEffect(() => {
    if (!db) return
    setLoading(true)
    setError(null)
    const unsub = subscribePendingOrdersForFactory(
      db,
      (rows) => {
        setOrders(rows)
        setLoading(false)
      },
      () => {
        setError('Could not load pending orders.')
        setLoading(false)
      }
    )
    return unsub
  }, [])



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

  // Fuse.js index for full-text search across order fields
  const fuse = useMemo(() => new Fuse(orders, {
    keys: [
      { name: 'orderNumber', weight: 2 },
      { name: 'shopName', weight: 1.5 },
      { name: 'requestorName', weight: 1.5 },
      { name: 'items.name', weight: 1 },
    ],
    threshold: 0.35,
    includeScore: true,
  }), [orders])

  const grouped = useMemo(() => {
    const needle = orderSearch.trim()
    const textMatched = needle
      ? fuse.search(needle).map(r => r.item)
      : orders

    const filtered = textMatched.filter(o => {
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

      if (filterOverdue) {
        if (!isOrderOverdue(o, new Date())) return false
      }

      return true
    })

    const sorted = filtered.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    return groupByMonth(sorted)
  }, [
    orders,
    orderSearch,
    fuse,
    filterShop,
    filterRequestor,
    filterKind,
    filterStartDate,
    filterEndDate,
    filterOverdue,
    usersMap,
  ])

  const totalOrders = grouped.reduce((s, g) => s + g.orders.length, 0)
  const hasActiveFilters = filterShop !== 'all' || filterRequestor !== 'all' || filterKind !== 'all' || filterStartDate !== '' || filterEndDate !== '' || filterOverdue

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

      showToast("Order milestone updated!", "success")
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed.')
      showToast("Failed to update milestone.", "error")
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
      showToast("Dispatch recorded successfully!", "success")
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dispatch failed.')
      showToast("Failed to record dispatch.", "error")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      className="space-y-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600 dark:from-slate-100 dark:to-slate-400 transition-colors duration-200">
              Pending orders
            </h1>
            {filterOverdue && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 dark:bg-rose-950/20 px-2.5 py-0.5 text-xs font-semibold text-rose-800 dark:text-rose-300 ring-1 ring-rose-200 dark:ring-rose-900/30">
                Overdue
                <button
                  type="button"
                  onClick={() => setFilterOverdue(false)}
                  className="hover:bg-rose-100 dark:hover:bg-rose-900/40 rounded-full p-0.5 transition-colors"
                  title="Clear overdue filter"
                >
                  <X className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                </button>
              </span>
            )}
          </div>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400 transition-colors duration-200">
            Track each order from receipt through dispatch, set delivery dates, and close the loop when the shipment lands.
          </p>
        </div>
      </div>

      {/* ── Search + Filter bar ── */}
      <div className="space-y-3">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800/50 dark:bg-slate-900/60 transition-colors duration-200">
            {loading ? (
              <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-slate-300 dark:border-slate-700/50 border-t-slate-600" />
            ) : (
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
            )}
            <input
              type="text"
              placeholder="Search orders, shop, product…"
              aria-label="Search orders"
              value={orderSearch}
              onChange={e => setOrderSearch(e.target.value)}
              className="w-full bg-transparent py-2.5 pl-10 pr-10 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none transition-colors duration-200"
            />
            {orderSearch && (
              <button
                type="button"
                onClick={() => setOrderSearch('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setFilterOpen(!filterOpen)}
            className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold shadow-sm transition duration-200 ${
              filterOpen || hasActiveFilters
                ? 'border-emerald-600/30 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-950/20 dark:text-emerald-400'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800/50 dark:bg-slate-900 dark:text-slate-300'
            }`}
          >
            <Filter className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Filters</span>
            {hasActiveFilters && (
              <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white dark:bg-emerald-500 shrink-0">
                {[filterShop !== 'all', filterRequestor !== 'all', filterKind !== 'all', filterStartDate !== '', filterEndDate !== '', filterOverdue].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>

        <AnimatePresence>
          {filterOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="rounded-xl border border-slate-100 bg-white dark:border-slate-800/60 dark:bg-slate-900/80 backdrop-blur-md p-4 shadow-md transition duration-200 space-y-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                {/* Shop filter */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Shop
                  </label>
                  <select
                    value={filterShop}
                    onChange={e => setFilterShop(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white py-1.5 px-2.5 text-xs font-semibold text-slate-700 focus:outline-none dark:border-slate-800/50 dark:bg-slate-900 dark:text-slate-300 transition-colors duration-200"
                  >
                    <option value="all">All Shops</option>
                    <option value="Seva">Seva</option>
                    <option value="Seva Mart">Seva Mart</option>
                    <option value="Seva Super Store">Seva Super Store</option>
                    <option value="Test Shop">Test Shop</option>
                  </select>
                </div>

                {/* Requestor filter */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Requestor
                  </label>
                  <select
                    value={filterRequestor}
                    onChange={e => setFilterRequestor(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white py-1.5 px-2.5 text-xs font-semibold text-slate-700 focus:outline-none dark:border-slate-800/50 dark:bg-slate-900 dark:text-slate-300 transition-colors duration-200"
                  >
                    <option value="all">All Requestors</option>
                    {requestorOptions.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>

                {/* Order type filter */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Order Type
                  </label>
                  <select
                    value={filterKind}
                    onChange={e => setFilterKind(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white py-1.5 px-2.5 text-xs font-semibold text-slate-700 focus:outline-none dark:border-slate-800/50 dark:bg-slate-900 dark:text-slate-300 transition-colors duration-200"
                  >
                    <option value="all">All Types</option>
                    <option value="unlimited">Standard</option>
                    <option value="limited">Limited</option>
                    <option value="factory_dispatch">Factory Sent</option>
                  </select>
                </div>

                {/* Date range filter */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Date Range
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={filterStartDate}
                      onChange={e => setFilterStartDate(e.target.value)}
                      aria-label="Start date"
                      className="w-full rounded-lg border border-slate-200 bg-white py-1 px-1.5 text-[11px] font-medium text-slate-600 focus:outline-none dark:border-slate-800/50 dark:bg-slate-900 dark:text-slate-300 transition-colors duration-200"
                    />
                    <span className="text-[10px] text-slate-400 uppercase font-bold shrink-0">to</span>
                    <input
                      type="date"
                      value={filterEndDate}
                      onChange={e => setFilterEndDate(e.target.value)}
                      aria-label="End date"
                      className="w-full rounded-lg border border-slate-200 bg-white py-1 px-1.5 text-[11px] font-medium text-slate-600 focus:outline-none dark:border-slate-800/50 dark:bg-slate-900 dark:text-slate-300 transition-colors duration-200"
                    />
                  </div>
                </div>
              </div>

              {/* Tags & Clear all actions */}
              <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/50 pt-2.5">
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                    Active filters
                  </span>
                  {filterShop !== 'all' && (
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      Shop: {filterShop}
                      <button type="button" onClick={() => setFilterShop('all')} className="text-slate-400 hover:text-slate-600"><X className="h-2.5 w-2.5" /></button>
                    </span>
                  )}
                  {filterRequestor !== 'all' && (
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      Req: {filterRequestor}
                      <button type="button" onClick={() => setFilterRequestor('all')} className="text-slate-400 hover:text-slate-600"><X className="h-2.5 w-2.5" /></button>
                    </span>
                  )}
                  {filterKind !== 'all' && (
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      Type: {filterKind === 'unlimited' ? 'Standard' : filterKind === 'limited' ? 'Limited' : 'Factory sent'}
                      <button type="button" onClick={() => setFilterKind('all')} className="text-slate-400 hover:text-slate-600"><X className="h-2.5 w-2.5" /></button>
                    </span>
                  )}
                  {filterStartDate && (
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      From: {filterStartDate}
                      <button type="button" onClick={() => setFilterStartDate('')} className="text-slate-400 hover:text-slate-600"><X className="h-2.5 w-2.5" /></button>
                    </span>
                  )}
                  {filterEndDate && (
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      To: {filterEndDate}
                      <button type="button" onClick={() => setFilterEndDate('')} className="text-slate-400 hover:text-slate-600"><X className="h-2.5 w-2.5" /></button>
                    </span>
                  )}
                  {filterOverdue && (
                    <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-950/20 dark:text-rose-400">
                      Overdue Only
                      <button type="button" onClick={() => setFilterOverdue(false)} className="text-rose-400 hover:text-rose-600"><X className="h-2.5 w-2.5" /></button>
                    </span>
                  )}
                  {!hasActiveFilters && (
                    <span className="text-[10px] font-medium text-slate-400 italic">None</span>
                  )}
                </div>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => { setFilterShop('all'); setFilterRequestor('all'); setFilterKind('all'); setFilterStartDate(''); setFilterEndDate(''); setFilterOverdue(false) }}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-700 transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 px-4 py-3 ring-1 ring-rose-200 dark:ring-rose-800/50">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <p className="text-sm text-rose-800 dark:text-rose-300">{error}
        </p>
        </div>
      )}



      {loading ? (
        <OrderCardsSkeleton count={3} />
      ) : orders.length === 0 ? (
        <EmptyState
          title="No pending orders"
          description="All orders are processed. Nice and quiet!"
          variant="inbox"
        />
      ) : totalOrders === 0 ? (
        <EmptyState
          title="No matching orders"
          description="No orders match the current filters. Try adjusting your search term or parameters."
          variant="search"
          actionLabel="Clear all filters"
          onAction={() => {
            setFilterShop('all')
            setFilterRequestor('all')
            setFilterKind('all')
            setFilterStartDate('')
            setFilterEndDate('')
            setFilterOverdue(false)
          }}
        />
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
    </motion.div>
  )
}