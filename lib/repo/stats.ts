import { getDb } from '@/lib/firebase/admin'
import { serializeDoc } from '@/lib/firebase/serialize'
import { listCases } from './cases'

async function countCollection(name: string, field?: string, value?: unknown) {
  const col = getDb().collection(name)
  const snap = field !== undefined ? await col.where(field, '==', value).count().get() : await col.count().get()
  return snap.data().count
}

export async function getDashboardStats() {
  const [totalCases, totalAnalyses, totalDocs, inProgress, recentCaseRows, recentAnalysisRows] = await Promise.all([
    countCollection('cases'),
    countCollection('analyses'),
    countCollection('documents'),
    countCollection('analyses', 'status', 'EM_ANDAMENTO'),
    listCases(),
    getDb().collection('analyses').orderBy('createdAt', 'desc').limit(5).get(),
  ])

  const recentCases = recentCaseRows.slice(0, 5).map((row) => ({
    id: row.id,
    caseId: row.caseId,
    title: row.title,
    clientName: row.clientName,
    classText: row.classText,
    status: row.status,
    createdAt: row.createdAt,
  }))

  const recentAnalyses = await Promise.all(
    recentAnalysisRows.docs.map(async (doc) => {
      const analysis = serializeDoc(doc.id, doc.data()) as Record<string, any>
      const caseSnap = analysis.caseId ? await getDb().collection('cases').doc(String(analysis.caseId)).get() : null
      const caseData = caseSnap?.exists ? serializeDoc(caseSnap.id, caseSnap.data()) : null
      return {
        ...analysis,
        icpScore: analysis.icpScore != null ? Number(analysis.icpScore) : null,
        case: caseData ? { caseId: caseData.caseId, title: caseData.title } : null,
      }
    })
  )

  return {
    totalCases,
    totalAnalyses,
    totalDocs,
    inProgress,
    recentCases,
    recentAnalyses,
  }
}
