import { z } from 'zod'

export const CONTRACT_VERSION = 'legaw-remote-mcp/sdk-1.30.0/docs-2026-09-18/sib-6-focused-context'
export const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().startsWith(v), 'Data inválida')
export const planSchema = z.object({
  caseId: idSchema, analysisId: idSchema,
  provider: z.enum(['legaw', 'legacy']).default('legaw'),
  tool: z.enum(['buscar_jurisprudencia', 'buscar_legislacao', 'ler_inteiro_teor', 'conferir_citacoes']).default('buscar_jurisprudencia'),
  objective: z.string().trim().max(1000).default(''),
  query: z.string().trim().max(2000).default(''),
  facts: z.string().trim().max(2000).default(''),
  thesis: z.string().trim().max(1000).default(''),
  courts: z.array(z.string().trim().regex(/^[A-Z0-9-]{2,15}$/)).max(3).default([]),
  startDate: date.optional(), endDate: date.optional(),
  limit: z.number().int().min(1).max(20).default(10),
  tribunal: z.string().trim().regex(/^[A-Z0-9-]{2,15}$/).optional(),
  processNumber: z.string().trim().min(6).max(120).optional(),
  page: z.number().int().min(1).max(1000).default(1),
  judgmentDate: z.string().trim().max(30).optional(),
  relator: z.string().trim().min(2).max(200).optional(),
  citationText: z.string().max(60_000).optional(),
  stance: z.enum(['favoraveis', 'contrarios', 'ambos']).default('ambos'),
  requiredTerms: z.string().trim().max(500).default(''),
  exclusions: z.string().trim().max(500).default(''),
  allowAfterCutoff: z.boolean().default(false),
  refresh: z.boolean().default(false),
}).strict().superRefine((p, ctx) => {
  if (p.startDate && p.endDate && p.startDate > p.endDate) ctx.addIssue({ code: 'custom', message: 'Período invertido' })
  const toolSpecific = p.tribunal || p.processNumber || p.judgmentDate || p.relator || p.citationText || p.page !== 1
  if (p.tool === 'buscar_jurisprudencia' && toolSpecific) ctx.addIssue({ code: 'custom', message: 'Busca de jurisprudência usa somente os filtros publicados; parâmetros de inteiro teor/conferência não são aceitos' })
  if (p.tool === 'buscar_legislacao' && (p.limit > 10 || p.courts.length || p.startDate || p.endDate || toolSpecific)) ctx.addIssue({ code: 'custom', message: 'Legislação admite até 10 resultados, sem tribunal, período ou parâmetros de inteiro teor no contrato publicado' })
  if (p.tool === 'ler_inteiro_teor' && (!p.tribunal || !p.processNumber || p.citationText || p.courts.length || p.startDate || p.endDate || p.page < 1)) ctx.addIssue({ code: 'custom', message: 'Inteiro teor exige tribunal e número de processo, sem filtros de busca' })
  if (p.tool === 'conferir_citacoes' && (!p.citationText || p.citationText.trim().length < 1 || p.tribunal || p.processNumber || p.courts.length || p.startDate || p.endDate || p.judgmentDate || p.relator || p.page !== 1)) ctx.addIssue({ code: 'custom', message: 'Conferência exige o texto ou citações revisados, sem filtros de busca' })
  if (p.provider === 'legacy' && (p.tool !== 'buscar_jurisprudencia' || p.courts.length || p.startDate || p.endDate || p.limit !== 10)) ctx.addIssue({ code: 'custom', message: 'O adaptador legado suporta consulta textual e 10 resultados solicitados' })
})
export type Plan = z.infer<typeof planSchema>
export type ResearchState = 'awaiting_confirmation' | 'running' | 'success' | 'empty' | 'partial' | 'error' | 'timeout' | 'cancelled' | 'remote_uncertain'
export type Source = { id: string; title: string; text: string; url?: string; providerId?: string; date?: string; court?: string }
export type Result = { sources: Source[]; raw: unknown; partial: boolean; limitations: string[]; remoteId?: string; consumption: number | null }
export type Research = {
  id: string; caseId: string; analysisId: string; userId: string; plan: Plan;
  version: string; contextVersion: string; fingerprint: string; approvalHash: string;
  parameters: Record<string, unknown>; createdAt: number; expiresAt: number;
  state: ResearchState; authorizedAt?: number; leaseUntil?: number; finishedAt?: number;
  durationMs?: number; resultPath?: string; resultHash?: string; validUntil?: number;
  reusedFrom?: string; dispatchedAt?: number; cancelRequestedAt?: number;
  errorCode?: string; consumption?: number | null; remoteId?: string;
  budgetKeys?: string[]; idempotencyKey: string;
}
export type Evidence = { id: string; caseId: string; analysisId: string; createdBy: string; createdAt: number; contextVersion: string; sourceIds: string[]; researchIds: string[]; allowAfterCutoff: boolean; acknowledgeStale: boolean; sources: Source[]; criteria: { researchId: string; objective: string; stance: Plan['stance']; requiredTerms: string; exclusions: string }[] }
export const selectionSchema = z.object({ caseId: idSchema, analysisId: idSchema, selections: z.array(z.object({ researchId: idSchema, sourceIds: z.array(z.string().max(180)).min(1).max(20) }).strict()).min(1).max(10), allowAfterCutoff: z.boolean(), acknowledgeStale: z.boolean() }).strict()

export function providerParameters(p: Plan): Record<string, unknown> {
  // The service supplies the server-built context as query before persisting the reviewed parameters.
  const consulta = [p.query, p.facts && `Fatos necessários: ${p.facts}`, p.thesis && `Questão: ${p.thesis}`].filter(Boolean).join('\n')
  if (p.provider === 'legacy') return { query: consulta, q: consulta, termo: consulta, size: 10 }
  if (p.tool === 'buscar_legislacao') return { consulta, limite: p.limit }
  if (p.tool === 'ler_inteiro_teor') return { tribunal: p.tribunal, numero_processo: p.processNumber, pagina: p.page, ...(p.judgmentDate ? { data_julgamento: p.judgmentDate } : {}), ...(p.relator ? { relator: p.relator } : {}) }
  if (p.tool === 'conferir_citacoes') return { texto: p.citationText }
  return { consulta, limite: p.limit, ...(p.courts.length ? { tribunais: p.courts } : {}), ...(p.startDate ? { data_inicio: p.startDate } : {}), ...(p.endDate ? { data_fim: p.endDate } : {}) }
}

export function safeSourceUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const u = new URL(value)
    if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.') || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/i.test(u.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)) return undefined
    return u.toString()
  } catch { return undefined }
}

export const resultSchema = z.object({ sources: z.array(z.object({ id: z.string().min(1).max(180), title: z.string().max(1000), text: z.string().max(2_000_000), url: z.string().optional(), providerId: z.string().max(500).optional(), date: date.optional(), court: z.string().max(100).optional() }).strict()).max(50), raw: z.unknown(), partial: z.boolean(), limitations: z.array(z.string().max(2000)).max(100), remoteId: z.string().max(500).optional(), consumption: z.number().nonnegative().nullable() }).strict()
