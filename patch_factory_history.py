with open('src/pages/factory/FactoryOrderHistoryPage.tsx', 'r') as f:
    content = f.read()

content = content.replace("import { db }", "import { db }\\nimport { useUsersMap } from '../../hooks/useUsersMap'")
content = content.replace("export function FactoryOrderHistoryPage() {", "export function FactoryOrderHistoryPage() {\\n  const usersMap = useUsersMap()")

content = content.replace("sublabel: `${order.requestorName} · ${order.shopName}`,", "sublabel: `${usersMap[order.shopUserId]?.displayName || order.requestorName} · ${order.shopName}`,")
content = content.replace("() => [...new Set(orders.map(o => o.requestorName).filter(Boolean))].sort(),", "() => [...new Set(orders.map(o => usersMap[o.shopUserId]?.displayName || o.requestorName).filter(Boolean))].sort(),")
content = content.replace("if (filterRequestor !== 'all' && o.requestorName !== filterRequestor) return false", "const reqName = usersMap[o.shopUserId]?.displayName || o.requestorName\\n      if (filterRequestor !== 'all' && reqName !== filterRequestor) return false")
content = content.replace("{o.requestorName && (\\n                              <span className=\"flex items-center gap-1\">\\n                                {o.requestorName.split(' ')[0]}\\n                              </span>\\n                            )}", "{(usersMap[o.shopUserId]?.displayName || o.requestorName) && (\\n                              <span className=\"flex items-center gap-1\">\\n                                {(usersMap[o.shopUserId]?.displayName || o.requestorName).split(' ')[0]}\\n                              </span>\\n                            )}")
content = content.replace("<p className=\"mt-1 text-sm font-semibold text-slate-900\">{o.requestorName}</p>", "<p className=\"mt-1 text-sm font-semibold text-slate-900\">{usersMap[o.shopUserId]?.displayName || o.requestorName}</p>")


with open('src/pages/factory/FactoryOrderHistoryPage.tsx', 'w') as f:
    f.write(content)
