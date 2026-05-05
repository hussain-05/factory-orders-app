import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { format } from 'date-fns'
import type { Order } from '../types/models'

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 40,
    paddingHorizontal: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#0f172a',
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 12,
    marginBottom: 14,
  },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  meta: { fontSize: 9, color: '#475569' },
  row: { flexDirection: 'row' },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    paddingVertical: 6,
    fontWeight: 700,
    fontSize: 9,
  },
  cellName: { width: '52%' },
  cellSize: { width: '12%' },
  cellQty: { width: '12%', textAlign: 'right' },
  cellRate: { width: '12%', textAlign: 'right' },
  cellLine: { width: '12%', textAlign: 'right' },
  rowItem: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    fontSize: 9,
  },
  footer: { marginTop: 16, fontSize: 8, color: '#64748b' },
})

function money(n: number | undefined) {
  if (n === undefined || Number.isNaN(n)) return '—'
  return `₹${n.toFixed(2)}`
}

export function OrderPdfDocument({ order }: { order: Order }) {
  const created = order.createdAt ? format(order.createdAt, 'dd MMM yyyy, HH:mm') : '—'
  const expected = order.expectedDeliveryDate
    ? format(order.expectedDeliveryDate, 'dd MMM yyyy')
    : '—'
  const actual = order.actualDeliveryDate
    ? format(order.actualDeliveryDate, 'dd MMM yyyy')
    : '—'

  const lines = order.items.map((it) => {
    const rate = it.rate ?? 0
    const line = rate ? rate * it.quantity : undefined
    return { ...it, line }
  })

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Factory order</Text>
          <Text style={styles.meta}>
            Order ID: {order.id} · {order.orderKind === 'limited' ? 'Limited stock' : 'Standard catalogue'}
          </Text>
          <Text style={styles.meta}>Shop: {order.shopName}</Text>
          <Text style={styles.meta}>
            Requested by: {order.requestorName} ({order.requestorEmail})
          </Text>
          <Text style={styles.meta}>Placed: {created}</Text>
          <Text style={styles.meta}>
            Expected delivery: {expected} · Actual delivery: {actual} · Status: {order.status}
          </Text>
        </View>

        <View style={styles.tableHeader}>
          <Text style={styles.cellName}>Item</Text>
          <Text style={styles.cellSize}>Size</Text>
          <Text style={styles.cellQty}>Qty</Text>
          <Text style={styles.cellRate}>Rate</Text>
          <Text style={styles.cellLine}>Line</Text>
        </View>

        {lines.map((it, idx) => (
          <View key={`${it.productId}-${idx}`} style={styles.rowItem} wrap={false}>
            <Text style={styles.cellName}>{it.name}</Text>
            <Text style={styles.cellSize}>{it.size ?? '—'}</Text>
            <Text style={styles.cellQty}>{String(it.quantity)}</Text>
            <Text style={styles.cellRate}>{it.rate !== undefined ? money(it.rate) : '—'}</Text>
            <Text style={styles.cellLine}>{it.line !== undefined ? money(it.line) : '—'}</Text>
          </View>
        ))}

        <Text style={styles.footer}>
          Generated from Seva Factory Orders. Totals are informational where rates are present.
        </Text>
      </Page>
    </Document>
  )
}
