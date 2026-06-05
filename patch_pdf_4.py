with open('src/lib/downloadOrderPdf.tsx', 'r') as f:
    content = f.read()

content = content.replace("export async function previewOrderPdf(order: Order, requestorName?: string) {", "export async function previewOrderPdf(order: Order, _requestorName?: string) {")
content = content.replace("<OrderPdf order={order} requestorName={requestorName} />", "<OrderPdf order={order} requestorName={_requestorName} />")

with open('src/lib/downloadOrderPdf.tsx', 'w') as f:
    f.write(content)

with open('src/pdf/OrderPdf.tsx', 'r') as f:
    content = f.read()

content = content.replace("Requested by: {requestorName || order.requestorName}", "Requested by: {requestorName || order.requestorName}")

with open('src/pdf/OrderPdf.tsx', 'w') as f:
    f.write(content)
