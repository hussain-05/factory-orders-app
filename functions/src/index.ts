import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'

admin.initializeApp()

const db = admin.firestore()
const messaging = admin.messaging()

// ── Helper: convert Firestore Timestamp or plain ms number → ms ──────────────

function toMs(val: any): number | null {
  if (!val) return null
  if (typeof val === 'number') return val
  if (typeof val.toMillis === 'function') return val.toMillis()
  return null
}

// ── Helper: send multicast and silently remove stale tokens ──────────────────

async function sendToTokens(
  tokens: string[],
  notification: { title: string; body: string }
): Promise<void> {
  const uniqueTokens = Array.from(new Set(tokens.filter(Boolean)))
  if (uniqueTokens.length === 0) return

  // Send as data-only (no notification field) so the OS never auto-displays it.
  // The service worker handles background display; onMessage handles foreground.
  const response = await messaging.sendEachForMulticast({
    tokens: uniqueTokens,
    data: {
      title: notification.title,
      body: notification.body,
    },
  })

  const stale: string[] = []
  response.responses.forEach((r, i) => {
    if (
      !r.success &&
      r.error &&
      (r.error.code === 'messaging/registration-token-not-registered' ||
        r.error.code === 'messaging/invalid-registration-token')
    ) {
      stale.push(uniqueTokens[i])
    }
  })

  if (stale.length > 0) {
    const usersWithStale = await db
      .collection('users')
      .where('fcmTokens', 'array-contains-any', stale)
      .get()
    const batch = db.batch()
    usersWithStale.docs.forEach((doc) => {
      batch.update(doc.ref, {
        fcmTokens: admin.firestore.FieldValue.arrayRemove(...stale),
      })
    })
    await batch.commit()
  }
}

// ── Trigger 1: New order placed ──────────────────────────────────────────────

export const onNewOrder = functions.firestore
  .document('orders/{orderId}')
  .onCreate(async (snap) => {
    const order = snap.data()
    if (!order) return

    if (order.orderKind === 'factory_dispatch') {
      const userSnap = await db.collection('users').doc(order.shopUserId).get()
      const tokens: string[] = userSnap.data()?.fcmTokens || []
      const itemCount: number = (order.items || []).length
      await sendToTokens(tokens, {
        title: 'Extra stock sent by factory',
        body: `${itemCount} item${itemCount === 1 ? '' : 's'} have been dispatched to ${order.shopName}. Please confirm receipt after delivery.`,
      })
      return
    }

    const [factoryUsers, factoryStaffUsers] = await Promise.all([
      db.collection('users').where('role', '==', 'factory').get(),
      db.collection('users').where('role', '==', 'factory_staff').get(),
    ])

    const tokens: string[] = []
    ;[...factoryUsers.docs, ...factoryStaffUsers.docs].forEach((doc) => {
      const t: string[] = doc.data().fcmTokens || []
      tokens.push(...t)
    })

    const kindLabel = order.orderKind === 'limited' ? 'limited stock' : 'standard'
    const itemCount: number = (order.items || []).length

    await sendToTokens(tokens, {
      title: `New order from ${order.shopName}`,
      body: `${itemCount} item${itemCount === 1 ? '' : 's'} · ${kindLabel} order by ${order.requestorName}`,
    })
  })

// ── Trigger 2: Milestone updated → notify the shop user ──────────────────────

export const onOrderUpdate = functions.firestore
  .document('orders/{orderId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data()
    const after = change.after.data()
    if (!before || !after) return

    const receivedNow = !before.milestones?.receivedAt && after.milestones?.receivedAt
    const completedNow = before.status !== 'completed' && after.status === 'completed'

    const beforeDispatches = before.dispatches || []
    const afterDispatches = after.dispatches || []
    const dispatchAdded = afterDispatches.length > beforeDispatches.length

    const dateChangedLater = !receivedNow && before.expectedDeliveryDate !== after.expectedDeliveryDate && after.expectedDeliveryDate

    if (!receivedNow && !completedNow && !dispatchAdded && !dateChangedLater) return

    // Deduplicate using event ID to prevent double-firing
    const eventId = context.eventId
    const dedupRef = db.collection('_fcmDedup').doc(eventId)
    const dedupSnap = await dedupRef.get()
    if (dedupSnap.exists) return
    await dedupRef.set({ processedAt: admin.firestore.FieldValue.serverTimestamp() })

    // Fetch shop tokens to notify shop user
    const userSnap = await db.collection('users').doc(after.shopUserId).get()
    const shopTokens: string[] = userSnap.data()?.fcmTokens || []

    // 1. Notify shop user when dispatch is sent
    if (dispatchAdded) {
      const newDispatches = afterDispatches.filter(
        (ad: any) => !beforeDispatches.some((bd: any) => bd.id === ad.id)
      )
      if (newDispatches.length > 0) {
        const itemsCount = newDispatches.reduce((acc: number, d: any) => acc + (d.items || []).length, 0)
        const orderNumber = after.orderNumber ? `#${after.orderNumber}` : ''
        await sendToTokens(shopTokens, {
          title: 'Dispatch sent! 🚚',
          body: `A new dispatch containing ${itemsCount} item${itemsCount === 1 ? '' : 's'} has been sent for your order ${orderNumber} from the factory.`,
        })
      }
    }

    // 2. Notify shop user when delivery date is updated
    if (dateChangedLater) {
      const expectedMs = toMs(after.expectedDeliveryDate)
      const expected = expectedMs
        ? new Date(expectedMs).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : null
      const orderNumber = after.orderNumber ? `#${after.orderNumber}` : ''
      if (expected) {
        await sendToTokens(shopTokens, {
          title: 'Delivery date updated 📅',
          body: `The expected delivery date for order ${orderNumber} from ${after.shopName} has been updated to ${expected}.`,
        })
      }
    }

    // 3. Notify shop user when order is completed
    if (completedNow) {
      const orderNumber = after.orderNumber ? `#${after.orderNumber}` : ''
      await sendToTokens(shopTokens, {
        title: 'Order completed! 🎉',
        body: `All items for order ${orderNumber} from ${after.shopName} have been received and confirmed.`,
      })

      // Also notify Factory Managers & Staff that the shop confirmed receipt and order is finished
      const [factoryUsers, factoryStaffUsers] = await Promise.all([
        db.collection('users').where('role', '==', 'factory').get(),
        db.collection('users').where('role', '==', 'factory_staff').get(),
      ])

      const factoryTokens: string[] = []
      ;[...factoryUsers.docs, ...factoryStaffUsers.docs].forEach((doc) => {
        const t: string[] = doc.data().fcmTokens || []
        factoryTokens.push(...t)
      })

      await sendToTokens(factoryTokens, {
        title: `Order completed at ${after.shopName} ✓`,
        body: `Order ${orderNumber} placed by ${after.requestorName} has been fully received and marked as completed.`,
      })
    }

    // 4. Notify shop user when order is received by factory
    if (receivedNow) {
      const expectedMs = toMs(after.expectedDeliveryDate)
      const expected = expectedMs
        ? new Date(expectedMs).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : null
      await sendToTokens(shopTokens, {
        title: 'Order received by factory',
        body: expected
          ? `Your order is being processed. Expected delivery: ${expected}`
          : 'Your order has been received and is being processed.',
      })
    }
  })
