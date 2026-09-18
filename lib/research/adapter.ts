import { z } from 'zod'
import { type Plan, type Result } from './contracts'

export const LEGAW_MCP_URL = 'https://api.legaw.ai/v1/mcp'
export const LEGAW_API_URL = 'https://api.legaw.ai'
// Fail closed. An environment toggle cannot bypass unresolved contract requirements.
export const LEGAW_ACTIVATION_BLOCKERS = [
  'Confirmar com a Legaw autorização organizacional para credencial server-to-server e acesso compartilhado no SIB: a Conta é pessoal/intransferível e credenciais não podem ser compartilhadas (termos 7.4.1); validar Assentos de Organização (8.1–8.4), licença de uso interno (9.5) e autorização escrita para sistema similar (9.6).',
  'Confirmar suporte contratual ao uso server-to-server da API REST oficial e obter semântica autorizada para cancelamento, idempotência, rate limits, custos e retenção; o OpenAPI público 0.3.0 valida requests e respostas estruturadas de busca/citação, mas descreve inteiro teor sem schema completo e não cobre esses pontos operacionais.',
]
export class ResearchError extends Error {
  constructor(public code: string, public status = 409, public uncertain = false, public detail?: string) { super(code) }
}
export interface ResearchAdapter {
  execute(plan: Plan, parameters: Record<string, unknown>, signal: AbortSignal): Promise<Result>
}

const itemSchema = z.object({
  tribunal: z.string().optional(), area: z.string().optional(), comarca: z.string().optional(), numero_processo: z.string().optional(),
  relator: z.string().optional(), orgao_julgador: z.string().optional(), data_julgamento: z.string().optional(),
  ementa: z.string().optional(), ementa_truncada: z.boolean().optional(), citacao_pronta: z.string().optional(),
  trecho_relevante: z.string().optional(), tese_juridica: z.string().optional(), link_oficial: z.string().optional(), cite_url: z.string().optional(),
}).passthrough()
const jurisprudenciaResponseSchema = z.object({
  resultados: z.array(itemSchema).default([]), search_result_url: z.string().optional(), search_result_message: z.string().optional(),
  message_to_user: z.string().optional(), _warning: z.string().optional(), coverage_warning: z.object({ message_to_user: z.string().optional() }).passthrough().optional(),
}).passthrough()
const legislationItemSchema = z.object({ lei: z.string().optional(), artigo: z.string().optional(), artigo_numero: z.string().optional(), texto: z.string().optional(), trecho_relevante: z.string().optional(), link_oficial: z.string().optional(), estado_juridico: z.string().optional(), revisao_juridica: z.string().optional() }).passthrough()
const legislationResponseSchema = z.object({
  resultados: z.array(legislationItemSchema).default([]), temporal_notice: z.string().optional(), _warning: z.string().optional(),
}).passthrough()
// The public OpenAPI documents the fields for this response in prose, but does
// not publish a JSON schema. Keep the parser tolerant while requiring the one
// field that makes the response useful and safe to persist.
const fullTextResponseSchema = z.object({
  conteudo: z.string().optional(), pagina: z.number().int().positive().optional(), total_paginas: z.number().int().positive().optional(),
  link_oficial: z.string().optional(), relator: z.string().optional(), data_julgamento: z.string().optional(),
  tribunal: z.string().optional(), numero_processo: z.string().optional(),
  outras_decisoes: z.array(z.unknown()).optional(), message_to_user: z.string().optional(), _warning: z.string().optional(),
}).passthrough()
const citationProblemSchema = z.object({ tipo: z.string().optional(), gravidade: z.string().optional(), mensagem: z.string().optional(), trecho_omitido: z.string().optional(), trecho_mais_proximo: z.string().optional() }).passthrough()
const citationItemSchema = z.object({
  indice: z.number().int().optional(), referencia: z.string().optional(), status: z.enum(['ok', 'atencao', 'erro']).optional(),
  tribunal: z.string().optional(), numero_processo: z.string().optional(), relator: z.string().optional(), orgao_julgador: z.string().optional(), data_julgamento: z.string().optional(),
  citacao_pronta: z.string().optional(), link_oficial: z.string().optional(), cite_url: z.string().optional(), trecho_citado: z.string().optional(), proposicao: z.string().optional(),
  problemas: z.array(citationProblemSchema).optional(), revisao_recomendada: z.boolean().optional(), link_conferencia: z.string().optional(), marcador_documento: z.string().optional(), ementa: z.string().optional(),
}).passthrough()
const citationResponseSchema = z.object({
  resumo: z.record(z.string(), z.unknown()).optional(), pronto_para_entregar: z.boolean().optional(), citacoes: z.array(citationItemSchema).default([]), message_to_user: z.string().optional(), _warning: z.string().optional(),
}).passthrough()

