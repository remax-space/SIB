import { z } from 'zod'
import { safeSourceUrl, type Evidence, type Research, type Result } from './contracts'

const sourceSchema = z.object({ id: z.string(), title: z.string(), text: z.string(), url: z.string().optional(), date: z.string().optional(), court: z.string().optional() }).strict()
const resultSchema = z.object({ sources: z.array(sourceSchema), partial: z.boolean(), limitations: z.array(z.string()), consumption: z.number().nullable() }).strict()
export type PublicResearchResult = z.infer<typeof resultSchema>
export type PublicEvidence = { id: string; sources: PublicResearchResult['sources'] }
function source(s: Result['sources'][number]) {
  return sourceSchema.parse({ id: s.id, title: s.title, text: s.text, url: safeSourceUrl(s.url), date: s.date, court: s.court })
}
export function publicResearchResult(result: Result | null): PublicResearchResult | null {
  return result ? resultSchema.parse({ sources: result.sources.map(source), partial: result.partial, limitations: result.limitations, consumption: result.consumption }) : null
}
export function publicEvidence(evidence: Evidence): PublicEvidence {
  return { id: evidence.id, sources: evidence.sources.map(source) }
}

/** Only reviewed provider arguments cross this boundary; never serialize the execution record. */
export function clientResearch(record: Research | Record<string, unknown>) {
  const r = record as Research
  const p = r.plan
  const labels: Record<string, string> = { consulta: 'Consulta', query: 'Consulta', texto: 'Texto a conferir', limite: 'Máximo de resultados', size: 'Máximo de resultados', tribunais: 'Tribunais', tribunal: 'Tribunal', numero_processo: 'Número do processo', pagina: 'Página', data_julgamento: 'Data do julgamento', relator: 'Relator', data_inicio: 'Início do período', data_fim: 'Fim do período' }
  const submitted = Object.entries(labels).flatMap(([key, label]) => {
    const value = r.parameters?.[key]
    const text = typeof value === 'string' || typeof value === 'number' ? String(value) : Array.isArray(value) && value.every(v => typeof v === 'string') ? value.join(', ') : ''
    return text ? [{ label, text }] : []
  })
  return {
    id: r.id, state: r.state === 'running' && (r.leaseUntil ?? 0) < Date.now() ? 'remote_uncertain' as const : r.state,
    createdAt: r.createdAt, cancelRequestedAt: r.cancelRequestedAt, consumption: r.consumption,
    reusedFrom: Boolean(r.reusedFrom), dispatched: Boolean(r.dispatchedAt), cacheExpired: r.validUntil !== undefined && r.validUntil < Date.now(), errorDetail: typeof r.errorDetail === 'string' ? r.errorDetail.slice(0, 800) : undefined, submitted,
    plan: { tool: p.tool, query: p.query, objective: p.objective, stance: p.stance, requiredTerms: p.requiredTerms, exclusions: p.exclusions, refresh: p.refresh },
  }
}
export type PublicResearch = ReturnType<typeof clientResearch>
