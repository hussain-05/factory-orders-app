import { differenceInCalendarDays, format, formatDistanceStrict } from 'date-fns'

export function formatDate(ms: number | null | undefined) {
  if (!ms) return '—'
  return format(ms, 'dd MMM yyyy')
}

export function formatDateTime(ms: number | null | undefined) {
  if (!ms) return '—'
  return format(ms, 'dd MMM yyyy, HH:mm')
}

export function fulfillmentSummary(order: {
  createdAt: number
  completedAt?: number | null
  actualDeliveryDate?: number | null
}) {
  const end = order.actualDeliveryDate ?? order.completedAt ?? null
  if (!end) return '—'
  const days = differenceInCalendarDays(new Date(end), new Date(order.createdAt))
  return `${formatDistanceStrict(new Date(order.createdAt), new Date(end))} (${days} day${days === 1 ? '' : 's'})`
}
