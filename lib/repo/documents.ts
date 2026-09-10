import { Timestamp } from 'firebase-admin/firestore'
import { getDb } from '@/lib/firebase/admin'
import { serializeDoc } from '@/lib/firebase/serialize'
import { incrementCaseCount } from './counters'
import { createId } from './ids'
import {
  deleteExtractedText,
  previewText,
  readExtractedText,
  saveExtractedText,
} from './text-store'
import { deleteStoredFile } from '@/lib/storage'

const COLLECTION = 'documents'

const DOCUMENT_FIELDS = [
  'filename',
  'cloudStoragePath',
  'isPublic',
  'fileSize',
  'mimeType',
  'sha256',
  'readStatus',
  'pageCount',
] as const

function toDocument(id: string, data: Record<string, unknown>, extractedText?: string | null) {
  const serialized = serializeDoc(id, data) as Record<string, unknown>
  const preview = typeof serialized.extractedTextPreview === 'string' ? serialized.extractedTextPreview : ''
  delete serialized.extractedTextPreview
  return {
    ...serialized,
    extractedText: extractedText ?? preview ?? null,
  }
}

export async function getDocumentById(id: string, withText = false) {
  const snap = await getDb().collection(COLLECTION).doc(id).get()
  if (!snap.exists) return null
  const text = withText ? await readExtractedText(id) : null
  return toDocument(snap.id, snap.data() ?? {}, text)
}

export async function listDocumentsByCase(caseId: string, withText = false) {
  const snap = await getDb()
    .collection(COLLECTION)
    .where('caseId', '==', caseId)
    .orderBy('uploadedAt', 'desc')
    .get()

  return Promise.all(
    snap.docs.map(async (doc) => {
      const text = withText ? await readExtractedText(doc.id) : null
      return toDocument(doc.id, doc.data(), text)
    })
  )
}

export async function getDocumentsWithText(ids: string[]) {
  if (!ids.length) return []
  const docs = await Promise.all(ids.map((id) => getDocumentById(id, true)))
  return docs.filter((doc): doc is NonNullable<typeof doc> => Boolean(doc))
}

export async function createDocument(input: {
  caseId: string
  filename: string
  cloudStoragePath: string
  isPublic?: boolean
  fileSize?: number
  mimeType?: string
  sha256: string
  readStatus?: string
}) {
  const id = createId()
  const ref = getDb().collection(COLLECTION).doc(id)
  const now = Timestamp.now()
  await ref.set({
    caseId: input.caseId,
    filename: input.filename,
    cloudStoragePath: input.cloudStoragePath,
    isPublic: input.isPublic ?? false,
    fileSize: input.fileSize ?? 0,
    mimeType: input.mimeType ?? 'application/pdf',
    sha256: input.sha256,
    readStatus: input.readStatus ?? 'PENDENTE',
    extractedTextPreview: null,
    textLength: 0,
    pageCount: null,
    uploadedAt: now,
  })
  await incrementCaseCount(input.caseId, 'documentCount', 1)
  const created = await ref.get()
  return toDocument(created.id, created.data() ?? {})
}

export async function updateDocument(id: string, input: Record<string, unknown>) {
  const ref = getDb().collection(COLLECTION).doc(id)
  const snap = await ref.get()
  if (!snap.exists) return null

  const data: Record<string, unknown> = {}
  for (const field of DOCUMENT_FIELDS) {
    if (input[field] !== undefined) data[field] = input[field]
  }
  if (typeof input.extractedText === 'string') {
    await saveExtractedText(id, input.extractedText)
    data.extractedTextPreview = previewText(input.extractedText)
    data.textLength = input.extractedText.length
  }

  if (Object.keys(data).length) await ref.update(data)
  return getDocumentById(id, true)
}

export async function setDocumentExtractedText(id: string, extractedText: string, pageCount: number, readStatus: string) {
  await saveExtractedText(id, extractedText)
  await getDb().collection(COLLECTION).doc(id).update({
    extractedTextPreview: previewText(extractedText),
    textLength: extractedText.length,
    pageCount,
    readStatus,
  })
  return getDocumentById(id, true)
}

export async function deleteDocumentRecord(id: string) {
  const snap = await getDb().collection(COLLECTION).doc(id).get()
  if (!snap.exists) return { success: true }
  const data = snap.data() ?? {}
  if (typeof data.cloudStoragePath === 'string') {
    try {
      await deleteStoredFile(data.cloudStoragePath)
    } catch (err) {
      console.error('Storage delete error:', err)
    }
  }
  await deleteExtractedText(id)
  await snap.ref.delete()
  if (typeof data.caseId === 'string') {
    await incrementCaseCount(data.caseId, 'documentCount', -1)
  }
  return { success: true }
}
