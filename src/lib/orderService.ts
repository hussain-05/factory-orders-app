import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase/firestore'
import type { Order, OrderDispatch, OrderKind, OrderLineItem, OrderMilestones, OrderStatus } from '../types/models'

const ordersCol = 'orders'
const limitedCol = 'limitedProducts'
const counterRef = (firestore: Firestore) => doc(firestore, 'counters', 'orders')

function nextOrderNumber(current: number): string {
  return String(current + 1).padStart(6, '0')
}

export async function createOrder(
  firestore: Firestore,
  input: {
    orderKind: OrderKind
    shopName: string
    shopUserId: string
    requestorName: string
    requestorEmail: string
    shopWhatsappNumber?: string
    items: OrderLineItem[]
  },
): Promise<{ orderNumber: string }> {
  if (input.items.length === 0) throw new Error('Add at least one line item.')

  if (input.orderKind === 'limited') {
    const qtyByProduct = new Map<string, { qty: number; label: string }>()
    for (const line of input.items) {
      const prev = qtyByProduct.get(line.productId)
      const nextQty = (prev?.qty ?? 0) + line.quantity
      qtyByProduct.set(line.productId, { qty: nextQty, label: line.name })
    }

    const orderRef = doc(collection(firestore, ordersCol))
    let orderNumber = ''

    await runTransaction(firestore, async (tx) => {
      // Phase 1: all reads (counter + stock)
      const counterSnap = await tx.get(counterRef(firestore))
      const snapshots = new Map<string, { snap: DocumentSnapshot; qty: number; label: string }>()
      for (const [productId, { qty, label }] of qtyByProduct) {
        const ref = doc(firestore, limitedCol, productId)
        snapshots.set(productId, { snap: await tx.get(ref), qty, label })
      }

      // Phase 2: validate stock
      for (const { snap, qty, label } of snapshots.values()) {
        if (!snap.exists()) throw new Error(`Product missing: ${label}`)
        const stock = Number(snap.data()?.stock ?? 0)
        if (stock < qty) throw new Error(`Insufficient stock for "${label}".`)
      }

      // Phase 3: all writes
      const lastNum = counterSnap.exists() ? Number(counterSnap.data()?.lastOrderNumber ?? 0) : 0
      orderNumber = nextOrderNumber(lastNum)
      tx.set(counterRef(firestore), { lastOrderNumber: lastNum + 1 }, { merge: true })

      for (const { snap, qty } of snapshots.values()) {
        tx.update(snap.ref, { stock: Number(snap.data()?.stock ?? 0) - qty, updatedAt: serverTimestamp() })
      }

      tx.set(orderRef, {
        orderKind: input.orderKind,
        shopName: input.shopName,
        shopUserId: input.shopUserId,
        requestorName: input.requestorName,
        requestorEmail: input.requestorEmail,
        shopWhatsappNumber: input.shopWhatsappNumber ?? null,
        orderNumber,
        items: input.items,
        status: 'pending',
        milestones: {},
        expectedDeliveryDate: null,
        actualDeliveryDate: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    })
    return { orderNumber }
  }

  // Unlimited — use transaction for counter
  let orderNumber = ''
  const orderRef = doc(collection(firestore, ordersCol))

  await runTransaction(firestore, async (tx) => {
    const counterSnap = await tx.get(counterRef(firestore))
    const lastNum = counterSnap.exists() ? Number(counterSnap.data()?.lastOrderNumber ?? 0) : 0
    orderNumber = nextOrderNumber(lastNum)
    tx.set(counterRef(firestore), { lastOrderNumber: lastNum + 1 }, { merge: true })
    tx.set(orderRef, {
      orderKind: input.orderKind,
      shopName: input.shopName,
      shopUserId: input.shopUserId,
      requestorName: input.requestorName,
      requestorEmail: input.requestorEmail,
      shopWhatsappNumber: input.shopWhatsappNumber ?? null,
      orderNumber,
      items: input.items,
      status: 'pending',
      milestones: {},
      expectedDeliveryDate: null,
      actualDeliveryDate: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })
  return { orderNumber }
}

function mapOrder(id: string, d: Record<string, unknown>): Order {
  const milestones = (d.milestones ?? {}) as Record<string, unknown>
  return {
    id,
    orderKind: d.orderKind === 'limited' ? 'limited' : 'unlimited',
    shopName: String(d.shopName ?? '') as Order['shopName'],
    shopUserId: String(d.shopUserId ?? ''),
    requestorName: String(d.requestorName ?? ''),
    requestorEmail: String(d.requestorEmail ?? ''),
    items: Array.isArray(d.items) ? (d.items as OrderLineItem[]) : [],
    status: d.status === 'completed' ? 'completed' : 'pending',
    milestones: {
      receivedAt:
        milestones.receivedAt && typeof (milestones.receivedAt as { toMillis?: () => number }).toMillis === 'function'
          ? (milestones.receivedAt as { toMillis: () => number }).toMillis()
          : typeof milestones.receivedAt === 'number'
            ? milestones.receivedAt
            : null,
      dispatchedAt:
        milestones.dispatchedAt &&
        typeof (milestones.dispatchedAt as { toMillis?: () => number }).toMillis === 'function'
          ? (milestones.dispatchedAt as { toMillis: () => number }).toMillis()
          : typeof milestones.dispatchedAt === 'number'
            ? milestones.dispatchedAt
            : null,
    },
    expectedDeliveryDate:
      d.expectedDeliveryDate &&
      typeof (d.expectedDeliveryDate as { toMillis?: () => number }).toMillis === 'function'
        ? (d.expectedDeliveryDate as { toMillis: () => number }).toMillis()
        : typeof d.expectedDeliveryDate === 'number'
          ? d.expectedDeliveryDate
          : null,
    actualDeliveryDate:
      d.actualDeliveryDate &&
      typeof (d.actualDeliveryDate as { toMillis?: () => number }).toMillis === 'function'
        ? (d.actualDeliveryDate as { toMillis: () => number }).toMillis()
        : typeof d.actualDeliveryDate === 'number'
          ? d.actualDeliveryDate
          : null,
    createdAt:
      d.createdAt && typeof (d.createdAt as { toMillis?: () => number }).toMillis === 'function'
        ? (d.createdAt as { toMillis: () => number }).toMillis()
        : 0,
    updatedAt:
      d.updatedAt && typeof (d.updatedAt as { toMillis?: () => number }).toMillis === 'function'
        ? (d.updatedAt as { toMillis: () => number }).toMillis()
        : 0,
    completedAt:
      d.completedAt && typeof (d.completedAt as { toMillis?: () => number }).toMillis === 'function'
        ? (d.completedAt as { toMillis: () => number }).toMillis()
        : typeof d.completedAt === 'number'
          ? d.completedAt
          : null,
    shopWhatsappNumber: typeof d.shopWhatsappNumber === 'string' ? d.shopWhatsappNumber : undefined,
    orderNumber: typeof d.orderNumber === 'string' ? d.orderNumber : undefined,
    dispatches: Array.isArray(d.dispatches)
      ? (d.dispatches as Array<Record<string, unknown>>).map(disp => ({
          id: String(disp.id ?? ''),
          dispatchedAt: typeof disp.dispatchedAt === 'number' ? disp.dispatchedAt : 0,
          items: Array.isArray(disp.items)
            ? (disp.items as Array<Record<string, unknown>>).map(it => ({
                productId: String(it.productId ?? ''),
                name: String(it.name ?? ''),
                size: typeof it.size === 'string' ? it.size : undefined,
                qty: Number(it.qty ?? 0),
                confirmedAt: typeof it.confirmedAt === 'number' ? it.confirmedAt : null,
              }))
            : [],
          receivedAt:
            typeof disp.receivedAt === 'number' ? disp.receivedAt : null,
        }))
      : [],
  }
}

export async function listOrdersForShop(
  firestore: Firestore,
  shopName: string,
): Promise<Order[]> {
  const qy = query(
    collection(firestore, ordersCol),
    where('shopName', '==', shopName),
    limit(200),
  )
  const snap = await getDocs(qy)
  const rows = snap.docs.map((docu) => mapOrder(docu.id, docu.data() as Record<string, unknown>))
  rows.sort((a, b) => b.createdAt - a.createdAt)
  return rows
}

export async function listPendingOrdersForFactory(firestore: Firestore): Promise<Order[]> {
  // Same as shop history: `where` + `orderBy` on another field needs a composite index.
  const qy = query(
    collection(firestore, ordersCol),
    where('status', '==', 'pending'),
    limit(200),
  )
  const snap = await getDocs(qy)
  const rows = snap.docs.map((docu) => mapOrder(docu.id, docu.data() as Record<string, unknown>))
  rows.sort((a, b) => a.createdAt - b.createdAt)
  return rows
}

export async function listAllOrdersForFactory(firestore: Firestore): Promise<Order[]> {
  const qy = query(collection(firestore, ordersCol), orderBy('createdAt', 'desc'), limit(300))
  const snap = await getDocs(qy)
  return snap.docs.map((docu) => mapOrder(docu.id, docu.data() as Record<string, unknown>))
}

export async function deleteOrder(firestore: Firestore, orderId: string) {
  const orderRef = doc(firestore, ordersCol, orderId)
  const orderSnap = await getDoc(orderRef)
  if (!orderSnap.exists()) throw new Error('Order not found.')

  const order = mapOrder(orderId, orderSnap.data() as Record<string, unknown>)

  // Unlimited orders have no stock to restore — simple delete
  if (order.orderKind !== 'limited' || order.items.length === 0) {
    await deleteDoc(orderRef)
    return
  }

  // Limited orders: restore each product's stock atomically then delete
  await runTransaction(firestore, async (tx) => {
    // Phase 1: all reads
    const reads: Array<{ snap: DocumentSnapshot; quantity: number }> = []
    for (const item of order.items) {
      const productRef = doc(firestore, limitedCol, item.productId)
      reads.push({ snap: await tx.get(productRef), quantity: item.quantity })
    }

    // Phase 2: all writes
    for (const { snap, quantity } of reads) {
      if (snap.exists()) {
        const currentStock = Number(snap.data()?.stock ?? 0)
        tx.update(snap.ref, { stock: currentStock + quantity, updatedAt: serverTimestamp() })
      }
    }
    tx.delete(orderRef)
  })
}

export async function updateOrderMilestones(
  firestore: Firestore,
  orderId: string,
  patch: {
    milestones?: Partial<OrderMilestones>
    expectedDeliveryDate?: number | null
    actualDeliveryDate?: number | null
    status?: OrderStatus
  },
) {
  const ref = doc(firestore, ordersCol, orderId)
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() }

  if (patch.milestones) {
    const cur = patch.milestones
    if (cur.receivedAt !== undefined) {
      payload['milestones.receivedAt'] = cur.receivedAt
        ? Timestamp.fromMillis(cur.receivedAt)
        : null
    }
    if (cur.dispatchedAt !== undefined) {
      payload['milestones.dispatchedAt'] = cur.dispatchedAt
        ? Timestamp.fromMillis(cur.dispatchedAt)
        : null
    }
  }
  if (patch.expectedDeliveryDate !== undefined) {
    payload.expectedDeliveryDate = patch.expectedDeliveryDate
      ? Timestamp.fromMillis(patch.expectedDeliveryDate)
      : null
  }
  if (patch.actualDeliveryDate !== undefined) {
    payload.actualDeliveryDate = patch.actualDeliveryDate
      ? Timestamp.fromMillis(patch.actualDeliveryDate)
      : null
  }
  if (patch.status === 'completed') {
    payload.status = 'completed'
    payload.completedAt = serverTimestamp()
  }
  if (patch.status === 'pending') {
    payload.status = 'pending'
    payload.completedAt = null
  }

  await updateDoc(ref, payload)
}

// ─── Dispatch helpers ─────────────────────────────────────────────────────

/** Factory: add a new dispatch entry to an order. */
export async function addDispatch(
  firestore: Firestore,
  orderId: string,
  items: OrderDispatch['items'],
  naUpdates?: Record<string, boolean>,
): Promise<void> {
  const ref = doc(firestore, ordersCol, orderId)
  const now = Date.now()

  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Order not found')

    // We parse the entire order to get item definitions easily
    const order = mapOrder(orderId, snap.data() as Record<string, unknown>)
    const existing: OrderDispatch[] = order.dispatches ?? []

    const update: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    }

    if (items.length > 0) {
      const dispatch: OrderDispatch = {
        id: `d_${now}_${Math.random().toString(36).slice(2, 6)}`,
        dispatchedAt: now,
        items,
        receivedAt: null,
      }
      update.dispatches = [...existing, dispatch]

      const isFirst = !order.milestones.dispatchedAt
      if (isFirst) {
        update['milestones.dispatchedAt'] = Timestamp.fromMillis(now)
      }
    }

    if (naUpdates && Object.keys(naUpdates).length > 0) {
      const updatedItems = order.items.map(it => {
        if (naUpdates[it.productId] !== undefined) {
          return { ...it, notAvailable: naUpdates[it.productId] }
        }
        return it
      })
      update.items = updatedItems

      // Check for completion
      const confirmedQty: Record<string, number> = {}
      for (const d of existing) {
        for (const it of d.items) {
          if (it.confirmedAt) {
            confirmedQty[it.productId] = (confirmedQty[it.productId] ?? 0) + it.qty
          }
        }
      }

      // If an item is marked notAvailable, we only consider it "fulfilled"
      // if all of its ALREADY DISPATCHED quantity has been confirmed.
      // E.g., if ordered 4, dispatched 2, marked NA -> remaining 2 are cancelled.
      // But the 2 dispatched MUST still be confirmed before the order is complete.
      const dispatchedQty: Record<string, number> = {}
      const dispatchesToCheck = update.dispatches ? (update.dispatches as OrderDispatch[]) : existing
      for (const d of dispatchesToCheck) {
        for (const it of d.items) {
          dispatchedQty[it.productId] = (dispatchedQty[it.productId] ?? 0) + it.qty
        }
      }

      const allFulfilled = updatedItems.every(it => {
        const conf = confirmedQty[it.productId] ?? 0
        if (it.notAvailable) {
          const disp = dispatchedQty[it.productId] ?? 0
          return conf >= disp // NA items only need their dispatched parts confirmed
        }
        return conf >= it.quantity
      })

      if (allFulfilled) {
        update.status = 'completed'
        update.completedAt = serverTimestamp()
        update.actualDeliveryDate = Timestamp.fromMillis(now)
      }
    }

    // Only update if there are changes beyond updatedAt
    if (Object.keys(update).length > 1) {
      tx.update(ref, update)
    }
  })
}

