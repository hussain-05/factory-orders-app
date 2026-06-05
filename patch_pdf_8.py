with open('src/lib/downloadOrderPdf.tsx', 'r') as f:
    content = f.read()

content = content.replace("<OrderPdf order={order} requestorName={_requestorName} />", "<OrderPdfDocument order={order} requestorName={_requestorName} />")

with open('src/lib/downloadOrderPdf.tsx', 'w') as f:
    f.write(content)
