import { deleteCaseResearch, markCaseDeletionCompleted, markCaseDeletionFailed } from './research'
import { ResearchError } from '@/lib/research/adapter'
import { Timestamp } from 'firebase-admin/firestore'
import { getDb } from '@/lib/firebase/admin'
import { serializeDoc } from '@/lib/firebase/serialize'
import { UniqueConstraintError } from './errors'
import { createId } from './ids'
import { deleteAnalysisRecord, listAnalysesByCase } from './analyses'
import { deleteDocumentRecord, listDocumentsByCase } from './documents'

const COLLECTION = 'cases'

const CASE_FIELDS = [
  'caseId',
  'title',
  'clientName',
  'clientDoc',
  'classText',
  'primaryRole',
  'status',
  'objective',
  'notes',
  'cutoffDate',
] as const

type CaseRecord = Record<string, unknown> & { id: string; _count: { documents: number; analyses: number } }

function toCase(id: string, data: Record<string, unknown>): CaseRecord {
  const serialized = serializeDoc(id, data) as Record<string, unknown>
  const documentCount = Number(serialized.documentCount ?? 0)
  const analysisCount = Number(serialized.analysisCount ?? 0)
  delete serialized.documentCount
  delete serialized.analysisCount
  return {
    ...serialized,
    _count: { documents: documentCount, analyses: analysisCount },
  } as CaseRecord
}

export async function listCases(filters: { status?: string | null; classText?: string | null } = {}) {
  const col = getDb().collection(COLLECTION)
  const snap = filters.status && filters.classText
    ? await col.where('status', '==', filters.status).where('classText', '==', filters.classText).orderBy('createdAt', 'desc').get()
    : filters.status
      ? await col.where('status', '==', filters.status).orderBy('createdAt', 'desc').get()
      : filters.classText
        ? await col.where('classText', '==', filters.classText).orderBy('createdAt', 'desc').get()
        : await col.orderBy('createdAt', 'desc').get()

  return snap.docs.map((doc) => toCase(doc.id, doc.data()))
}

export async function getCaseById(id: string, includeChildren = false) {
  const snap = await getDb().collection(COLLECTION).doc(id).get()
  if (!snap.exists) return null
  const base = toCase(snap.id, snap.data() ?? {})
  if (!includeChildren) return base

  const [documents, analyses] = await Promise.all([
    listDocumentsByCase(id, true),
    listAnalysesByCase(id),
  ])

  return { ...base, documents, analyses }
}

export async function createCase(input: {
  caseId: string
  title: string
  clientName: string
  clientDoc?: string | null
  classText: string
  primaryRole: string
  objective?: string | null
  cutoffDate?: string | null
  notes?: string | null
  status?: string
}) {
  const db = getDb()
  const id = createId()
  const ref = db.collection(COLLECTION).doc(id)
  const now = Timestamp.now()

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(db.collection(COLLECTION).where('caseId', '==', input.caseId).limit(1))
    if (!existing.empty) throw new UniqueConstraintError('Já existe um caso com este número processual')
    tx.set(ref, {
      caseId: input.caseId,
      title: input.title,
      clientName: input.clientName,
      clientDoc: input.clientDoc ?? null,
      classText: input.classText,
      primaryRole: input.primaryRole,
      status: input.status ?? 'ATIVO',
      objective: input.objective ?? null,
      cutoffDate: input.cutoffDate ?? null,
      notes: input.notes ?? null,
      documentCount: 0,
      analysisCount: 0,
      createdAt: now,
      updatedAt: now,
    })
  })

  const created = await ref.get()
  return toCase(created.id, created.data() ?? {})
}

export async function updateCase(id: string, input: Record<string, unknown>) {
  const db = getDb()
  const ref = db.collection(COLLECTION).doc(id)

  const data: Record<string, unknown> = { updatedAt: Timestamp.now() }
  for (const field of CASE_FIELDS) {
    if (input[field] !== undefined) data[field] = input[field]
  }

  const didUpdate = await db.runTransaction(async tx => {
    const snap = await tx.get(ref)
    if (!snap.exists) return null
    const lifecycle = await tx.get(db.collection('legalResearchLifecycle').doc(id))
    if (lifecycle.data()?.deleting) throw new ResearchError('CASE_DELETION_IN_PROGRESS')
    tx.update(ref, data as any)
    return true
  })
  if (!didUpdate) return null
  const updated = await ref.get()
  return toCase(updated.id, updated.data() ?? {})
}

export async function deleteCase(id: string) {
  const db = getDb()
  const caseRef = db.collection(COLLECTION).doc(id)
  const initial = await caseRef.get()
  const wasPresent = initial.exists
  try {
    await deleteCaseResearch(id)
    if (wasPresent) await caseRef.update({ deletionStatus: 'EM_ANDAMENTO', deletionUpdatedAt: Timestamp.now() })

    const [documents, analyses] = await Promise.all([
      listDocumentsByCase(id, false),
      listAnalysesByCase(id, false),
    ])

    // The limit is intentionally sequential: each child cleanup is resumable
    // and counters are changed transactionally with the child deletion.
    for (const doc of documents) await deleteDocumentRecord(doc.id, { allowCaseDeleting: true })
    for (const analysis of analyses) await deleteAnalysisRecord(analysis.id, false, { allowCaseDeleting: true })

    await caseRef.delete()
    await markCaseDeletionCompleted(id)
    return { success: true, status: wasPresent ? 'deleted' as const : 'already_absent' as const }
  } catch (error) {
    const code = error instanceof ResearchError ? error.code : undefined
    if (code === 'RESEARCH_IN_PROGRESS' || code === 'CASE_DELETION_IN_PROGRESS') throw error
    try { await markCaseDeletionFailed(id, error) } catch (markError) { console.error('Case deletion state error:', markError) }
    const cleanupError = new Error('A limpeza dos dados vinculados não foi concluída. Tente novamente para retomar a operação.') as Error & { code: string; retryable: boolean; cause?: unknown }
    cleanupError.code = 'CASE_CLEANUP_INCOMPLETE'
    cleanupError.retryable = true
    cleanupError.cause = error
    throw cleanupError
  }
}

export async function upsertCaseByProcessNumber(input: Parameters<typeof createCase>[0] & { id?: string }) {
  const db = getDb()
  const existing = await db.collection(COLLECTION).where('caseId', '==', input.caseId).limit(1).get()
  if (!existing.empty) {
    const doc = existing.docs[0]
    return toCase(doc.id, doc.data())
  }
  return createCase(input)
}

