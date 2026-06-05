with open('src/pages/factory/FactoryPendingPage.tsx', 'r') as f:
    content = f.read()

content = content.replace("function OrderActions({ order, onRefresh }: { order: Order, onRefresh?: () => void }) {", "function OrderActions({ order, onRefresh, usersMap }: { order: Order, onRefresh?: () => void, usersMap: any }) {")
content = content.replace("previewOrderPdf(order)", "previewOrderPdf(order, usersMap[order.shopUserId]?.displayName)")
content = content.replace("<OrderActions order={o} onRefresh={refresh} />", "<OrderActions order={o} onRefresh={refresh} usersMap={usersMap} />")

content = content.replace("function PendingCard({", "function PendingCard({\n  usersMap,")
content = content.replace("function PendingCard({\n  usersMap,\n  id,", "function PendingCard({\n  usersMap,\n  id,")
content = content.replace("onToggleDispatchForm:\n  (open: boolean) => void\n})", "onToggleDispatchForm:\n  (open: boolean) => void\n  usersMap: any\n})")

content = content.replace("<PendingCard", "<PendingCard\nusersMap={usersMap}")

with open('src/pages/factory/FactoryPendingPage.tsx', 'w') as f:
    f.write(content)
