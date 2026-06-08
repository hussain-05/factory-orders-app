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
  if (tokens.length === 0) return

  // Send as data-only (no notification field) so the OS never auto-displays it.
  // The service worker handles background display; onMessage handles foreground.
  const response = await messaging.sendEachForMulticast({
    tokens,
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
      stale.push(tokens[i])
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

// ── Trigger 1: New order placed → notify all factory users ───────────────────

export const onNewOrder = functions.firestore
  .document('orders/{orderId}')
  .onCreate(async (snap) => {
    const order = snap.data()
    if (!order) return

    const factoryUsers = await db
      .collection('users')
      .where('role', 'in', ['factory', 'factory_staff'])
      .get()

    const tokens: string[] = []
    factoryUsers.docs.forEach((doc) => {
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

    if (!receivedNow && !completedNow) return

    // Deduplicate using event ID to prevent double-firing
    const eventId = context.eventId
    const dedupRef = db.collection('_fcmDedup').doc(eventId)
    const dedupSnap = await dedupRef.get()
    if (dedupSnap.exists) return
    await dedupRef.set({ processedAt: admin.firestore.FieldValue.serverTimestamp() })

    const userSnap = await db.collection('users').doc(after.shopUserId).get()
    const tokens: string[] = userSnap.data()?.fcmTokens || []

    if (completedNow) {
      await sendToTokens(tokens, {
        title: 'Order delivered ✓',
        body: `Your order from ${after.shopName} has been marked as delivered.`,
      })
    } else if (receivedNow) {
      const expectedMs = toMs(after.expectedDeliveryDate)
      const expected = expectedMs
        ? new Date(expectedMs).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : null
      await sendToTokens(tokens, {
        title: 'Order received by factory',
        body: expected
          ? `Your order is being processed. Expected delivery: ${expected}`
          : 'Your order has been received and is being processed.',
      })
    }
  })