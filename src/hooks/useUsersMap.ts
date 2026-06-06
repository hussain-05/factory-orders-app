import { useEffect, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../lib/firebase'

export function useUsersMap() {
  const [usersMap, setUsersMap] = useState<Record<string, { displayName: string; whatsappNumber?: string }>>({})

  useEffect(() => {
    if (!db) return
    const fetchUsers = async () => {
      try {
        const usersSnap = await getDocs(collection(db!, 'users'))
        const map: Record<string, { displayName: string; whatsappNumber?: string }> = {}
        usersSnap.forEach((doc) => {
          const data = doc.data()
          map[doc.id] = {
            displayName: data.displayName || 'Unknown User',
            whatsappNumber: data.whatsappNumber,
          }
        })
        setUsersMap(map)
      } catch (err) {
        console.error('Failed to fetch users map', err)
      }
    }
    fetchUsers()
  }, [])

  return usersMap
}
