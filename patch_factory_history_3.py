with open('src/pages/factory/FactoryOrderHistoryPage.tsx', 'r') as f:
    content = f.read()

content = content.replace("{o.requestorName && (\n                              <span className=\"flex items-center gap-1\">\n                                {o.requestorName.split(' ')[0]}\n                              </span>\n                            )}", "{(usersMap[o.shopUserId]?.displayName || o.requestorName) && (\n                              <span className=\"flex items-center gap-1\">\n                                {(usersMap[o.shopUserId]?.displayName || o.requestorName).split(' ')[0]}\n                              </span>\n                            )}")

with open('src/pages/factory/FactoryOrderHistoryPage.tsx', 'w') as f:
    f.write(content)
