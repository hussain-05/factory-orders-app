import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore'
import type { ShopName, UserProfile, UserRole } from '../types/models'

function userProfileFromDoc(id: string, data: Record<string, unknown>): UserProfile {
  const rawCreatedAt = data.createdAt as { toMillis?: () => number } | undefined
  const rawRole = data.role

  return {
    uid: id,
    email: String(data.email ?? ''),
    displayName: String(data.displayName ?? ''),
    role: rawRole === 'factory' ? 'factory' : rawRole === 'factory_staff' ? 'factory_staff' : 'shop',
    shopName: data.shopName as ShopName | undefined,
    accessibleShops: Array.isArray(data.accessibleShops) ? (data.accessibleShops as ShopName[]) : undefined,
    createdAt: typeof rawCreatedAt?.toMillis === 'function' ? rawCreatedAt.toMillis() : 0,
    whatsappNumber: typeof data.whatsappNumber === 'string' ? data.whatsappNumber : undefined,
  }
}

export async function fetchUserProfile(
  firestore: Firestore,
  uid: string,
): Promise<UserProfile | null> {
  const ref = doc(firestore, 'users', uid)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return userProfileFromDoc(uid, snap.data())
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

export async function listShopUsers(
  firestore: Firestore,
  shopName?: ShopName,
): Promise<UserProfile[]> {
  // Query only by role and filter shopName client-side. This avoids requiring a
  // composite Firestore index for role + shopName and keeps the selector reliable.
  const snap = await getDocs(query(collection(firestore, 'users'), where('role', '==', 'shop')))

  const rows = snap.docs
    .map((d) => userProfileFromDoc(d.id, d.data()))
    .filter((u): u is UserProfile & { role: 'shop' } => u.role === 'shop')
    .filter((u) => !shopName || u.shopName === shopName)

  rows.sort((a, b) => {
    const an = a.displayName || a.email
    const bn = b.displayName || b.email
    return an.localeCompare(bn) || a.email.localeCompare(b.email)
  })

  return rows
}

export async function listAllUsers(firestore: Firestore): Promise<UserProfile[]> {
  const snap = await getDocs(collection(firestore, 'users'))
  const rows = snap.docs.map((d) => userProfileFromDoc(d.id, d.data()))
  rows.sort((a, b) => {
    const an = a.displayName || a.email
    const bn = b.displayName || b.email
    return an.localeCompare(bn) || a.email.localeCompare(b.email)
  })
  return rows
}

export async function updateAccessibleShops(
  firestore: Firestore,
  uid: string,
  shops: ShopName[],
): Promise<void> {
  const ref = doc(firestore, 'users', uid)
  await updateDoc(ref, {
    accessibleShops: shops,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteUserProfileDoc(
  firestore: Firestore,
  uid: string,
): Promise<void> {
  const ref = doc(firestore, 'users', uid)
  await deleteDoc(ref)
}
