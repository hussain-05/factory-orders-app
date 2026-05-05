import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
  type FirebaseStorage,
} from 'firebase/storage'
import type { LimitedProduct, Unit, UnlimitedProduct } from '../types/models'

const unlimitedCol = 'unlimitedProducts'
const limitedCol = 'limitedProducts'
const allowedUnits: Unit[] = ['box', 'bag', 'pcs']

function normalizeUnit(value: unknown): Unit {
  const x = String(value ?? '').trim().toLowerCase() as Unit
  return allowedUnits.includes(x) ? x : 'pcs'
}

export async function listUnlimitedProducts(
  firestore: Firestore,
): Promise<UnlimitedProduct[]> {
  const qy = query(
    collection(firestore, unlimitedCol),
    where('active', '==', true),
    limit(500),
  )
  const snap = await getDocs(qy)
  const rows = snap.docs.map((d) => {
    const x = d.data()
    return {
      id: d.id,
      name: String(x.name ?? ''),
      size: String(x.size ?? ''),
      defaultUnit: normalizeUnit(x.defaultUnit),
      active: Boolean(x.active),
      sortIndex: Number(x.sortIndex ?? 0),
    }
  })
  rows.sort((a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name))
  return rows
}

export async function listAllUnlimitedForFactory(
  firestore: Firestore,
): Promise<UnlimitedProduct[]> {
  const qy = query(collection(firestore, unlimitedCol), orderBy('sortIndex', 'asc'), limit(1000))
  const snap = await getDocs(qy)
  return snap.docs.map((d) => {
    const x = d.data()
    return {
      id: d.id,
      name: String(x.name ?? ''),
      size: String(x.size ?? ''),
      defaultUnit: normalizeUnit(x.defaultUnit),
      active: Boolean(x.active ?? true),
      sortIndex: Number(x.sortIndex ?? 0),
    }
  })
}

export async function createUnlimitedProduct(
  firestore: Firestore,
  input: { name: string; size?: string; defaultUnit?: Unit },
) {
  const all = await getDocs(collection(firestore, unlimitedCol))
  const maxSort =
    all.docs.reduce((m, d) => Math.max(m, Number(d.data().sortIndex ?? 0)), 0) + 10
  await addDoc(collection(firestore, unlimitedCol), {
    name: input.name.trim(),
    size: (input.size ?? '').trim(),
    defaultUnit: normalizeUnit(input.defaultUnit),
    active: true,
    sortIndex: maxSort,
    createdAt: serverTimestamp(),
  })
}

export async function updateUnlimitedProduct(
  firestore: Firestore,
  id: string,
  patch: Partial<Pick<UnlimitedProduct, 'name' | 'size' | 'defaultUnit' | 'active' | 'sortIndex'>>,
) {
  const payload = { ...patch } as Record<string, unknown>
  if (patch.defaultUnit !== undefined) payload.defaultUnit = normalizeUnit(patch.defaultUnit)
  await updateDoc(doc(firestore, unlimitedCol, id), {
    ...payload,
    updatedAt: serverTimestamp(),
  })
}

