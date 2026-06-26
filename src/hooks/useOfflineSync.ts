import { useEffect, useState } from 'react'
import { db } from '../lib/firebase'
import { createOrder } from '../lib/orderService'

export interface OfflineOrder {
  id: string
  timestamp: number
  orderKind: 'unlimited' | 'limited'
  shopName: string
  shopUserId: string
  requestorName: string
  requestorEmail: string
  shopWhatsappNumber?: string
  items: any[]
}

export function useOfflineSync() {
  const [syncing, setSyncing] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  useEffect(() => {
    if (toastMessage) {
      const t = setTimeout(() => setToastMessage(null), 4000)
      return () => clearTimeout(t)
    }
  }, [toastMessage])

  const syncOrders = async () => {
    if (!db || !navigator.onLine || syncing) return
    
    try {
      const stored = localStorage.getItem('seva_offline_orders')
      if (!stored) return
      
      const orders: OfflineOrder[] = JSON.parse(stored)
      if (orders.length === 0) return

      setSyncing(true)
      let succeededCount = 0

      for (const order of orders) {
        try {
          await createOrder(db, {
            orderKind: order.orderKind,
            shopName: order.shopName,
            shopUserId: order.shopUserId,
            requestorName: order.requestorName,
            requestorEmail: order.requestorEmail,
            shopWhatsappNumber: order.shopWhatsappNumber,
            items: order.items,
          })
          succeededCount++
        } catch (e) {
          console.error('Failed to sync offline order:', e)
        }
      }

      if (succeededCount > 0) {
        setToastMessage(`Successfully synced ${succeededCount} offline order${succeededCount === 1 ? '' : 's'}!`)
      }

      // Clear the queued orders once sync process completes
      localStorage.removeItem('seva_offline_orders')
    } catch (e) {
      console.error('Offline sync error:', e)
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    if (navigator.onLine) {
      syncOrders()
    }

    const handleOnline = () => {
      syncOrders()
    }

    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  return { syncing, toastMessage, syncOrders }
}
