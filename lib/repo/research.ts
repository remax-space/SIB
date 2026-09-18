import { randomUUID } from 'node:crypto'
import { getDb, getBucket } from '@/lib/firebase/admin'
import { hash } from '@/lib/research/identity'
import { ResearchError } from '@/lib/research/adapter'
import type { Evidence, Research, Result } from '@/lib/research/contracts'

const collection = () => getDb().collection('legalResearch')
export async function getResearch(id: string): Promise<Research | null> {
  const doc = await collection().doc(id).get()
  return doc.exists ? doc.data() as Research : null
}
export async function listResearch(analysisId: string): Promise<Research[]> {
  try {
    const docs = await collection().where('analysisId', '==', analysisId).orderBy('createdAt', 'desc').limit(100).get()
    return docs.docs.map(d => d.data() as Research)
  } catch (error) {
    const failure = error as { code?: unknown; message?: unknown }
    if (failure?.code === 9 && /requires an index/i.test(String(failure.message))) {
      throw new ResearchError('RESEARCH_HISTORY_INDEX_PENDING', 503)
    }
    throw error
  }
}
const lifecycle = (caseId: string) => getDb().collection('legalResearchLifecycle').doc(caseId)
export async function createResearch(record: Research) {
  await getDb().runTransaction(async tx => {
    const state = await tx.get(lifecycle(record.caseId))
    if (state.data()?.deleting) throw new ResearchError('CASE_DELETION_IN_PROGRESS')
    tx.set(collection().doc(record.id), record)
  })
}
export async function cachedResearch(fingerprint: string): Promise<Research | null> {
  const index = await getDb().collection('legalResearchLocks').doc(fingerprint).get()
  return index.data()?.researchId ? getResearch(index.data()!.researchId) : null
}
export type Quota = { userDaily: number; sharedDaily: number; sharedMonthly: number; concurrent: number }
export async function claimResearch(id: string, userId: string, approvalHash: string, currentContext: string, quota: Quota): Promise<{ record: Research; execute: boolean }> {
  const db = getDb(), now = Date.now()
  return db.runTransaction(async tx => {
    const ref = collection().doc(id), doc = await tx.get(ref)
    if (!doc.exists) throw new ResearchError('RESEARCH_NOT_FOUND', 404)
    const r = doc.data() as Research
    const caseState = await tx.get(lifecycle(r.caseId))
    if (caseState.data()?.deleting) throw new ResearchError('CASE_DELETION_IN_PROGRESS')
    if (r.userId !== userId || r.approvalHash !== approvalHash) throw new ResearchError('INVALID_APPROVAL', 403)
    if (r.contextVersion !== currentContext) throw new ResearchError('CONTEXT_CHANGED')
    if (r.state !== 'awaiting_confirmation') return { record: r, execute: false }
    if (r.expiresAt < now) throw new ResearchError('APPROVAL_EXPIRED')
    const lock = db.collection('legalResearchLocks').doc(r.fingerprint), lockDoc = await tx.get(lock)
    const previousId = lockDoc.data()?.researchId
    const previous = previousId ? await tx.get(collection().doc(previousId)) : null
    const p = previous?.data() as Research | undefined
    const sourceCaseState = p ? await tx.get(lifecycle(p.caseId)) : null
    if (sourceCaseState?.data()?.deleting) throw new ResearchError('CASE_DELETION_IN_PROGRESS')
    if (p && (p.state === 'running' || p.state === 'remote_uncertain')) throw new ResearchError(p.state === 'running' && (p.leaseUntil ?? 0) > now ? 'RESEARCH_IN_PROGRESS' : 'REMOTE_EXECUTION_UNCERTAIN')
    if (p?.resultPath && (p.validUntil ?? 0) > now && !r.plan.refresh && ['success', 'empty', 'partial'].includes(p.state)) {
      const reused: Research = { ...r, state: p.state, authorizedAt: now, finishedAt: now, reusedFrom: p.id, resultPath: p.resultPath, resultHash: p.resultHash, validUntil: p.validUntil, consumption: 0 }
      tx.update(ref, reused)
      return { record: reused, execute: false }
    }
    const day = new Date(now).toISOString().slice(0, 10), month = day.slice(0, 7)
    const keys = [`user-${hash(userId)}-${day}`, `shared-${day}`, `shared-${month}`]
    const limits = [quota.userDaily, quota.sharedDaily, quota.sharedMonthly]
    const budgets = await Promise.all(keys.map(k => tx.get(db.collection('legalResearchBudgets').doc(k))))
    const concurrencyRef = db.collection('legalResearchBudgets').doc('concurrency'), concurrencyDoc = await tx.get(concurrencyRef)
    // An expired lease remains occupied until an administrator reconciles it.
    // The remote provider may still be processing the request, so silently
    // dropping the entry here could exceed the configured shared concurrency.
    const active = { ...(concurrencyDoc.data()?.active ?? {}) }
    if (Object.keys(active).length >= quota.concurrent || budgets.some((b, i) => Number(b.data()?.reserved ?? 0) >= limits[i])) throw new ResearchError('LOCAL_BUDGET_EXHAUSTED', 429)
    const record: Research = { ...r, state: 'running', authorizedAt: now, leaseUntil: now + 65_000, budgetKeys: keys }
    keys.forEach((k, i) => tx.set(db.collection('legalResearchBudgets').doc(k), { reserved: Number(budgets[i].data()?.reserved ?? 0) + 1, updatedAt: now }))
    tx.set(concurrencyRef, { active: { ...active, [id]: record.leaseUntil } })
    tx.set(lock, { researchId: id })
    tx.update(ref, record)
    return { record, execute: true }
  })
}
export async function markDispatched(id: string): Promise<boolean> {
  return getDb().runTransaction(async tx => {
    const ref = collection().doc(id), doc = await tx.get(ref), r = doc.data() as Research
    if (!r || r.state !== 'running' || r.cancelRequestedAt || (r.leaseUntil ?? 0) < Date.now()) return false
    tx.update(ref, { dispatchedAt: Date.now() })
    return true
  })
}
export async function finishResearch(id: string, fields: Partial<Research>) {
  await getDb().runTransaction(async tx => {
    const ref = collection().doc(id), doc = await tx.get(ref)
    const concurrencyRef = getDb().collection('legalResearchBudgets').doc('concurrency'), concurrencyDoc = await tx.get(concurrencyRef)
    if (!doc.exists || doc.data()?.state !== 'running') return
    const active = { ...(concurrencyDoc.data()?.active ?? {}) }; delete active[id]
    tx.update(ref, { ...fields, finishedAt: Date.now() })
    tx.set(concurrencyRef, { active })
    // Reservations count attempted calls, never presumed refunds for remote failures.
  })
}
export async function requestResearchCancellation(id: string, userId: string) {
  await getDb().runTransaction(async tx => {
    const ref = collection().doc(id), doc = await tx.get(ref), r = doc.data() as Research | undefined
    if (!r) throw new ResearchError('RESEARCH_NOT_FOUND', 404)
    if (r.userId !== userId) throw new ResearchError('FORBIDDEN', 403)
    if (r.state === 'awaiting_confirmation') tx.update(ref, { state: 'cancelled', cancelRequestedAt: Date.now(), finishedAt: Date.now() })
    else if (r.state === 'running') tx.update(ref, { cancelRequestedAt: Date.now() })
  })
}
/**
 * Administrative reconciliation after a lease expires. This records remote
 * uncertainty and releases only the local concurrency slot; call reservations
 * remain consumed because the provider may have processed the request.
 */
