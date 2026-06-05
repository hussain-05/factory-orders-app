with open('src/lib/downloadOrderPdf.tsx', 'r') as f:
    content = f.read()

content = content.replace("export async function previewOrderPdf(order: Order) {", "export async function previewOrderPdf(order: Order, requestorName?: string) {")
content = content.replace("<OrderPdf order={order} />", "<OrderPdf order={order} requestorName={requestorName} />")

with open('src/lib/downloadOrderPdf.tsx', 'w') as f:
    f.write(content)
