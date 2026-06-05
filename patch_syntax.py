with open('src/pages/factory/FactoryOrderHistoryPage.tsx', 'r') as f:
    content = f.read()
content = content.replace("import { db }\\nimport { useUsersMap } from '../../hooks/useUsersMap' from '../../lib/firebase'", "import { db } from '../../lib/firebase'\\nimport { useUsersMap } from '../../hooks/useUsersMap'")
with open('src/pages/factory/FactoryOrderHistoryPage.tsx', 'w') as f:
    f.write(content)

with open('src/pages/shop/ShopOrderHistoryPage.tsx', 'r') as f:
    content = f.read()
content = content.replace("import { db }\\nimport { useUsersMap } from '../../hooks/useUsersMap' from '../../lib/firebase'", "import { db } from '../../lib/firebase'\\nimport { useUsersMap } from '../../hooks/useUsersMap'")
with open('src/pages/shop/ShopOrderHistoryPage.tsx', 'w') as f:
    f.write(content)
