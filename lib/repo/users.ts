import { Timestamp } from 'firebase-admin/firestore'
import { getDb } from '@/lib/firebase/admin'
import { serializeDoc } from '@/lib/firebase/serialize'
import { createId } from './ids'

const COLLECTION = 'users'

export async function findUserByEmail(email: string) {
  const docId = email.trim().toLowerCase()
  const snap = await getDb().collection(COLLECTION).doc(docId).get()
  if (!snap.exists) return null
  const data = snap.data() ?? {}
  return {
    id: String(data.id ?? snap.id),
    email: String(data.email ?? snap.id),
    password: String(data.password ?? ''),
    name: (data.name as string | null) ?? null,
    role: String(data.role ?? 'ADMIN'),
  }
}

export async function upsertUser(input: {
  email: string
  password: string
  name?: string | null
  role?: string
}) {
  const email = input.email.trim().toLowerCase()
  const ref = getDb().collection(COLLECTION).doc(email)
  const snap = await ref.get()
  const now = Timestamp.now()

  if (!snap.exists) {
    await ref.set({
      id: createId(),
      email,
      password: input.password,
      name: input.name ?? null,
      role: input.role ?? 'ADMIN',
      createdAt: now,
    })
  } else {
    await ref.update({
      password: input.password,
      name: input.name ?? snap.data()?.name ?? null,
      role: input.role ?? snap.data()?.role ?? 'ADMIN',
    })
  }

  const updated = await ref.get()
  const data = updated.data() ?? {}
  return serializeDoc(String(data.id ?? updated.id), { ...data, email }) as {
    id: string
    email: string
    password: string
    name: string | null
    role: string
  }
}
