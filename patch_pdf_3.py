import re

files = [
    ('src/pages/factory/FactoryOrderHistoryPage.tsx', "previewOrderPdf(o)", "previewOrderPdf(o, usersMap[o.shopUserId]?.displayName)"),
    ('src/pages/factory/FactoryPendingPage.tsx', "previewOrderPdf(order)", "previewOrderPdf(order, usersMap[order.shopUserId]?.displayName)"),
    ('src/pages/shop/ShopOrderHistoryPage.tsx', "previewOrderPdf(o)", "previewOrderPdf(o, usersMap[o.shopUserId]?.displayName)"),
]

for filepath, old, new_ in files:
    with open(filepath, 'r') as f:
        content = f.read()
    content = content.replace(old, new_)
    with open(filepath, 'w') as f:
        f.write(content)
