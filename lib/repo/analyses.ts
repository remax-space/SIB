import { Timestamp } from 'firebase-admin/firestore'
import { getDb } from '@/lib/firebase/admin'
import { serializeDoc } from '@/lib/firebase/serialize'
import { incrementCaseCount } from './counters'
import { UniqueConstraintError } from './errors'
import { createId } from './ids'
import { deleteAnalysisBlobs, readLargeJson, storeLargeJson } from './text-store'

const COLLECTION = 'analyses'

const RESULT_FIELDS = [
  'basileResult',
  'advocadoResult',
  'cabecaResult',
  'auditorResult',
  'mestreResult',
  'orientacoesResult',
  'jurisprudenciaResult',
] as const

const UPDATE_FIELDS = [
  'missionLiteral',
  'authorizedProduct',
  'provider',
  'modelUsed',
  'runMode',
  'status',
  'documentIds',
  'currentAgent',
  'icpScore',
  'exitCode',
  'errorDetail',
  'completedAt',
  ...RESULT_FIELDS,
] as const

async function hydrateResults(data: Record<string, unknown>) {
  const next = { ...data }
  for (const field of RESULT_FIELDS) {
    if (next[field] != null) next[field] = await readLargeJson(next[field])
  }
  return next
}

function toAnalysis(id: string, data: Record<string, unknown>) {
  const serialized = serializeDoc(id, data) as Record<string, unknown>
  return {
    ...serialized,
    icpScore: serialized.icpScore != null ? Number(serialized.icpScore) : null,
  }
}

export async function listAnalysesByCase(caseId: string) {
  const snap = await getDb()
    .collection(COLLECTION)
    .where('caseId', '==', caseId)
    .orderBy('createdAt', 'desc')
    .get()

  return Promise.all(
    snap.docs.map(async (doc) => toAnalysis(doc.id, await hydrateResults(doc.data())))
  )
}

export async function getAnalysisById(id: string, includeCase = false) {
  const snap = await getDb().collection(COLLECTION).doc(id).get()
  if (!snap.exists) return null
  const analysis = toAnalysis(snap.id, await hydrateResults(snap.data() ?? {}))
  if (!includeCase) return analysis

  const caseSnap = await getDb().collection('cases').doc(String(analysis.caseId)).get()
  const caseData = caseSnap.exists ? serializeDoc(caseSnap.id, caseSnap.data()) : null
  return {
    ...analysis,
    case: caseData
      ? {
          id: caseData.id,
          caseId: caseData.caseId,
          title: caseData.title,
          clientName: caseData.clientName,
          classText: caseData.classText,
          cutoffDate: caseData.cutoffDate,
        }
      : null,
  }
}

export async function createAnalysis(input: {
  caseId: string
  jobId: string
  missionLiteral: string
  authorizedProduct?: string | null
  provider?: string
  modelUsed?: string | null
  runMode?: string
  status?: string
  documentIds: unknown
  currentAgent?: string | null
  basileResult?: unknown
  advocadoResult?: unknown
  cabecaResult?: unknown
  auditorResult?: unknown
  mestreResult?: unknown
  orientacoesResult?: unknown
  jurisprudenciaResult?: unknown
  icpScore?: number | null
  exitCode?: number | null
  errorDetail?: string | null
  completedAt?: Date | null
}) {
  const db = getDb()
  const id = createId()
  const ref = db.collection(COLLECTION).doc(id)
  const now = Timestamp.now()

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(db.collection(COLLECTION).where('jobId', '==', input.jobId).limit(1))
    if (!existing.empty) throw new UniqueConstraintError('Já existe uma análise com este jobId')
    tx.set(ref, {
      caseId: input.caseId,
      jobId: input.jobId,
      missionLiteral: input.missionLiteral,
      authorizedProduct: input.authorizedProduct ?? null,
      provider: input.provider ?? 'openai',
      modelUsed: input.modelUsed ?? null,
      runMode: input.runMode ?? 'COMPLETA',
      status: input.status ?? 'PENDENTE',
      documentIds: input.documentIds ?? [],
      currentAgent: input.currentAgent ?? null,
      basileResult: input.basileResult ?? null,
      advocadoResult: input.advocadoResult ?? null,
      cabecaResult: input.cabecaResult ?? null,
      auditorResult: input.auditorResult ?? null,
      mestreResult: input.mestreResult ?? null,
      orientacoesResult: input.orientacoesResult ?? null,
      jurisprudenciaResult: input.jurisprudenciaResult ?? null,
      icpScore: input.icpScore ?? null,
      exitCode: input.exitCode ?? null,
      errorDetail: input.errorDetail ?? null,
      createdAt: now,
      completedAt: input.completedAt ? Timestamp.fromDate(input.completedAt) : null,
    })
  })

  await incrementCaseCount(input.caseId, 'analysisCount', 1)
  const created = await ref.get()
  return toAnalysis(created.id, created.data() ?? {})
}

export async function updateAnalysis(id: string, input: Record<string, unknown>) {
  const ref = getDb().collection(COLLECTION).doc(id)
  const snap = await ref.get()
  if (!snap.exists) return null

  const data: Record<string, unknown> = {}
  for (const field of UPDATE_FIELDS) {
    if (input[field] === undefined) continue
    if ((RESULT_FIELDS as readonly string[]).includes(field)) {
      const packed = await storeLargeJson(id, field, input[field])
      data[field] = packed.stored
      continue
    }
    if (field === 'completedAt') {
      data.completedAt = input.completedAt instanceof Date ? Timestamp.fromDate(input.completedAt) : input.completedAt
      continue
    }
    data[field] = input[field]
  }

  if (Object.keys(data).length) await ref.update(data)
  return getAnalysisById(id)
}

export async function deleteAnalysisRecord(id: string, bumpCounter = true) {
  const snap = await getDb().collection(COLLECTION).doc(id).get()
  if (!snap.exists) return { ok: true }
  const caseId = snap.data()?.caseId
  await deleteAnalysisBlobs(id)
  await snap.ref.delete()
  if (bumpCounter && typeof caseId === 'string') {
    await incrementCaseCount(caseId, 'analysisCount', -1)
  }
  return { ok: true }
}

export async function upsertAnalysisByJobId(input: Parameters<typeof createAnalysis>[0]) {
  const existing = await getDb().collection(COLLECTION).where('jobId', '==', input.jobId).limit(1).get()
  if (!existing.empty) {
    return toAnalysis(existing.docs[0].id, existing.docs[0].data())
  }
  return createAnalysis(input)
}
