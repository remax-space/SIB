import { randomBytes, randomUUID } from 'node:crypto'
import { getAnalysisById, getCaseById, getDocumentsWithText, getSetting } from '@/lib/db'
import { validateDocumentSelection } from '@/lib/document-sources'
import { fetchJurisprudencia } from '@/lib/jurisprudencia-fetch'
import * as repo from '@/lib/repo/research'
import { CONTRACT_VERSION, planSchema, providerParameters, resultSchema, safeSourceUrl, selectionSchema, type Plan, type Research, type Result, type Evidence } from './contracts'
import { contextVersion, fingerprint, hash } from './identity'
import { ResearchError, type ResearchAdapter } from './adapter'
import { legawMcpAdapter } from './mcp'
import { mcpConnectionState, mcpConnectionVersion } from './connection'

export async function researchContext(analysisId: string, caseId?: string) {
  const analysis = await getAnalysisById(analysisId) as Record<string, unknown> | null
  if (!analysis) throw new ResearchError('ANALYSIS_NOT_FOUND', 404)
  if (caseId && analysis.caseId !== caseId) throw new ResearchError('CASE_ANALYSIS_MISMATCH', 400)
  const caseData = await getCaseById(String(analysis.caseId)) as Record<string, unknown> | null
  if (!caseData) throw new ResearchError('CASE_NOT_FOUND', 404)
  const docs = await getDocumentsWithText(Array.isArray(analysis.documentIds) ? analysis.documentIds as string[] : [])
  validateDocumentSelection(String(analysis.caseId), analysis.documentIds, docs)
  return { analysis, caseData, version: contextVersion(analysis, caseData, docs) }
}
async function connection(provider: Plan['provider']) {
  if (provider === 'legaw') return { enabled: (await mcpConnectionState()).active, version: mcpConnectionVersion(), adapter: legawMcpAdapter }
  const [enabled, key, endpoint, name] = await Promise.all(['jurisprudencia_enabled', 'jurisprudencia_api_key', 'jurisprudencia_endpoint', 'jurisprudencia_provider'].map(getSetting))
  // A legacy setting must never be able to point at Legaw and bypass the
  // central adapter, including data written before the guarded admin route.
  if (String(name).toLowerCase() === 'legaw' || /legaw\.ai/i.test(String(endpoint))) {
    return { enabled: false, version: CONTRACT_VERSION, adapter: legawMcpAdapter }
  }
  return { enabled: enabled === 'true' && !!key && !!endpoint, version: hash([name, endpoint, key]), adapter: { async execute(_plan: Plan, parameters: Record<string, unknown>, signal: AbortSignal): Promise<Result> {
    const response = await fetchJurisprudencia(name, key, endpoint, String(parameters.query), signal)
    return { sources: response.text ? [{ id: 'legacy-response', title: 'Retorno da base contratada — metadados não normalizados', text: response.text }] : [], raw: response.raw, partial: response.partial, limitations: ['Adaptador legado: resumo textual; datas, links e identificadores individuais não verificados. A resposta original é preservada separadamente no snapshot.'], consumption: null }
  } } satisfies ResearchAdapter }
}
export async function researchAvailability() {
  const state = await mcpConnectionState()
  return { available: state.active, blockers: state.blockers, legacyAvailable: (await connection('legacy')).enabled }
}
function quotaNumber(name: string, fallback: number) { const n = Number(process.env[name]); return Number.isSafeInteger(n) && n >= 0 ? n : fallback }
export function researchQuotas(): repo.Quota { return { userDaily: quotaNumber('RESEARCH_USER_DAILY_CALLS', 10), sharedDaily: quotaNumber('RESEARCH_SHARED_DAILY_CALLS', 30), sharedMonthly: quotaNumber('RESEARCH_SHARED_MONTHLY_CALLS', 200), concurrent: quotaNumber('RESEARCH_CONCURRENT_CALLS', 2) } }

