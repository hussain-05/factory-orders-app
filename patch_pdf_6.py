with open('src/pdf/OrderPdf.tsx', 'r') as f:
    content = f.read()

content = content.replace("export function OrderPdf({ order, requestorName }: OrderPdfProps & { requestorName?: string }) {", "export function OrderPdf({ order, requestorName }: OrderPdfProps & { requestorName?: string }) {")

with open('src/pdf/OrderPdf.tsx', 'w') as f:
    f.write(content)
