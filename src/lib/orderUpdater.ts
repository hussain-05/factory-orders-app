import { collection, query, where, getDocs, writeBatch, type Firestore } from 'firebase/firestore'

export async function updateOrdersForUser(
  firestore: Firestore,
  shopUserId: string,
  newDisplayName: string,
  newWhatsappNumber: string
) {
  const ordersRef = collection(firestore, 'orders')
  const q = query(ordersRef, where('shopUserId', '==', shopUserId))
  const snapshot = await getDocs(q)

  if (snapshot.empty) return

  const batch = writeBatch(firestore)
  snapshot.docs.forEach((docSnap) => {
    batch.update(docSnap.ref, {
      requestorName: newDisplayName,
      shopWhatsappNumber: newWhatsappNumber,
    })
  })

  await batch.commit()
}