export async function prepareResearch(input: unknown, userId: string) {
  const plan = planSchema.parse(input), ctx = await researchContext(plan.analysisId, plan.caseId)
  if (ctx.analysis.status !== 'CONCLUIDO') throw new ResearchError('ANALYSIS_NOT_COMPLETE')
  const cutoff = typeof ctx.caseData.cutoffDate === 'string' ? ctx.caseData.cutoffDate.slice(0, 10) : null
  if (cutoff && plan.tool === 'buscar_jurisprudencia' && plan.provider === 'legaw' && !plan.allowAfterCutoff && (!plan.endDate || plan.endDate > cutoff)) throw new ResearchError('DEFINE_PERIOD_WITHIN_CUTOFF', 422)
  const cfg = await connection(plan.provider), fp = fingerprint(plan, cfg.version, ctx.version), token = randomBytes(32).toString('hex'), now = Date.now()
  const record: Research = { id: randomUUID(), caseId: plan.caseId, analysisId: plan.analysisId, userId, plan, version: CONTRACT_VERSION, contextVersion: ctx.version, fingerprint: fp, approvalHash: hash(token), parameters: providerParameters(plan), createdAt: now, expiresAt: now + 15 * 60_000, state: 'awaiting_confirmation', idempotencyKey: randomUUID() }
  await repo.createResearch(record)
  const cached = await repo.cachedResearch(fp)
  return { research: publicResearch(record), approvalToken: token, available: cfg.enabled, reusable: cached?.resultPath ? { id: cached.id, validUntil: cached.validUntil, stale: (cached.validUntil ?? 0) < now } : null, maxCalls: 1, blockers: plan.provider === 'legaw' ? (await mcpConnectionState()).blockers : [], warnings: ['Análise concluída não comprova leitura integral dos documentos.', 'Similaridade não mede chance de êxito; ausência de resultados não prova ausência de precedentes.', 'Consumo Legaw desconhecido até retorno do provedor. Interpretação por IA é uma operação separada.'] }
}
export function publicResearch(record: Research) {
  const { approvalHash, budgetKeys, ...safe } = record
  void approvalHash; void budgetKeys
  const cacheExpired = safe.validUntil !== undefined && safe.validUntil < Date.now()
  if (safe.state === 'running' && (safe.leaseUntil ?? 0) < Date.now()) return { ...safe, cacheExpired, state: 'remote_uncertain' as const, errorCode: 'LEASE_EXPIRED_NO_REMOTE_CONFIRMATION' }
  return { ...safe, cacheExpired }
}

export type ExecutionDependencies = Pick<typeof repo, 'claimResearch' | 'markDispatched' | 'finishResearch' | 'saveResearchResult' | 'getResearch'>
/** One deadline covers connection, transport and reading, with time reserved for local persistence. No retry. */
export async function executeClaimedResearch(record: Research, adapter: ResearchAdapter, deps: ExecutionDependencies = repo, externalSignal?: AbortSignal, timeoutMs = 55_000) {
  const started = Date.now(), controller = new AbortController()
  const abort = () => controller.abort(new Error('CANCEL_REQUESTED'))
  externalSignal?.addEventListener('abort', abort, { once: true })
  if (externalSignal?.aborted) abort()
  const timer = setTimeout(() => controller.abort(new Error('DEADLINE')), Math.min(timeoutMs, 55_000))
  let dispatched = false, polling = false
  const poll = setInterval(async () => {
    if (polling) return
    polling = true
    try { if ((await deps.getResearch(record.id))?.cancelRequestedAt) abort() } catch { controller.abort(new Error('CONTROL_UNAVAILABLE')) }
    finally { polling = false }
  }, 1000)
  try {
    if (controller.signal.aborted || !await deps.markDispatched(record.id)) {
      const state = controller.signal.aborted && controller.signal.reason?.message === 'DEADLINE' ? 'timeout' : 'cancelled'
      await deps.finishResearch(record.id, { state, durationMs: Date.now() - started, consumption: 0 })
      return
    }
    controller.signal.throwIfAborted()
    dispatched = true
    const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new ResearchError('REMOTE_EXECUTION_UNCERTAIN', 504, true)), { once: true }))
    const raw = await Promise.race([adapter.execute(record.plan, record.parameters, controller.signal), aborted])
    const parsed = resultSchema.parse(raw)
    const result: Result = { ...parsed, raw: parsed.raw ?? null, ...(parsed.remoteId ? { remoteId: safeSourceUrl(parsed.remoteId) } : {}) }
    result.sources = result.sources.map((s, i) => {
      const { url: originalUrl, ...source } = s
      const url = safeSourceUrl(originalUrl)
      return { ...source, id: `${record.id}:${i + 1}`, ...(url ? { url } : {}) }
    })
    // Persist the immutable snapshot BEFORE agents see any data.
    const stored = await deps.saveResearchResult(record.id, result)
    const cacheDays = record.plan.tool === 'buscar_jurisprudencia' ? 7 : 1
    await deps.finishResearch(record.id, { ...stored, state: result.partial ? 'partial' : result.sources.length ? 'success' : 'empty', durationMs: Date.now() - started, validUntil: Date.now() + cacheDays * 86400_000, consumption: result.consumption, ...(result.remoteId ? { remoteId: result.remoteId } : {}) })
  } catch (error) {
    const code = error instanceof ResearchError ? error.code : controller.signal.aborted ? 'TRANSPORT_ABORTED' : 'INVALID_RESPONSE_OR_PERSISTENCE_FAILURE'
    const state = !dispatched && controller.signal.aborted ? (controller.signal.reason?.message === 'DEADLINE' ? 'timeout' : 'cancelled') : dispatched && !(error instanceof ResearchError && !error.uncertain) ? 'remote_uncertain' : 'error'
    await deps.finishResearch(record.id, { state, errorCode: code, durationMs: Date.now() - started, consumption: dispatched ? null : 0 })
  } finally { clearTimeout(timer); clearInterval(poll); externalSignal?.removeEventListener('abort', abort) }
}

