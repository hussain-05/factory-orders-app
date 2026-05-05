import type { Order } from '../types/models'

export async function downloadOrderPdf(order: Order) {
  const [{ pdf }, { OrderPdfDocument }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../pdf/OrderPdf'),
  ])
  const blob = await pdf(<OrderPdfDocument order={order} />).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `factory-order-${order.id}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
