import { getToken, onMessage, type Messaging } from 'firebase/messaging'
import { arrayRemove, arrayUnion, doc, updateDoc, type Firestore } from 'firebase/firestore'

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string

export async function requestNotificationPermission(
  messaging: Messaging,
  db: Firestore,
  uid: string,
): Promise<'granted' | 'denied' | 'unsupported'> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported'

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'

  try {
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1500))
    ])
    const token = await getToken(messaging, { 
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    })
    if (token) {
      await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) })
    }
    return 'granted'
  } catch {
    return 'unsupported'
  }
}

export async function removeNotificationToken(
  messaging: Messaging,
  db: Firestore,
  uid: string,
): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) return
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1000))
    ])
    const token = await getToken(messaging, { 
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    })
    if (token) {
      await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayRemove(token) })
    }
  } catch {
    // Ignore — token may already be invalid or SW timed out
  }
}

export function listenForForegroundMessages(
  messaging: Messaging,
  onNotification: (title: string, body: string) => void,
) {
  return onMessage(messaging, (payload) => {
    // Data-only messages: title/body are in payload.data
    const title = payload.data?.title ?? payload.notification?.title ?? 'New notification'
    const body = payload.data?.body ?? payload.notification?.body ?? ''
    onNotification(title, body)
  })
}