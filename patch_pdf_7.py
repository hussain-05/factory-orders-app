with open('src/pdf/OrderPdf.tsx', 'r') as f:
    content = f.read()

content = content.replace("export function OrderPdfDocument({ order }: { order: Order }) {", "export function OrderPdfDocument({ order, requestorName }: { order: Order, requestorName?: string }) {")

with open('src/pdf/OrderPdf.tsx', 'w') as f:
    f.write(content)
