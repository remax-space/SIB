import { getDb } from '@/lib/firebase/admin'

const COLLECTION = 'settings'

export async function getSetting(key: string): Promise<string> {
  const snap = await getDb().collection(COLLECTION).doc(key).get()
  const value = snap.data()?.value
  return typeof value === 'string' ? value : ''
}

export async function setSetting(key: string, value: string) {
  await getDb().collection(COLLECTION).doc(key).set({ key, value }, { merge: true })
}