/** Shop: confirm receipt of a specific item within a dispatch. Auto-completes order when all items fully received. */
export async function confirmDispatchItem(
  firestore: Firestore,
  orderId: string,
  dispatchId: string,
  productId: string,
): Promise<void> {
  const ref = doc(firestore, ordersCol, orderId)
  const now = Date.now()

  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Order not found')
    const order = mapOrder(orderId, snap.data() as Record<string, unknown>)

    const dispatches: OrderDispatch[] = (order.dispatches ?? []).map(d => {
      if (d.id !== dispatchId) return d
      const updatedItems = d.items.map(it =>
        it.productId === productId && !it.confirmedAt
          ? { ...it, confirmedAt: now }
          : it,
      )
      const allItemsConfirmed = updatedItems.every(it => it.confirmedAt)
      return {
        ...d,
        items: updatedItems,
        receivedAt: allItemsConfirmed ? (d.receivedAt ?? now) : d.receivedAt,
      }
    })

    // Tally confirmed quantities per product across all dispatches
    const confirmedQty: Record<string, number> = {}
    for (const d of dispatches) {
      for (const it of d.items) {
        if (it.confirmedAt) {
          confirmedQty[it.productId] = (confirmedQty[it.productId] ?? 0) + it.qty
        }
      }
    }

    const dispatchedQty: Record<string, number> = {}
    for (const d of dispatches) {
      for (const it of d.items) {
        dispatchedQty[it.productId] = (dispatchedQty[it.productId] ?? 0) + it.qty
      }
    }

    const allFulfilled = order.items.every(it => {
      const conf = confirmedQty[it.productId] ?? 0
      if (it.notAvailable) {
        const disp = dispatchedQty[it.productId] ?? 0
        return conf >= disp
      }
      return conf >= it.quantity
    })

    const update: Record<string, unknown> = {
      dispatches,
      updatedAt: serverTimestamp(),
    }
    if (allFulfilled) {
      update.status = 'completed'
      update.completedAt = serverTimestamp()
      update.actualDeliveryDate = Timestamp.fromMillis(now)
    }
    tx.update(ref, update)
  })
}
export async function markLineItemNotAvailable(
  firestore: Firestore,
  orderId: string,
  productId: string,
  notAvailable: boolean
): Promise<void> {
  const ref = doc(firestore, ordersCol, orderId)

  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Order not found.')

    const order = snap.data() as Order
    if (!order.items) return

    const updatedItems = order.items.map(it => {
      if (it.productId === productId) {
        return { ...it, notAvailable }
      }
      return it
    })

    const updates: Record<string, unknown> = {
      items: updatedItems,
      updatedAt: serverTimestamp(),
    }

    if (notAvailable) {
      // Check if this new "notAvailable" status allows the order to be completed
      const confirmedQty: Record<string, number> = {}
      for (const d of order.dispatches ?? []) {
        for (const it of d.items) {
          if (it.confirmedAt) {
            confirmedQty[it.productId] = (confirmedQty[it.productId] ?? 0) + it.qty
          }
        }
      }

      const allFulfilled = updatedItems.every(
        it => it.notAvailable || (confirmedQty[it.productId] ?? 0) >= it.quantity,
      )

      if (allFulfilled) {
        updates.status = 'completed'
        updates.completedAt = serverTimestamp()
        updates.actualDeliveryDate = Timestamp.fromMillis(Date.now())
      }
    }

    tx.update(ref, updates)
  })
}
