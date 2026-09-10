import { Timestamp } from 'firebase-admin/firestore'
import { getDb } from '@/lib/firebase/admin'
import { serializeDoc } from '@/lib/firebase/serialize'
import { createId } from './ids'

const COLLECTION = 'licenses'

export async function listLicenses() {
  const snap = await getDb().collection(COLLECTION).orderBy('createdAt', 'desc').get()
  return snap.docs.map((doc) => serializeDoc(doc.id, doc.data()))
}

export async function findLicenseByKey(key: string) {
  const snap = await getDb().collection(COLLECTION).where('key', '==', key).limit(1).get()
  if (snap.empty) return null
  return serializeDoc(snap.docs[0].id, snap.docs[0].data()) as Record<string, any>
}

export async function findLicenseById(id: string) {
  const snap = await getDb().collection(COLLECTION).doc(id).get()
  if (!snap.exists) return null
  return serializeDoc(snap.id, snap.data()) as Record<string, any>
}

export async function createLicense(input: { key: string; label: string; notes?: string | null }) {
  const id = createId()
  const now = Timestamp.now()
  await getDb().collection(COLLECTION).doc(id).set({
    key: input.key,
    label: input.label,
    notes: input.notes ?? null,
    fingerprint: null,
    active: true,
    revoked: false,
    activatedAt: null,
    lastSeenAt: null,
    createdAt: now,
  })
  const created = await getDb().collection(COLLECTION).doc(id).get()
  return serializeDoc(created.id, created.data())
}

export async function updateLicense(id: string, input: Record<string, unknown>) {
  const ref = getDb().collection(COLLECTION).doc(id)
  const snap = await ref.get()
  if (!snap.exists) return null

  const data: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (value instanceof Date) data[key] = Timestamp.fromDate(value)
    else data[key] = value
  }
  await ref.update(data)
  const updated = await ref.get()
  return serializeDoc(updated.id, updated.data())
}

export async function deleteLicense(id: string) {
  await getDb().collection(COLLECTION).doc(id).delete()
  return { success: true }
}
