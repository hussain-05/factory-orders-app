with open('src/pages/factory/FactoryPendingPage.tsx', 'r') as f:
    content = f.read()

content = content.replace("<OrderActions order={o} onRefresh={() => window.location.reload()} />", "<OrderActions order={o} onRefresh={() => window.location.reload()} usersMap={usersMap} />")

with open('src/pages/factory/FactoryPendingPage.tsx', 'w') as f:
    f.write(content)

with open('src/pages/shop/ShopOrderHistoryPage.tsx', 'r') as f:
    content = f.read()

content = content.replace("<OrderActions order={o} onRefresh={() => window.location.reload()} />", "<OrderActions order={o} onRefresh={() => window.location.reload()} usersMap={usersMap} />")
content = content.replace("<OrderActions order={o} />", "<OrderActions order={o} usersMap={usersMap} />")

with open('src/pages/shop/ShopOrderHistoryPage.tsx', 'w') as f:
    f.write(content)
