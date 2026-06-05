with open('src/hooks/useUsersMap.ts', 'r') as f:
    content = f.read()

content = content.replace("const usersSnap = await getDocs(collection(db, 'users'))", "const usersSnap = await getDocs(collection(db!, 'users'))")

with open('src/hooks/useUsersMap.ts', 'w') as f:
    f.write(content)
