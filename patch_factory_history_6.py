with open('src/pages/factory/FactoryOrderHistoryPage.tsx', 'r') as f:
    content = f.read()

content = content.replace("function OrderTimeline({ order }: { order: Order }) {", "function OrderTimeline({ order, usersMap }: { order: Order, usersMap: any }) {")
content = content.replace("<OrderTimeline order={o} />", "<OrderTimeline order={o} usersMap={usersMap} />")

with open('src/pages/factory/FactoryOrderHistoryPage.tsx', 'w') as f:
    f.write(content)
