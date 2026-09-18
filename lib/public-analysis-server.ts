import { getEvidence } from '@/lib/repo/research'
import { publicAnalysis, publicConversation, type SourceDocument } from './public-result'

/** Resolve human-readable citation labels from persisted sources, never from model-invented links. */
export async function presentAnalysisRecord(record: Record<string, unknown>, documents: SourceDocument[]) {
  const ids = new Set<string>()
  if (typeof record.evidenceId === 'string') ids.add(record.evidenceId)
  for (const turn of Array.isArray(record.conversation) ? record.conversation : []) {
    if (typeof turn?.researchEvidence?.evidenceId === 'string') ids.add(turn.researchEvidence.evidenceId)
  }
  const evidence = await Promise.all([...ids].map(id => getEvidence(id)))
  const sourcesFor = (id: unknown) => evidence.find(e => e != null && e.id === id && e.caseId === record.caseId)?.sources ?? []
  const inventory = Array.isArray(record.documentSources) ? record.documentSources : []
  const resolved = documents.map(doc => ({ ...doc, pageCount: doc.pageCount ?? inventory.find(d => d.id === doc.id)?.pageCount ?? null }))
  const projected = publicAnalysis(record, resolved, sourcesFor(record.evidenceId))
  projected.conversation = (Array.isArray(record.conversation) ? record.conversation : []).flatMap(turn =>
    publicConversation([turn], resolved, sourcesFor(turn?.researchEvidence?.evidenceId), record.missionLiteral))
  return projected
}
