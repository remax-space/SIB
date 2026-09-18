import { randomUUID } from 'node:crypto'
import { getBucket } from '@/lib/firebase/admin'
import { textAvailability, shouldPreserveExtraction, type ExtractionInfo } from '@/lib/extraction-integrity'
import { Timestamp } from 'firebase-admin/firestore'
import { getDb } from '@/lib/firebase/admin'
import { serializeDoc } from '@/lib/firebase/serialize'
import { incrementCaseCount } from './counters'
import { createId } from './ids'
import {
  deleteExtractedText,
  previewText,
  readExtractedText,
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

function toDocument(id: string, data: Record<string, unknown>, extractedText?: string | null, readFailed = false): Record<string, unknown> & { id: string; extractedText: string; textSource: string } {
  const serialized = serializeDoc(id, data) as Record<string, unknown>
  const availability = textAvailability(serialized, extractedText, readFailed)
  delete serialized.extractedTextPreview
  return {
    ...serialized,
    id,
    ...availability,
  }
}

export async function getDocumentById(id: string, withText = false) {
  const snap = await getDb().collection(COLLECTION).doc(id).get()
  if (!snap.exists) return null
  const data = snap.data() ?? {}
  try {
    const text = withText ? await readExtractedText(id, data.extractedTextPath) : null
    return toDocument(snap.id, data, text)
  } catch {
    return toDocument(snap.id, data, null, true)
  }
}

export async function listDocumentsByCase(caseId: string, withText = false) {
  const snap = await getDb()
    .collection(COLLECTION)
    .where('caseId', '==', caseId)
    .orderBy('uploadedAt', 'desc')
    .get()

  return Promise.all(
    snap.docs.map(async (doc) => {
      try {
        const text = withText ? await readExtractedText(doc.id, doc.data().extractedTextPath) : null
        return toDocument(doc.id, doc.data(), text)
      } catch { return toDocument(doc.id, doc.data(), null, true) }
    })
  )
}

export async function listRecentDocuments(limit = 200) {
  const snap = await getDb()
    .collection(COLLECTION)
    .orderBy('uploadedAt', 'desc')
    .limit(Math.min(Math.max(limit, 1), 500))
    .get()

  return snap.docs.map((doc) => toDocument(doc.id, doc.data()))
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
    await setDocumentExtractedText(id, input.extractedText, typeof input.pageCount === 'number' ? input.pageCount : null, 'LIDO_PARCIALMENTE')
    delete data.readStatus
    delete data.pageCount
  }

  if (Object.keys(data).length) await ref.update(data)
  return getDocumentById(id, true)
}

export async function setDocumentExtractedText(id: string, extractedText: string, pageCount: number | null, _readStatus: string, info?: ExtractionInfo) {
  const ref = getDb().collection(COLLECTION).doc(id)
  const before = await ref.get()
  if (!before.exists) return null
  const data = before.data() ?? {}
  // Do not replace a valid version if its storage cannot currently be read.
  let previous: string | null
  try { previous = await readExtractedText(id, data.extractedTextPath) }
  catch (error) { await ref.update({ storageStatus: 'READ_FAILED' }); throw error }
  if (shouldPreserveExtraction(previous, extractedText, data.extractionInfo, info)) return getDocumentById(id, true)
  const path = 'extracted/' + id + '/' + randomUUID() + '.txt'
  try {
    await getBucket().file(path).save(extractedText, { contentType: 'text/plain; charset=utf-8', resumable: false })
  } catch (error) {
    await ref.update({ storageStatus: 'WRITE_FAILED' })
    throw error
  }
  // Immutable text blob first, then atomic metadata pointer; concurrent retries cannot overwrite it.
  await getDb().runTransaction(async tx => {
    const current = await tx.get(ref)
    if (current.updateTime?.isEqual(before.updateTime!)) {
      tx.update(ref, {
        extractedTextPath: path, extractedTextPreview: previewText(extractedText), textLength: extractedText.length,
        pageCount, readStatus: extractedText.trim() ? 'LIDO_PARCIALMENTE' : 'ILEGIVEL',
        extractionStatus: extractedText.trim() ? 'PARTIAL' : 'NO_TEXT', storageStatus: 'STORED',
        extractionInfo: info ?? { pageCount, textPages: [], emptyPages: [], status: extractedText.trim() ? 'PARTIAL' : 'NO_TEXT', method: 'UNKNOWN' },
      })
    } else { throw new Error('Extração atualizada em outra sessão; versão anterior preservada.') }
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
