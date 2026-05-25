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
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    paddingVertical: 6,
    fontWeight: 700,
    fontSize: 9,
  },
  cellName: { width: '60%' },
  cellSize: { width: '20%' },
  cellQty: { width: '10%', textAlign: 'right' },
  cellCheck: { width: '10%', alignItems: 'center' },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    fontSize: 9,
  },
  checkbox: {
    width: 10,
    height: 10,
    borderWidth: 1,
    borderColor: '#64748b',
  },
  footer: { marginTop: 16, fontSize: 8, color: '#64748b' },
})

export function OrderPdfDocument({ order }: { order: Order }) {
  const created = order.createdAt ? format(order.createdAt, 'dd MMM yyyy, HH:mm') : '—'
  const expected = order.expectedDeliveryDate
    ? format(order.expectedDeliveryDate, 'dd MMM yyyy')
    : '—'
  const actual = order.actualDeliveryDate
    ? format(order.actualDeliveryDate, 'dd MMM yyyy')
    : '—'

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
          <View style={styles.cellCheck}>
            <Text>✓</Text>
          </View>
        </View>

        {order.items.map((it, idx) => (
          <View key={`${it.productId}-${idx}`} style={styles.rowItem} wrap={false}>
            <Text style={styles.cellName}>{it.name}</Text>
            <Text style={styles.cellSize}>{it.size ?? '—'}</Text>
            <Text style={styles.cellQty}>{String(it.quantity)}</Text>
            <View style={styles.cellCheck}>
              <View style={styles.checkbox} />
            </View>
          </View>
        ))}

        <Text style={styles.footer}>
          Generated from Seva Factory Orders.
        </Text>
      </Page>
    </Document>
  )
}