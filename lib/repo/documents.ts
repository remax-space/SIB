import { randomUUID } from 'node:crypto'
import { getBucket } from '@/lib/firebase/admin'
import { textAvailability, shouldPreserveExtraction, type ExtractionInfo } from '@/lib/extraction-integrity'
import { Timestamp } from 'firebase-admin/firestore'
import { FieldValue } from 'firebase-admin/firestore'
import { getDb } from '@/lib/firebase/admin'
import { serializeDoc } from '@/lib/firebase/serialize'
import { createId } from './ids'
import {
  deleteExtractedText,
  previewText,
  readExtractedText,
} from './text-store'
import { deleteStoredFile } from '@/lib/storage'
import { assertCaseWritableInTransaction } from './research'

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
  await getDb().runTransaction(async tx => {
    const caseRef = getDb().collection('cases').doc(input.caseId)
    const caseSnap = await tx.get(caseRef)
    if (!caseSnap.exists) throw new Error('Caso não encontrado')
    await assertCaseWritableInTransaction(tx, input.caseId)
    tx.set(ref, {
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
    tx.update(caseRef, { documentCount: FieldValue.increment(1), updatedAt: now })
  })
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

  if (Object.keys(data).length) {
    await getDb().runTransaction(async tx => {
      const current = await tx.get(ref)
      if (!current.exists) return
      const caseId = current.data()?.caseId
      if (typeof caseId === 'string') await assertCaseWritableInTransaction(tx, caseId)
      tx.update(ref, data as any)
    })
  }
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
    const caseId = current.data()?.caseId
    if (typeof caseId === 'string') await assertCaseWritableInTransaction(tx, caseId)
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

export async function deleteDocumentRecord(id: string, options: { allowCaseDeleting?: boolean } = {}) {
  const snap = await getDb().collection(COLLECTION).doc(id).get()
  if (!snap.exists) return { success: true, status: 'already_absent' as const }
  const data = snap.data() ?? {}
  const caseId = typeof data.caseId === 'string' ? data.caseId : null
  if (caseId && !options.allowCaseDeleting) {
    await getDb().runTransaction(async tx => { await assertCaseWritableInTransaction(tx, caseId) })
  }
  if (typeof data.cloudStoragePath === 'string') {
    await deleteStoredFile(data.cloudStoragePath)
  }
  const hasExtractedText = typeof data.extractedTextPath === 'string' || Number(data.textLength ?? 0) > 0 || Boolean(data.extractedTextPreview)
  if (hasExtractedText) await deleteExtractedText(id, typeof data.extractedTextPath === 'string' ? data.extractedTextPath : undefined)
  await getDb().runTransaction(async tx => {
    const current = await tx.get(snap.ref)
    if (!current.exists) return
    const currentCaseId = current.data()?.caseId
    const caseRef = typeof currentCaseId === 'string' ? getDb().collection('cases').doc(currentCaseId) : null
    const caseSnap = caseRef ? await tx.get(caseRef) : null
    if (typeof currentCaseId === 'string' && !options.allowCaseDeleting) await assertCaseWritableInTransaction(tx, currentCaseId)
    tx.delete(snap.ref)
    if (caseRef && caseSnap?.exists) tx.update(caseRef, { documentCount: FieldValue.increment(-1), updatedAt: Timestamp.now() })
  })
  return { success: true, status: 'deleted' as const }
}
