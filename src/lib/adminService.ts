import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore'

const allowedCol = 'allowedEmails'
const settingsDoc = (firestore: Firestore) => doc(firestore, 'settings', 'app')

export interface AllowedEmail {
  email: string
  isAdmin: boolean
  added: boolean
  role?: string
}

export async function listAllowedEmails(firestore: Firestore): Promise<AllowedEmail[]> {
  const snap = await getDocs(collection(firestore, allowedCol))
  return snap.docs
    .map((d) => ({
      email: d.id,
      isAdmin: d.data()?.isAdmin === true,
      added: true,
      role: d.data()?.role,
    }))
    .sort((a, b) => a.email.localeCompare(b.email))
}

export async function addAllowedEmail(
  firestore: Firestore,
  email: string,
  isAdmin: boolean,
  role?: string,
): Promise<void> {
  const normalised = email.trim().toLowerCase()
  const data: Record<string, unknown> = { added: true, isAdmin }
  if (role) data.role = role
  await setDoc(doc(firestore, allowedCol, normalised), data)
}

export async function removeAllowedEmail(
  firestore: Firestore,
  email: string,
): Promise<void> {
  await deleteDoc(doc(firestore, allowedCol, email))
}

export async function setAdminStatus(
  firestore: Firestore,
  email: string,
  isAdmin: boolean,
): Promise<void> {
  await updateDoc(doc(firestore, allowedCol, email), { isAdmin })
}

export async function getFactoryWhatsappNumber(firestore: Firestore): Promise<string> {
  const snap = await getDoc(settingsDoc(firestore))
  return snap.exists() ? (snap.data()?.factoryWhatsappNumber ?? '') : ''
}

export async function setFactoryWhatsappNumber(
  firestore: Firestore,
  number: string,
): Promise<void> {
  await setDoc(settingsDoc(firestore), { factoryWhatsappNumber: number.trim() }, { merge: true })
}

export function subscribeAllowedEmails(
  firestore: Firestore,
  onData: (emails: AllowedEmail[]) => void,
  onError?: (err: Error) => void,
): () => void {
  return onSnapshot(
    collection(firestore, allowedCol),
    (snap) => {
      const rows = snap.docs
        .map((d) => ({
          email: d.id,
          isAdmin: d.data()?.isAdmin === true,
          added: true,
          role: d.data()?.role,
        }))
        .sort((a, b) => a.email.localeCompare(b.email))
      onData(rows)
    },
    (err) => onError?.(err),
  )
}