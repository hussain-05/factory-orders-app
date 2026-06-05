with open('src/pages/factory/FactoryPendingPage.tsx', 'r') as f:
    content = f.read()

content = content.replace("type PendingCardProps = {", "type PendingCardProps = {\n  usersMap: any;")
content = content.replace("<OrderActions order={o} onRefresh={undefined} />", "<OrderActions order={o} onRefresh={undefined} usersMap={usersMap} />")

with open('src/pages/factory/FactoryPendingPage.tsx', 'w') as f:
    f.write(content)

with open('src/pages/shop/ShopOrderHistoryPage.tsx', 'r') as f:
    content = f.read()

content = content.replace("function OrderActions({ order, onRefresh }: { order: Order, onRefresh?: () => void }) {", "function OrderActions({ order, onRefresh, usersMap }: { order: Order, onRefresh?: () => void, usersMap: any }) {")
content = content.replace("<OrderActions order={o} onRefresh={refresh} />", "<OrderActions order={o} onRefresh={refresh} usersMap={usersMap} />")
content = content.replace("<OrderActions order={o} />", "<OrderActions order={o} usersMap={usersMap} />")

with open('src/pages/shop/ShopOrderHistoryPage.tsx', 'w') as f:
    f.write(content)
