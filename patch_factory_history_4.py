with open('src/pages/factory/FactoryOrderHistoryPage.tsx', 'r') as f:
    content = f.read()

content = content.replace("{o.requestorName \&\& (", "{(usersMap[o.shopUserId]?.displayName || o.requestorName) && (")
content = content.replace("{o.requestorName.split(' ')[0]}", "{(usersMap[o.shopUserId]?.displayName || o.requestorName).split(' ')[0]}")

with open('src/pages/factory/FactoryOrderHistoryPage.tsx', 'w') as f:
    f.write(content)
