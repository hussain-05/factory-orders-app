import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore'
import type { ShopName, UserProfile, UserRole } from '../types/models'

export async function fetchUserProfile(
  firestore: Firestore,
  uid: string,
): Promise<UserProfile | null> {
  const ref = doc(firestore, 'users', uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  const d = snap.data()
  return {
    uid,
    email: String(d.email ?? ''),
    displayName: String(d.displayName ?? ''),
    role: d.role === 'factory' ? 'factory' : 'shop',
    shopName: d.shopName as ShopName | undefined,
    createdAt: typeof d.createdAt?.toMillis === 'function' ? d.createdAt.toMillis() : 0,
    whatsappNumber: typeof d.whatsappNumber === 'string' ? d.whatsappNumber : undefined,
  }
}

export async function saveUserProfile(
  firestore: Firestore,
  input: {
    uid: string
    email: string
    displayName: string
    role: UserRole
    shopName?: ShopName
    whatsappNumber?: string
  },
) {
  await setDoc(
    doc(firestore, 'users', input.uid),
    {
      email: input.email,
      displayName: input.displayName,
      role: input.role,
      shopName: input.role === 'shop' ? input.shopName ?? null : null,
      whatsappNumber: input.whatsappNumber ?? null,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  )
}