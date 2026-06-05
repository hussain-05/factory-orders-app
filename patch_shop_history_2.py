with open('src/pages/shop/ShopOrderHistoryPage.tsx', 'r') as f:
    content = f.read()

content = content.replace("sublabel: usersMap[order.shopUserId]?.displayName || order.requestorName,", "sublabel: order.requestorName,") # Will fix later since OrderTimeline is defined outside
content = content.replace("function OrderTimeline({ order }: { order: Order }) {", "function OrderTimeline({ order, usersMap }: { order: Order, usersMap: any }) {")
content = content.replace("<OrderTimeline order={o} />", "<OrderTimeline order={o} usersMap={usersMap} />")

with open('src/pages/shop/ShopOrderHistoryPage.tsx', 'w') as f:
    f.write(content)
