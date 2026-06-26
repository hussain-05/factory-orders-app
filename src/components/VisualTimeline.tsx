import { motion } from 'framer-motion'
import { Check, Clock, ClipboardCheck, Truck, CheckCircle2 } from 'lucide-react'
import type { Order } from '../types/models'
import { formatDate, formatDateTime } from '../utils/format'

interface Stage {
  id: string
  label: string
  status: 'completed' | 'active' | 'pending'
  timestamp?: number | null
  subtext?: string
  icon: React.ComponentType<any>
}

export function VisualTimeline({ order, usersMap }: { order: Order; usersMap: Record<string, any> }) {
  const dispatches = order.dispatches ?? []
  
  // 1. Placed
  const isPlaced = true
  const placedTime = order.createdAt

  // 2. Received
  const isReceived = Boolean(order.milestones?.receivedAt)
  const receivedTime = order.milestones?.receivedAt

  // 3. Dispatched
  const totalQty = order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)
  const dispatchedQty = dispatches.reduce((sum, dispatch) => {
    return sum + dispatch.items.reduce((itemSum, item) => itemSum + Number(item.qty || 0), 0)
  }, 0)
  const isPartiallyDispatched = dispatches.length > 0
  const isFullyDispatched = dispatchedQty >= totalQty && totalQty > 0
  
  let dispatchStatus: 'completed' | 'active' | 'pending' = 'pending'
  if (isFullyDispatched) dispatchStatus = 'completed'
  else if (isPartiallyDispatched) dispatchStatus = 'active'

  const dispatchTime = dispatches.length > 0 ? Math.max(...dispatches.map(d => d.dispatchedAt)) : null

  // 4. In Transit (Awaiting confirmation)
  const awaitingConfirmationCount = dispatches.filter(d => !d.receivedAt).length
  const allDispatchesConfirmed = dispatches.length > 0 && dispatches.every(d => d.receivedAt)
  
  let transitStatus: 'completed' | 'active' | 'pending' = 'pending'
  if (allDispatchesConfirmed) transitStatus = 'completed'
  else if (awaitingConfirmationCount > 0) transitStatus = 'active'

  const transitTime = allDispatchesConfirmed && dispatches.length > 0
    ? Math.max(...dispatches.map(d => d.receivedAt ?? 0))
    : null

  // 5. Completed
  const isCompleted = order.status === 'completed'
  const completedTime = order.actualDeliveryDate

  const stages: Stage[] = [
    {
      id: 'placed',
      label: 'Order Placed',
      status: 'completed',
      timestamp: placedTime,
      subtext: `Requested by ${usersMap[order.shopUserId]?.displayName || order.requestorName}`,
      icon: Clock,
    },
    {
      id: 'received',
      label: 'Received by Factory',
      status: isReceived ? 'completed' : (isPlaced ? 'active' : 'pending'),
      timestamp: receivedTime,
      subtext: isReceived
        ? `Expected delivery: ${order.expectedDeliveryDate ? formatDate(order.expectedDeliveryDate) : 'TBD'}`
        : 'Awaiting factory acceptance',
      icon: ClipboardCheck,
    },
    {
      id: 'dispatched',
      label: isFullyDispatched ? 'Fully Dispatched' : (isPartiallyDispatched ? 'Partially Dispatched' : 'Dispatch Pending'),
      status: dispatchStatus,
      timestamp: dispatchTime,
      subtext: dispatches.length > 0
        ? `Sent ${dispatchedQty} of ${totalQty} items (${dispatches.length} shipment${dispatches.length === 1 ? '' : 's'})`
        : 'Awaiting production and packaging',
      icon: Truck,
    },
    {
      id: 'transit',
      label: 'In Transit',
      status: transitStatus,
      timestamp: transitTime,
      subtext: awaitingConfirmationCount > 0
        ? `${awaitingConfirmationCount} shipment${awaitingConfirmationCount === 1 ? '' : 's'} awaiting confirmation`
        : (allDispatchesConfirmed ? 'All shipments delivered' : 'Awaiting dispatch'),
      icon: Truck,
    },
    {
      id: 'completed',
      label: 'Completed',
      status: isCompleted ? 'completed' : 'pending',
      timestamp: completedTime,
      subtext: isCompleted ? 'Order closed and verified' : 'Awaiting final delivery confirmation',
      icon: CheckCircle2,
    },
  ]

  return (
    <div className="rounded-2xl border border-slate-200/60 dark:border-slate-800/40 bg-slate-50/50 dark:bg-slate-900/10 p-5 space-y-4 transition-colors duration-200">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        Order Progress Tracker
      </p>

      <div className="flex flex-col gap-0">
        {stages.map((stage, idx) => {
          const Icon = stage.icon
          const isDone = stage.status === 'completed'
          const isActive = stage.status === 'active'
          const isLast = idx === stages.length - 1
          const nextDone = !isLast && stages[idx + 1].status === 'completed'

          return (
            <div key={stage.id} className="flex gap-4 text-xs">
              {/* Column 1: Circle indicator and vertical line */}
              <div className="flex flex-col items-center shrink-0 w-5">
                {/* Circle wrapper with exact height alignment */}
                <div className="flex h-5 w-5 items-center justify-center">
                  {isDone ? (
                    <motion.div
                      initial={{ scale: 0.8 }}
                      animate={{ scale: 1 }}
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm shadow-emerald-500/20 shrink-0"
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </motion.div>
                  ) : isActive ? (
                    <div className="relative flex h-5 w-5 items-center justify-center rounded-full border border-amber-500 bg-amber-50 dark:bg-slate-900 text-amber-500 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/30 opacity-75"></span>
                      <Icon className="relative h-3 w-3 animate-pulse" />
                    </div>
                  ) : (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-slate-350 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-400 dark:text-slate-500 shrink-0">
                      <Icon className="h-3 w-3" />
                    </div>
                  )}
                </div>
                {/* Line container below circle */}
                {!isLast && (
                  <div className="my-1 w-0.5 flex-1 min-h-[24px] relative">
                    <div className={`absolute inset-0 rounded-full ${nextDone ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800'}`} />
                  </div>
                )}
              </div>

              {/* Column 2: Step info */}
              <div className={`min-w-0 flex-1 ${isLast ? 'pb-0' : 'pb-6'}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <h4 className={`font-semibold text-sm transition-colors duration-200 ${
                    isDone ? 'text-slate-900 dark:text-slate-100' : isActive ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'
                  }`}>
                    {stage.label}
                  </h4>
                  {stage.timestamp && isDone && (
                    <span className="text-[10px] text-slate-500 dark:text-slate-450 tabular-nums">
                      {formatDateTime(stage.timestamp)}
                    </span>
                  )}
                </div>
                {stage.subtext && (
                  <p className={`mt-0.5 transition-colors duration-200 ${
                    isDone ? 'text-slate-500 dark:text-slate-400' : isActive ? 'text-slate-700 dark:text-slate-305' : 'text-slate-400 dark:text-slate-500'
                  }`}>
                    {stage.subtext}
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
