with open('src/pages/shop/ShopOrderHistoryPage.tsx', 'r') as f:
    content = f.read()

content = content.replace("import { db }", "import { db }\\nimport { useUsersMap } from '../../hooks/useUsersMap'")
content = content.replace("export function ShopOrderHistoryPage() {", "export function ShopOrderHistoryPage() {\\n  const usersMap = useUsersMap()")

content = content.replace("sublabel: order.requestorName,", "sublabel: usersMap[order.shopUserId]?.displayName || order.requestorName,")
content = content.replace("() => [...new Set(orders.map(o => o.requestorName).filter(Boolean))].sort(),", "() => [...new Set(orders.map(o => usersMap[o.shopUserId]?.displayName || o.requestorName).filter(Boolean))].sort(),")
content = content.replace("if (filterRequestor !== 'all' && o.requestorName !== filterRequestor) return false", "const reqName = usersMap[o.shopUserId]?.displayName || o.requestorName\\n      if (filterRequestor !== 'all' && reqName !== filterRequestor) return false")
content = content.replace("{o.requestorName && (", "{(usersMap[o.shopUserId]?.displayName || o.requestorName) && (")
content = content.replace("{o.requestorName.split(' ')[0]}", "{(usersMap[o.shopUserId]?.displayName || o.requestorName).split(' ')[0]}")
content = content.replace("<p className=\"mt-1 text-sm font-semibold text-slate-900\">{o.requestorName}</p>", "<p className=\"mt-1 text-sm font-semibold text-slate-900\">{usersMap[o.shopUserId]?.displayName || o.requestorName}</p>")

with open('src/pages/shop/ShopOrderHistoryPage.tsx', 'w') as f:
    f.write(content)