export async function importUnlimitedCatalogueSeed(
  firestore: Firestore,
  rows: Array<{ name: string; size?: string; defaultUnit?: Unit; sortIndex?: number }>,
) {
  const all = await getDocs(collection(firestore, unlimitedCol))
  const existing = new Set(
    all.docs.map((d) => {
      const x = d.data()
      return `${String(x.name ?? '').trim().toLowerCase()}::${String(x.size ?? '').trim().toLowerCase()}`
    }),
  )
  let sortBase =
    all.docs.reduce((m, d) => Math.max(m, Number(d.data().sortIndex ?? 0)), 0) + 10

  for (const row of rows) {
    const name = row.name.trim()
    const size = (row.size ?? '').trim()
    if (!name) continue
    const key = `${name.toLowerCase()}::${size.toLowerCase()}`
    if (existing.has(key)) continue
    await addDoc(collection(firestore, unlimitedCol), {
      name,
      size,
      defaultUnit: normalizeUnit(row.defaultUnit),
      active: true,
      sortIndex: row.sortIndex ?? sortBase,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    existing.add(key)
    sortBase += 10
  }
}

export async function replaceUnlimitedCatalogue(
  firestore: Firestore,
  rows: Array<{ name: string; size?: string; defaultUnit?: Unit; sortIndex?: number }>,
) {
  const existing = await getDocs(collection(firestore, unlimitedCol))
  const toDelete = existing.docs
  for (let i = 0; i < toDelete.length; i += 400) {
    const batch = writeBatch(firestore)
    for (const d of toDelete.slice(i, i + 400)) {
      batch.delete(d.ref)
    }
    await batch.commit()
  }

  const dedup = new Map<string, { name: string; size: string; defaultUnit: Unit; sortIndex: number }>()
  let fallbackSort = 10
  for (const row of rows) {
    const name = row.name.trim()
    const size = (row.size ?? '').trim()
    if (!name) continue
    const key = `${name.toLowerCase()}::${size.toLowerCase()}`
    if (dedup.has(key)) continue
    dedup.set(key, {
      name,
      size,
      defaultUnit: normalizeUnit(row.defaultUnit),
      sortIndex: row.sortIndex ?? fallbackSort,
    })
    fallbackSort += 10
  }

  const entries = Array.from(dedup.values()).sort((a, b) => a.sortIndex - b.sortIndex)
  for (let i = 0; i < entries.length; i += 400) {
    const batch = writeBatch(firestore)
    for (const row of entries.slice(i, i + 400)) {
      const refDoc = doc(collection(firestore, unlimitedCol))
      batch.set(refDoc, {
        name: row.name,
        size: row.size,
        defaultUnit: row.defaultUnit,
        active: true,
        sortIndex: row.sortIndex,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    }
    await batch.commit()
  }
}

export async function deleteUnlimitedProduct(firestore: Firestore, id: string) {
  await deleteDoc(doc(firestore, unlimitedCol, id))
}

export async function listLimitedProducts(firestore: Firestore): Promise<LimitedProduct[]> {
  const qy = query(collection(firestore, limitedCol), orderBy('updatedAt', 'desc'), limit(200))
  const snap = await getDocs(qy)
  return snap.docs.map((d) => {
    const x = d.data()
    return {
      id: d.id,
      name: String(x.name ?? ''),
      size: String(x.size ?? ''),
      stock: Number(x.stock ?? 0),
      rate: Number(x.rate ?? 0),
      photoUrl: String(x.photoUrl ?? ''),
      createdAt:
        typeof x.createdAt?.toMillis === 'function' ? x.createdAt.toMillis() : Date.now(),
      updatedAt:
        typeof x.updatedAt?.toMillis === 'function' ? x.updatedAt.toMillis() : Date.now(),
    }
  })
}

export async function uploadLimitedProductPhoto(
  storage: FirebaseStorage,
  file: File,
  productId: string,
) {
  const compressed = await compressImageToMaxSize(file, 755 * 1024)
  const safe = file.name.replace(/[^\w.-]+/g, '_')
  const path = `limited-products/${productId}/${Date.now()}_${safe}.jpg`
  const r = ref(storage, path)
  await uploadBytes(r, compressed, { contentType: 'image/jpeg' })
  return getDownloadURL(r)
}

async function blobFromCanvas(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
  })
}

async function compressImageToMaxSize(file: File, maxBytes: number): Promise<File> {
  if (!file.type.startsWith('image/')) return file

  const imageUrl = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Could not read image.'))
      el.src = imageUrl
    })

    const maxDim = 2200
    let scale = Math.min(1, maxDim / Math.max(img.width, img.height))
    if (!Number.isFinite(scale) || scale <= 0) scale = 1

    for (let attempt = 0; attempt < 7; attempt += 1) {
      const width = Math.max(1, Math.floor(img.width * scale))
      const height = Math.max(1, Math.floor(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not initialize image compressor.')
      ctx.drawImage(img, 0, 0, width, height)

      for (const quality of [0.9, 0.82, 0.74, 0.66, 0.58, 0.5]) {
        const blob = await blobFromCanvas(canvas, quality)
        if (!blob) continue
        if (blob.size <= maxBytes) {
          const name = file.name.replace(/\.[a-zA-Z0-9]+$/, '') || 'product'
          return new File([blob], `${name}.jpg`, { type: 'image/jpeg' })
        }
      }
      scale *= 0.82
    }
  } finally {
    URL.revokeObjectURL(imageUrl)
  }

  return file
}

export async function createLimitedProduct(
  firestore: Firestore,
  input: { name: string; size: string; stock: number; rate: number; photoUrl: string },
) {
  const refDoc = await addDoc(collection(firestore, limitedCol), {
    name: input.name.trim(),
    size: input.size.trim(),
    stock: input.stock,
    rate: input.rate,
    photoUrl: input.photoUrl,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return refDoc.id
}

export async function createLimitedProductWithPhoto(
  firestore: Firestore,
  storage: FirebaseStorage,
  file: File,
  input: { name: string; size: string; stock: number; rate: number },
) {
  const id = doc(collection(firestore, limitedCol)).id
  await setDoc(doc(firestore, limitedCol, id), {
    name: input.name.trim(),
    size: input.size.trim(),
    stock: input.stock,
    rate: input.rate,
    photoUrl: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  const photoUrl = await uploadLimitedProductPhoto(storage, file, id)
  await updateDoc(doc(firestore, limitedCol, id), { photoUrl, updatedAt: serverTimestamp() })
  return id
}

export async function updateLimitedProduct(
  firestore: Firestore,
  id: string,
  input: Partial<{ name: string; size: string; stock: number; rate: number; photoUrl: string }>,
) {
  await updateDoc(doc(firestore, limitedCol, id), {
    ...input,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteLimitedProductWithPhoto(
  firestore: Firestore,
  storage: FirebaseStorage,
  input: { id: string; photoUrl?: string },
) {
  if (input.photoUrl) {
    try {
      await deleteObject(ref(storage, input.photoUrl))
    } catch {
      // Continue deleting doc even if photo is already missing.
    }
  }
  await deleteDoc(doc(firestore, limitedCol, input.id))
}