export async function reconcileResearch(id: string) {
  const db = getDb(), now = Date.now()
  return db.runTransaction(async tx => {
    const ref = collection().doc(id), doc = await tx.get(ref)
    if (!doc.exists) throw new ResearchError('RESEARCH_NOT_FOUND', 404)
    const r = doc.data() as Research
    if (r.state !== 'running') return r
    if ((r.leaseUntil ?? 0) >= now) throw new ResearchError('RESEARCH_IN_PROGRESS', 409)
    const concurrencyRef = db.collection('legalResearchBudgets').doc('concurrency'), concurrencyDoc = await tx.get(concurrencyRef)
    const active = { ...(concurrencyDoc.data()?.active ?? {}) }
    delete active[id]
    const reconciled: Research = { ...r, state: 'remote_uncertain', errorCode: 'LEASE_EXPIRED_NO_REMOTE_CONFIRMATION', finishedAt: now, durationMs: Math.max(0, now - (r.authorizedAt ?? r.createdAt)) }
    tx.update(ref, reconciled)
    tx.set(concurrencyRef, { active })
    return reconciled
  })
}
export async function saveResearchResult(id: string, result: Result) {
  const path = `legal-research/${id}/result-v1.json`, json = JSON.stringify(result)
  if (Buffer.byteLength(json) > 12 * 1024 * 1024) throw new ResearchError('RESULT_TOO_LARGE', 502, true)
  await getBucket().file(path).save(json, { contentType: 'application/json', resumable: false, preconditionOpts: { ifGenerationMatch: 0 } })
  return { resultPath: path, resultHash: hash(result) }
}
export async function readResearchResult(r: Research): Promise<Result | null> {
  if (!r.resultPath) return null
  if (!/^legal-research\/[a-zA-Z0-9_-]+\/result-v1\.json$/.test(r.resultPath)) throw new ResearchError('INVALID_RESULT_PATH', 500)
  const [bytes] = await getBucket().file(r.resultPath).download()
  const result = JSON.parse(bytes.toString('utf8')) as Result
  if (hash(result) !== r.resultHash) throw new ResearchError('SNAPSHOT_INTEGRITY_FAILURE', 500)
  return result
}
export async function saveEvidence(evidence: Evidence) {
  const json = JSON.stringify(evidence)
  if (Buffer.byteLength(json) > 150_000) throw new ResearchError('EVIDENCE_CONTEXT_TOO_LARGE', 422)
  await getDb().runTransaction(async tx => {
    const state = await tx.get(lifecycle(evidence.caseId))
    if (state.data()?.deleting) throw new ResearchError('CASE_DELETION_IN_PROGRESS')
    tx.set(getDb().collection('legalEvidence').doc(evidence.id), evidence)
  })
}
export async function getEvidence(id: string): Promise<Evidence | null> {
  const doc = await getDb().collection('legalEvidence').doc(id).get()
  return doc.exists ? doc.data() as Evidence : null
}
export async function recordEvidenceUse(evidence: Evidence, analysisId: string, agent: string, turnId: string) {
  await getDb().runTransaction(async tx => {
    const state = await tx.get(lifecycle(evidence.caseId))
    if (state.data()?.deleting) throw new ResearchError('CASE_DELETION_IN_PROGRESS')
    tx.set(getDb().collection('legalEvidenceUses').doc(randomUUID()), { evidenceId: evidence.id, caseId: evidence.caseId, analysisId, agent, turnId, sourceIds: evidence.sourceIds, researchIds: evidence.researchIds, createdAt: Date.now() })
  })
}
export async function getEvidenceUses(analysisId: string) {
  const docs = await getDb().collection('legalEvidenceUses').where('analysisId', '==', analysisId).get()
  return docs.docs.map(d => d.data())
}

