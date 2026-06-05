with open('src/pages/factory/FactoryPendingPage.tsx', 'r') as f:
    content = f.read()

content = content.replace("function PendingCard({\n  usersMap,", "function PendingCard({\n  usersMap,")
content = content.replace("onToggleDispatchForm: (open: boolean) => void\n})", "onToggleDispatchForm: (open: boolean) => void\n  usersMap: any\n})")

with open('src/pages/factory/FactoryPendingPage.tsx', 'w') as f:
    f.write(content)
