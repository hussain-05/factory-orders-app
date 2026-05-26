import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
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
}

export async function listAllowedEmails(firestore: Firestore): Promise<AllowedEmail[]> {
  const snap = await getDocs(collection(firestore, allowedCol))
  return snap.docs
    .map((d) => ({
      email: d.id,
      isAdmin: d.data()?.isAdmin === true,
      added: true,
    }))
    .sort((a, b) => a.email.localeCompare(b.email))
}

export async function addAllowedEmail(
  firestore: Firestore,
  email: string,
  isAdmin: boolean,
): Promise<void> {
  const normalised = email.trim().toLowerCase()
  await setDoc(doc(firestore, allowedCol, normalised), { added: true, isAdmin })
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