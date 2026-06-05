with open('src/pdf/OrderPdf.tsx', 'r') as f:
    content = f.read()

content = content.replace("export function OrderPdf({ order }: OrderPdfProps) {", "export function OrderPdf({ order, requestorName }: OrderPdfProps & { requestorName?: string }) {")
content = content.replace("Requested by: {order.requestorName}", "Requested by: {requestorName || order.requestorName}")

with open('src/pdf/OrderPdf.tsx', 'w') as f:
    f.write(content)