/** Called before case removal; failures propagate so cleanup can be retried. Shared snapshots referenced by other cases are retained. */
export async function deleteCaseResearch(caseId: string) {
  const db = getDb()
  await db.runTransaction(async tx => {
    const state = await tx.get(lifecycle(caseId))
    const current = await tx.get(collection().where('caseId', '==', caseId))
    if (current.docs.some(d => d.data().state === 'running')) throw new ResearchError('RESEARCH_IN_PROGRESS')
    tx.set(lifecycle(caseId), { deleting: true, startedAt: state.data()?.startedAt ?? Date.now() })
  })
  // Tombstone remains after deletion, including failed/retried cleanup. New writes read it transactionally.
  const docs = await collection().where('caseId', '==', caseId).get()
  for (const doc of docs.docs) {
    const r = doc.data() as Research
    const references = r.resultPath ? await collection().where('resultPath', '==', r.resultPath).get() : null
    if (r.resultPath && !references?.docs.some(d => d.data().caseId !== caseId)) await getBucket().file(r.resultPath).delete({ ignoreNotFound: true })
    await db.runTransaction(async tx => {
      const lock = db.collection('legalResearchLocks').doc(r.fingerprint), current = await tx.get(lock)
      if (current.data()?.researchId === r.id) tx.delete(lock)
      tx.delete(doc.ref)
    })
    const [orphans] = await getBucket().getFiles({ prefix: `legal-research/${r.id}/` })
    if (!references?.docs.some(d => d.data().caseId !== caseId)) await Promise.all(orphans.map(f => f.delete({ ignoreNotFound: true })))
  }
  for (const name of ['legalEvidence', 'legalEvidenceUses']) {
    const related = await db.collection(name).where('caseId', '==', caseId).get()
    for (const doc of related.docs) await doc.ref.delete()
  }
}
