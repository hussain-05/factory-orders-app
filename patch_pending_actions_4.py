with open('src/pages/factory/FactoryPendingPage.tsx', 'r') as f:
    content = f.read()

content = content.replace("interface PendingCardProps {", "interface PendingCardProps {\n  usersMap: any")
content = content.replace("<OrderActions order={o} onRefresh={refresh} />", "<OrderActions order={o} onRefresh={refresh} usersMap={usersMap} />")

with open('src/pages/factory/FactoryPendingPage.tsx', 'w') as f:
    f.write(content)
