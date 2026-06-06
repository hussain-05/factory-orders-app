import type { Order } from '../types/models'

export async function previewOrderPdf(order: Order, _requestorName?: string) {
  const [{ pdf }, { OrderPdfDocument }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../pdf/OrderPdf'),
  ])
  const blob = await pdf(<OrderPdfDocument order={order} requestorName={_requestorName} />).toBlob()
  const url = URL.createObjectURL(blob)

  // Create an invisible <a> tag to force a download with the proper filename
  const a = document.createElement('a')
  a.href = url
  a.download = `Factory_Orders_${order.orderNumber || order.id}.pdf`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  // Revoke the blob URL
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}