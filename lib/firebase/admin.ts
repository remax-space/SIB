import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import { getStorage, type Storage } from 'firebase-admin/storage'

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Variável de ambiente ausente: ${name}`)
  }
  return value
}

function getAdminApp(): App {
  const existing = getApps()[0]
  if (existing) return existing

  const privateKey = requireEnv('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n')

  return initializeApp({
    credential: cert({
      projectId: requireEnv('FIREBASE_PROJECT_ID'),
      clientEmail: requireEnv('FIREBASE_CLIENT_EMAIL'),
      privateKey,
    }),
    storageBucket: requireEnv('FIREBASE_STORAGE_BUCKET'),
  })
}

let firestore: Firestore | undefined
let storage: Storage | undefined

export function getDb() {
  if (!firestore) firestore = getFirestore(getAdminApp())
  return firestore
}

export function getBucket() {
  if (!storage) storage = getStorage(getAdminApp())
  return storage.bucket()
}