function isoDate(value: string | undefined) {
  if (!value) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : undefined
}
function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function limitations(...values: unknown[]) { return values.flatMap(value => typeof value === 'string' && value.trim() ? [value.trim()] : []) }
function parseRemoteBody(body: string): unknown {
  try { return JSON.parse(body) } catch { throw new ResearchError('LEGAW_INVALID_RESPONSE', 502, true) }
}
function errorForStatus(status: number): ResearchError {
  if (status === 401) return new ResearchError('LEGAW_AUTH_INVALID', 502)
  if (status === 403) return new ResearchError('LEGAW_FORBIDDEN', 502)
  if (status === 402) return new ResearchError('LEGAW_QUOTA_EXHAUSTED', 402)
  if (status === 429) return new ResearchError('LEGAW_RATE_LIMITED', 429)
  if (status === 404) return new ResearchError('LEGAW_NOT_FOUND', 404)
  if (status === 413) return new ResearchError('LEGAW_INPUT_TOO_LARGE', 413)
  if (status >= 400 && status < 500) return new ResearchError('LEGAW_BAD_REQUEST', 400)
  return new ResearchError('LEGAW_HTTP_FAILURE', 502, true)
}
async function callLegaw(path: string, body: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
  const key = process.env.LEGAW_API_KEY?.trim()
  if (!key) throw new ResearchError('LEGAW_CONTRACT_PENDING', 503)
  let response: Response
  try {
    response = await fetch(`${LEGAW_API_URL}${path}`, {
      method: 'POST', signal, redirect: 'error',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'SIB-legaw-adapter/0.1' },
      body: JSON.stringify(body),
    })
  } catch (error) {
    if (signal.aborted) throw error
    throw new ResearchError('LEGAW_TRANSPORT_FAILURE', 502, true)
  }
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > 12 * 1024 * 1024) throw new ResearchError('LEGAW_RESULT_TOO_LARGE', 502, true)
  const bodyText = new TextDecoder().decode(bytes)
  if (!response.ok) throw errorForStatus(response.status)
  return parseRemoteBody(bodyText)
}
function normalizeJurisprudencia(raw: unknown): Result {
  const data = jurisprudenciaResponseSchema.parse(raw)
  const sources = data.resultados.map((item, index) => {
    const providerId = text(item.numero_processo) || `resultado-${index + 1}`
    const title = text(item.citacao_pronta) || [text(item.tribunal), providerId].filter(Boolean).join(' — ') || `Fonte Legaw ${index + 1}`
    return { id: providerId, title, text: text(item.ementa) || text(item.trecho_relevante) || text(item.tese_juridica), ...(item.link_oficial || item.cite_url ? { url: item.link_oficial || item.cite_url } : {}), providerId, date: isoDate(item.data_julgamento), court: text(item.tribunal) || undefined }
  })
  const partial = data.resultados.some(item => item.ementa_truncada === true)
  return { sources, raw, partial, limitations: limitations(data.search_result_message, data.message_to_user, data._warning, data.coverage_warning?.message_to_user), remoteId: data.search_result_url, consumption: null }
}
function normalizeLegislation(raw: unknown): Result {
  const data = legislationResponseSchema.parse(raw)
  const sources = data.resultados.map((item, index) => {
    const providerId = [text(item.lei), text(item.artigo_numero) || text(item.artigo)].filter(Boolean).join(' · ') || `legislacao-${index + 1}`
    return { id: providerId, title: providerId, text: text(item.texto) || text(item.trecho_relevante), ...(item.link_oficial ? { url: item.link_oficial } : {}), providerId }
  })
  return { sources, raw, partial: false, limitations: limitations(data.temporal_notice, data._warning), consumption: null }
}
function normalizeFullText(raw: unknown): Result {
  const data = fullTextResponseSchema.parse(raw), content = text(data.conteudo)
  if (!content) throw new ResearchError('LEGAW_INVALID_RESPONSE', 502, true)
  const page = data.pagina ?? 1, partial = typeof data.total_paginas === 'number' && page < data.total_paginas
  const title = [text(data.relator), isoDate(data.data_julgamento) ?? text(data.data_julgamento)].filter(Boolean).join(' · ') || 'Inteiro teor Legaw'
  return {
    sources: [{ id: `inteiro-teor-${page}`, title, text: content, ...(data.link_oficial ? { url: data.link_oficial } : {}), providerId: `${text(data.tribunal) || 'tribunal'}:${text(data.numero_processo) || 'processo'}:pagina-${page}`, date: isoDate(data.data_julgamento), court: text(data.tribunal) || undefined }],
    raw, partial, limitations: limitations(data.message_to_user, data._warning, partial ? `Página ${page} de ${data.total_paginas}; outras páginas não foram consultadas automaticamente.` : undefined), remoteId: data.link_oficial, consumption: null,
  }
}
function normalizeCitations(raw: unknown): Result {
  const data = citationResponseSchema.parse(raw)
  const sources = data.citacoes.map((item, index) => {
    const problems = (item.problemas ?? []).map(problem => [text(problem.gravidade), text(problem.mensagem), text(problem.trecho_omitido) && `Omissão: ${text(problem.trecho_omitido)}`, text(problem.trecho_mais_proximo) && `Trecho próximo: ${text(problem.trecho_mais_proximo)}`].filter(Boolean).join(' — '))
    const metadata = [text(item.tribunal), text(item.numero_processo), text(item.data_julgamento)].filter(Boolean).join(' · ')
    const body = [text(item.status) && `Status: ${text(item.status)}`, text(item.citacao_pronta), metadata, text(item.trecho_citado) && `Trecho: ${text(item.trecho_citado)}`, text(item.proposicao) && `Proposição: ${text(item.proposicao)}`, ...problems].filter(Boolean).join('\n')
    const title = text(item.citacao_pronta) || text(item.referencia) || `Citação ${item.indice ?? index + 1}`
    return { id: `citacao-${item.indice ?? index + 1}`, title, text: body || title, ...(item.cite_url || item.link_conferencia || item.link_oficial ? { url: item.cite_url || item.link_conferencia || item.link_oficial } : {}), providerId: item.numero_processo || title, date: isoDate(item.data_julgamento), court: text(item.tribunal) || undefined }
  })
  const partial = data.citacoes.some(item => item.status && item.status !== 'ok')
  return { sources, raw, partial, limitations: limitations(data.message_to_user, data._warning, data.pronto_para_entregar === false ? 'Há citações que precisam de revisão antes da entrega.' : undefined), consumption: null }
}
export const legawAdapter: ResearchAdapter = {
  async execute(plan, parameters, signal) {
    // The transport and normalizers are ready for the official REST contract;
    // service.connection() keeps this adapter disabled until contractual gates close.
    const path = plan.tool === 'buscar_legislacao' ? '/v1/search/legislacao'
      : plan.tool === 'ler_inteiro_teor' ? '/v1/search/inteiro-teor'
        : plan.tool === 'conferir_citacoes' ? '/v1/citations/check' : '/v1/search/jurisprudencia'
    const raw = await callLegaw(path, parameters, signal)
    if (plan.tool === 'buscar_legislacao') return normalizeLegislation(raw)
    if (plan.tool === 'ler_inteiro_teor') return normalizeFullText(raw)
    if (plan.tool === 'conferir_citacoes') return normalizeCitations(raw)
    return normalizeJurisprudencia(raw)
  },
}

/** Shared data normalization; MCP transport preserves the original envelope separately. */
export function normalizeLegawResult(tool: Plan['tool'], raw: unknown): Result {
  if (tool === 'buscar_legislacao') return normalizeLegislation(raw)
  if (tool === 'ler_inteiro_teor') return normalizeFullText(raw)
  if (tool === 'conferir_citacoes') return normalizeCitations(raw)
  return normalizeJurisprudencia(raw)
}
