import { useEffect, useState } from 'react'
import { db, messaging } from '../lib/firebase'
import {
  listenForForegroundMessages,
  requestNotificationPermission,
} from '../lib/notificationService'
import { useAuth } from '../contexts/AuthContext'

export type NotifStatus = 'unknown' | 'granted' | 'denied' | 'unsupported'

export function useNotifications() {
  const { user } = useAuth()
  const [status, setStatus] = useState<NotifStatus>('unknown')
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null)

  useEffect(() => {
    if (!('Notification' in window)) {
      setStatus('unsupported')
      return
    }
    setStatus(Notification.permission === 'granted' ? 'granted'
      : Notification.permission === 'denied' ? 'denied'
      : 'unknown')
  }, [])

  // Listen for foreground messages when permission is granted
  useEffect(() => {
    if (!messaging || status !== 'granted') return
    return listenForForegroundMessages(messaging, (title, body) => {
      setToast({ title, body })
      setTimeout(() => setToast(null), 5000)
    })
  }, [status])

  async function enable() {
    if (!messaging || !db || !user) return
    const result = await requestNotificationPermission(messaging, db, user.uid)
    setStatus(result)
  }

  return { status, toast, dismissToast: () => setToast(null), enable }
}