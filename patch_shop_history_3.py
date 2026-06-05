with open('src/pages/shop/ShopOrderHistoryPage.tsx', 'r') as f:
    content = f.read()

content = content.replace("sublabel: order.requestorName,", "sublabel: usersMap[order.shopUserId]?.displayName || order.requestorName,")

with open('src/pages/shop/ShopOrderHistoryPage.tsx', 'w') as f:
    f.write(content)
