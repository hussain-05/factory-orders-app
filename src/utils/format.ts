import { differenceInCalendarDays, format } from 'date-fns'

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
  expectedDeliveryDate?: number | null
}) {
  const actual = order.actualDeliveryDate ?? order.completedAt ?? null
  if (!actual) return '—'

  const totalDays = differenceInCalendarDays(new Date(actual), new Date(order.createdAt))
  const base = `${totalDays} day${totalDays === 1 ? '' : 's'} from order`

  if (!order.expectedDeliveryDate) return base

  const delta = differenceInCalendarDays(new Date(actual), new Date(order.expectedDeliveryDate))

  if (delta === 0) return `${base} · ✓ On time`
  if (delta < 0) return `${base} · ✓ ${Math.abs(delta)} day${Math.abs(delta) === 1 ? '' : 's'} early`
  return `${base} · ⚠ ${delta} day${delta === 1 ? '' : 's'} late`
}