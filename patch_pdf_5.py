with open('src/pdf/OrderPdf.tsx', 'r') as f:
    content = f.read()

content = content.replace("Requested by: {requestorName || order.requestorName}", "Requested by: {requestorName || order.requestorName}")

with open('src/pdf/OrderPdf.tsx', 'w') as f:
    f.write(content)
