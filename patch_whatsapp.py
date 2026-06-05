with open('src/pages/factory/FactoryPendingPage.tsx', 'r') as f:
    content = f.read()

content = content.replace("if (order.shopWhatsappNumber) {", "const waNumber = usersMap[order.shopUserId]?.whatsappNumber || order.shopWhatsappNumber\n      if (waNumber) {")
content = content.replace("number: order.shopWhatsappNumber,", "number: waNumber,")

with open('src/pages/factory/FactoryPendingPage.tsx', 'w') as f:
    f.write(content)
