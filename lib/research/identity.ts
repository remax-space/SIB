import { createHash } from 'node:crypto'
import { CONTRACT_VERSION, providerParameters, type Plan } from './contracts'

export function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex') }
export function fingerprint(plan: Plan, connectionVersion: string, contextVersion: string, parameters = providerParameters(plan)): string {
  return hash({ scope: 'sib-authenticated-shared', contract: CONTRACT_VERSION, provider: plan.provider, connectionVersion, contextVersion, tool: plan.tool, parameters })
}
export function contextVersion(analysis: Record<string, unknown>, caseData: Record<string, unknown>, docs: Record<string, unknown>[]): string {
  return hash({ caseId: analysis.caseId, analysisId: analysis.id, mission: analysis.missionLiteral, cutoff: caseData.cutoffDate ?? null, documents: docs.map(d => ({ id: d.id, sha256: d.sha256 ?? null, path: d.cloudStoragePath ?? null, extraction: d.extractedTextPath ?? null, updatedAt: d.updatedAt ?? null })) })
}
