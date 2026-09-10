import { Timestamp } from 'firebase-admin/firestore'
import { getDb } from '@/lib/firebase/admin'
import { serializeDoc } from '@/lib/firebase/serialize'

const COLLECTION = 'providerConfigs'

export async function listProviderConfigs() {
  const snap = await getDb().collection(COLLECTION).get()
  return snap.docs.map((doc) => serializeDoc(doc.id, doc.data()))
}

export async function upsertProviderConfig(input: {
  provider: string
  model?: string
  enabled?: boolean
  apiKey?: string
}) {
  const ref = getDb().collection(COLLECTION).doc(input.provider)
  const snap = await ref.get()
  const now = Timestamp.now()

  if (!snap.exists) {
    await ref.set({
      provider: input.provider,
      apiKey: input.apiKey ?? '',
      model: input.model ?? '',
      enabled: input.enabled ?? true,
      updatedAt: now,
    })
  } else {
    const data: Record<string, unknown> = { updatedAt: now }
    if (input.model !== undefined) data.model = input.model
    if (input.enabled !== undefined) data.enabled = input.enabled
    if (input.apiKey !== undefined) data.apiKey = input.apiKey
    await ref.update(data)
  }

  const updated = await ref.get()
  return serializeDoc(updated.id, updated.data())
}
