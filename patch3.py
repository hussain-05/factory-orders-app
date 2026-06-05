with open('src/pages/factory/FactoryPendingPage.tsx', 'r') as f:
    content = f.read()

content = content.replace("{o.requestorName && (", "{(usersMap[o.shopUserId]?.displayName || o.requestorName) && (")

with open('src/pages/factory/FactoryPendingPage.tsx', 'w') as f:
    f.write(content)
