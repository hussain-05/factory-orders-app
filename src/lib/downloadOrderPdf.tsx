import type { Order } from '../types/models'

export async function previewOrderPdf(order: Order, _requestorName?: string) {
  const [{ pdf }, { OrderPdfDocument }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../pdf/OrderPdf'),
  ])
  const rawBlob = await pdf(<OrderPdfDocument order={order} requestorName={_requestorName} />).toBlob()
  const blob = new Blob([rawBlob], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)

  const pdfWindow = window.open('')
  if (pdfWindow) {
    pdfWindow.document.write(
      `<iframe width='100%' height='100%' style='border:none;margin:0;padding:0;' src='${url}#toolbar=1'></iframe>`
    )
    pdfWindow.document.title = `Factory_Orders_${order.orderNumber || order.id}`
    pdfWindow.document.body.style.margin = '0'
  } else {
    window.open(url, '_blank')
  }
  // Revoke after a delay to give the new tab time to load the blob
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}