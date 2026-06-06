import type { Order } from '../types/models'

export async function previewOrderPdf(order: Order, _requestorName?: string) {
  const [{ pdf }, { OrderPdfDocument }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../pdf/OrderPdf'),
  ])
  const blob = await pdf(<OrderPdfDocument order={order} requestorName={_requestorName} />).toBlob()
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  // Revoke after a delay to give the new tab time to load the blob
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}