with open('src/pages/factory/FactoryOrderHistoryPage.tsx', 'r') as f:
    content = f.read()
content = content.replace("export function FactoryOrderHistoryPage() {\\n  const usersMap = useUsersMap()", "export function FactoryOrderHistoryPage() {\n  const usersMap = useUsersMap()")
with open('src/pages/factory/FactoryOrderHistoryPage.tsx', 'w') as f:
    f.write(content)

with open('src/pages/shop/ShopOrderHistoryPage.tsx', 'r') as f:
    content = f.read()
content = content.replace("export function ShopOrderHistoryPage() {\\n  const usersMap = useUsersMap()", "export function ShopOrderHistoryPage() {\n  const usersMap = useUsersMap()")
content = content.replace("const reqName = usersMap[o.shopUserId]?.displayName || o.requestorName\\n      if", "const reqName = usersMap[o.shopUserId]?.displayName || o.requestorName\n      if")
with open('src/pages/shop/ShopOrderHistoryPage.tsx', 'w') as f:
    f.write(content)