export async function confirmResearch(id: string, token: string, userId: string, signal?: AbortSignal, deadline = Date.now() + 55_000) {
  const record = await repo.getResearch(id)
  if (!record) throw new ResearchError('RESEARCH_NOT_FOUND', 404)
  if (record.userId !== userId || record.approvalHash !== hash(token)) throw new ResearchError('INVALID_APPROVAL', 403)
  const ctx = await researchContext(record.analysisId, record.caseId), cfg = await connection(record.plan.provider)
  if (record.contextVersion !== ctx.version) throw new ResearchError('CONTEXT_CHANGED')
  if (fingerprint(record.plan, cfg.version, ctx.version) !== record.fingerprint) throw new ResearchError('CONNECTION_CHANGED_RECONFIRM')
  const cached = await repo.cachedResearch(record.fingerprint)
  const canReuse = !record.plan.refresh && !!cached?.resultPath && (cached.validUntil ?? 0) > Date.now()
  if (record.state === 'awaiting_confirmation' && !cfg.enabled && !canReuse) throw new ResearchError(record.plan.provider === 'legaw' ? 'LEGAW_CONTRACT_PENDING' : 'INTEGRATION_DISABLED', 503)
  const claim = await repo.claimResearch(id, userId, hash(token), ctx.version, researchQuotas())
  if (claim.execute && Date.now() >= deadline) {
    await repo.finishResearch(id, { state: 'timeout', errorCode: 'DEADLINE_BEFORE_DISPATCH', consumption: 0 })
  } else if (claim.execute) await executeClaimedResearch(claim.record, cfg.adapter, repo, signal, deadline - Date.now())
  return publicResearch((await repo.getResearch(id))!)
}

export async function selectEvidence(input: unknown, userId: string): Promise<Evidence> {
  const selection = selectionSchema.parse(input), ctx = await researchContext(selection.analysisId, selection.caseId)
  const sources: Result['sources'] = [], researchIds: string[] = []
  const criteria: Evidence['criteria'] = []
  for (const item of selection.selections) {
    const research = await repo.getResearch(item.researchId)
    if (!research || research.caseId !== selection.caseId || research.analysisId !== selection.analysisId || !research.resultPath) throw new ResearchError('INVALID_RESEARCH_SELECTION', 400)
    if ((!research.validUntil || research.validUntil < Date.now() || research.contextVersion !== ctx.version) && !selection.acknowledgeStale) throw new ResearchError('REASSESS_SOURCE_RELEVANCE', 422)
    const result = await repo.readResearchResult(research)
    for (const id of item.sourceIds) {
      const source = result?.sources.find(s => s.id === id)
      if (!source || sources.some(s => s.id === id)) throw new ResearchError('INVALID_SOURCE_SELECTION', 400)
      const cutoff = String(ctx.caseData.cutoffDate ?? '').slice(0, 10)
      if (cutoff && (!source.date || source.date > cutoff) && !selection.allowAfterCutoff) throw new ResearchError('SOURCE_DATE_REQUIRES_EXPLICIT_CHOICE', 422)
      sources.push(source)
    }
    researchIds.push(research.id)
    criteria.push({ researchId: research.id, objective: research.plan.objective, stance: research.plan.stance, requiredTerms: research.plan.requiredTerms, exclusions: research.plan.exclusions })
  }
  const evidence: Evidence = { id: randomUUID(), caseId: selection.caseId, analysisId: selection.analysisId, createdBy: userId, createdAt: Date.now(), contextVersion: ctx.version, sources, sourceIds: sources.map(s => s.id), researchIds, criteria, allowAfterCutoff: selection.allowAfterCutoff, acknowledgeStale: selection.acknowledgeStale }
  await repo.saveEvidence(evidence)
  return evidence
}
