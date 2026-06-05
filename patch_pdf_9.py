with open('src/lib/downloadOrderPdf.tsx', 'r') as f:
    content = f.read()

content = content.replace("<OrderPdfDocument order={order} />", "<OrderPdfDocument order={order} requestorName={_requestorName} />")

with open('src/lib/downloadOrderPdf.tsx', 'w') as f:
    f.write(content)
