import { z } from 'zod'

// This is the only presentation contract. Internal records never cross the API boundary.
const textSchema = z.string().max(100_000)
export const publicResultSchema = z.object({
  version: z.literal(1),
  state: z.enum(['ready', 'partial', 'unavailable']),
  sections: z.array(z.object({ title: textSchema, text: textSchema }).strict()),
  attention: z.array(textSchema),
  sources: z.array(z.object({ name: textSchema, page: z.number().int().positive().nullable(), quote: textSchema, verification: textSchema, href: z.string().regex(/^\/api\/documents\/[^/]+\/file(?:#page=\d+)?$/).optional() }).strict()),
}).strict()
export type PublicResult = z.infer<typeof publicResultSchema>
type RecordValue = Record<string, unknown>
const object = (v: unknown): RecordValue => v && typeof v === 'object' && !Array.isArray(v) ? v as RecordValue : {}
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : []
const unique = (items: string[]) => [...new Set(items.filter(Boolean))]
const unavailable = 'Este resultado não pôde ser apresentado com segurança. O registro original foi preservado. Solicite uma nova análise dos documentos.'

// Decode once at the text boundary; React renders this as text, never as HTML.
export function publicText(value: unknown): string {
  if (typeof value !== 'string' || value.length > 100_000) return ''
  const decoded = value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
    if (!entity.startsWith('#')) return named[entity.toLowerCase()] ?? match
    const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : match
  }).trim()
  // Reject embedded serialized payloads, rather than deleting words from legitimate prose.
  if (/^\s*(?:```(?:json)?\s*)?(?:\{|\[\s*[{"])/.test(decoded) || /"[\w_]+"\s*:\s*(?:["{[]|true\b|false\b)/.test(decoded) || /^\s*[a-z]+_[a-z_]+\s*:\s*(?:true|false|\{|\[)/m.test(decoded)) return ''
  if (/^\s*(?:documentoId|sha256|enviado|processado|envio_tentado|provedor|provider|avaliacoes_por_lote|revisao_completa)\s*:/mi.test(decoded) || /^\s*MISSÃO (?:PADRÃO|LITERAL)/mi.test(decoded)) return ''
  return decoded
}

const categories: Record<string, string> = {
  FATO_DOCUMENTADO: 'Informação registrada no documento; não comprova, por si só, o fato relatado.',
  FATO_DOCUMENTALMENTE_COMPROVADO: 'Informação sustentada pelo documento citado.',
  FATO_PARCIALMENTE_COMPROVADO: 'Há suporte documental parcial.',
  ALEGACAO: 'Alegação mencionada no documento.', ALEGACAO_DE_PARTE: 'Alegação de uma das partes.',
  INFERENCIA: 'Interpretação dos documentos.', INFERENCIA_LOGICA_FUNDADA: 'Interpretação dos documentos.',
  HIPOTESE: 'Hipótese que precisa de confirmação.', FATO_NAO_DEMONSTRADO: 'Os documentos não permitem confirmar este ponto.',
  NAO_VERIFICADO: 'Este ponto precisa ser conferido no original.',
}

// Explicit field mappings preserve each agent's purpose. Unknown nested fields are not traversed.
const groups: [string, string, string[]?][] = [
  ['resposta', 'Resumo'], ['sintese_executiva', 'Resumo'], ['parecer_geral', 'Resumo'],
  ['linha_estado_processual', 'Situação descrita nos documentos'], ['tese_principal', 'Conclusão'],
  ['cronologia', 'Cronologia', ['data', 'evento', 'fonte']],
  ['fatos_provas', 'Pontos relevantes', ['item', 'evidencia', 'fonte']],
  ['contradicoes', 'Divergências', ['descricao', 'fonte_a', 'fonte_b', 'impacto']],
  ['lacunas_probatorias', 'Pontos a confirmar', ['fato', 'prova_ausente', 'risco']],
  ['observacoes', 'Próximos passos'], ['contra_argumentos', 'Argumentos contrários', ['argumento', 'tese_atacada', 'fonte']],
  ['tese_contraparte', 'Posição da outra parte'], ['pontos_frageis', 'Atenção', ['ponto', 'risco', 'mitigacao']],
  ['riscos_identificados', 'Riscos', ['risco', 'descricao', 'impacto']],
  ['fundamento_decisao_provavel', 'Avaliação judicial'], ['precedentes_relevantes', 'Referências citadas', ['identificacao', 'ementa', 'tribunal']],
  ['riscos_judiciais', 'Atenção', ['risco', 'impacto']], ['recomendacao_judicial', 'Próximos passos'],
  ['classificacao_epistemica', 'Suporte dos documentos', ['item', 'fundamento']],
  ['inventario_integridade', 'Limitações dos documentos', ['documento', 'observacao']],
  ['decisao_necessaria', 'Decisão a tomar'], ['objetivo_processual', 'Objetivo'],
  ['medidas_prioritarias', 'Próximos passos', ['medida', 'prazo', 'responsavel']],
  ['prazo_critico', 'Prazo a conferir'], ['riscos_principais', 'Atenção', ['risco', 'impacto']],
  ['resultado_esperado', 'Resultado esperado'], ['alternativas_juridicas', 'Alternativas', ['alternativa', 'vantagem', 'desvantagem']],
  ['proximo_movimento', 'Próximo passo'], ['erros_de_analise', 'Pontos que exigem revisão', ['descricao', 'onde', 'correcao']],
  ['melhorias', 'Ajustes sugeridos', ['sugestao', 'beneficio']], ['alertas_criticos', 'Atenção'], ['recomendacao_final', 'Próximo passo'],
  ['avaliacao_documental_propria', 'Fundamentos', ['conclusao', 'fundamento', 'fonte']],
  ['correcoes', 'Correções relevantes', ['descricao', 'correcao', 'fundamento', 'impacto']],
  ['sintese_jurisprudencial', 'Resumo'], ['precedentes_aplicaveis', 'Precedentes', ['tribunal', 'identificacao', 'ementa_resumo', 'como_se_aplica']],
  ['enfraquece_mestre', 'Divergências relevantes', ['ponto_do_mestre', 'precedente', 'risco', 'ajuste_sugerido']],
  ['lacunas_de_pesquisa', 'Pontos a pesquisar'], ['recomendacao_jurisprudencial', 'Próximo passo'],
]

export type SourceDocument = { id: string; filename: string; pageCount?: number | null }
export type LegalSource = { id: string; title: string; text?: string }
export function presentResult(value: unknown, documents: SourceDocument[] = [], legalSources: LegalSource[] = []): PublicResult {
  let data = object(value)
  if (typeof value === 'string' || typeof data.raw_text === 'string') {
    try { data = object(JSON.parse(String(data.raw_text ?? value).trim().replace(/^```json\s*/, '').replace(/\s*```$/, ''))) }
    catch { return { version: 1, state: 'unavailable', sections: [], attention: [unavailable], sources: [] } }
  }
  const sections: PublicResult['sections'] = []
  let rejected = false
  const text = (v: unknown) => {
    let t = publicText(v)
    if (v != null && v !== '' && !t) rejected = true
    t = t.replace(/\[fonte:\s*([^\]]+)\]/gi, (_match, id: string) => {
      const source = legalSources.find(s => s.id === id.trim())
      return source ? `[Fonte: ${source.title}]` : '[Referência jurídica não conferida]'
    })
    for (const doc of documents) t = t.replace(new RegExp(`(?<![\\w-])${doc.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'g'), () => doc.filename)
    return t
  }
  const seen = new Set<string>()
  for (const [key, title, fields] of groups) {
    const values = Array.isArray(data[key]) ? list(data[key]) : [data[key]]
    for (const item of values) {
      if (item == null) continue
      const row = object(item)
      let body = typeof item === 'string' ? text(item) : fields ? fields.map(f => text(row[f])).filter(Boolean).join('\n') : text(item)
      if (typeof item === 'object' && fields && Object.keys(row).length && !body) rejected = true
      const category = categories[String(row.classificacao_epistemica ?? row.categoria ?? '')]
      if (body && category) body += '\n' + category
      if (body && !/^(?:nenhuma correção|não aplicável|nenhuma|n\/a)[.!]?$/i.test(body) && !seen.has(body)) { sections.push({ title, text: body }); seen.add(body) }
    }
  }
  // Only material comparisons (a correction AND its impact) add information to the result.
  for (const item of list(data.comparacao_agentes)) {
    const row = object(item)
    const correction = text(row.correcao), impact = text(row.impacto)
    if (correction && impact && !/^(?:nenhuma|não aplicável)/i.test(correction)) sections.push({ title: 'Divergência relevante', text: [text(row.conclusao), correction, impact].filter(Boolean).join('\n') })
  }
  const icp = object(data.icp_basile)
  if (typeof icp.total === 'number' && icp.total >= 0 && icp.total <= 100) {
    sections.push({ title: 'Avaliação do suporte documental', text: `Índice Basile: ${icp.total}/100. Estimativa do modelo sobre os documentos, não uma probabilidade de êxito.` })
    for (const key of ['autenticidade', 'completude', 'corroboracao', 'coerencia_cronologica', 'contraditorio', 'validade_formal']) {
      const reason = text(object(icp[key]).justificativa)
      if (reason) sections.push({ title: 'Fundamento da avaliação', text: reason })
    }
  }
  const coverage = object(data.cobertura_documental)
  const pages = list(coverage.paginas).map(object)
  const missing = pages.filter(p => !p.processado).length
  // Coverage contains transport errors as well as limitations. Transport strings stay private.
  const operationalLimitations = new Set(list(coverage.limitacoes))
  const attention = unique((Array.isArray(data.limitacoes) ? list(data.limitacoes) : [data.limitacoes]).filter(v => !operationalLimitations.has(v)).map(v => text(v)))
  for (const note of list(data.avaliacoes_por_lote)) {
    const limits = object(note).limitacoes
    attention.push(...(Array.isArray(limits) ? limits : [limits]).map(v => text(v)).filter(Boolean))
  }
  if (missing) attention.unshift(`Análise parcial: ${missing} página(s) não puderam ser lidas. Confira o original antes de usar a conclusão.`)
  else if (coverage.status === 'PARCIAL' || coverage.status === 'EM_ANDAMENTO') attention.unshift('Análise parcial: a revisão dos documentos ainda não foi concluída.')
  if (Object.keys(coverage).length) attention.push('O processamento das páginas não comprova compreensão integral. Confira as referências no documento original.')
  if (list(coverage.limitacoes).some(v => typeof v === 'string' && /OCR indisponível|sem.*texto|texto.*insuficiente/i.test(v))) attention.push('Algumas páginas não têm texto legível. Confira essas páginas no PDF original.')
  for (const doc of list(coverage.documentos).map(object)) {
    const affected = pages.filter(p => p.documentoId === doc.documentoId && (!p.processado || p.limitacao)).map(p => p.pagina).filter(p => typeof p === 'number')
    if (affected.length) attention.push(`${publicText(doc.nome) || 'Documento'}: confira as páginas ${affected.join(', ')}.`)
  }
  if (data.linha_estado_processual) attention.push('A situação descrita se limita aos documentos enviados. Confirme o andamento atualizado, eventuais recursos e prazos antes de agir.')
  const sources: PublicResult['sources'] = list(data.evidencias).map(item => {
    const e = object(item), doc = documents.find(d => d.id === e.documentoId)
    const inventory = list(coverage.documentos).map(object).find(d => d.documentoId === doc?.id)
    const count = doc?.pageCount ?? (typeof inventory?.paginas === 'number' ? inventory.paginas : null)
    const page = typeof e.pagina === 'number' && Number.isInteger(e.pagina) && e.pagina > 0 && count && e.pagina <= count ? e.pagina : null
    return { name: doc?.filename ?? 'Documento não identificado', page, quote: publicText(e.trecho), verification: page && e.verificacao === 'TRECHO_CONFERIDO_NA_CAMADA_TEXTUAL' ? 'Trecho localizado no texto extraído; confira o contexto no original.' : 'Este trecho precisa ser conferido no documento original.', ...(doc ? { href: `/api/documents/${encodeURIComponent(doc.id)}/file${page ? `#page=${page}` : ''}` } : {}) }
  }).filter(s => s.quote)
  for (const source of legalSources) sources.push({ name: source.title, page: null, quote: publicText(source.text) || 'Consulte o inteiro teor na pesquisa jurídica.', verification: 'Fonte consultada; a interpretação jurídica precisa ser conferida.' })
  const audit = object(data.fontes_juridicas)
  if (list(audit.invalidSourceIds).length) attention.push('Há citações jurídicas que não correspondem às fontes consultadas. Confira a origem antes de utilizá-las.')
  if (Object.keys(audit).length) attention.push('A presença de uma referência na pesquisa não comprova que ela sustenta a interpretação. Consulte as fontes jurídicas.')
  if (rejected) attention.push('Parte deste resultado usa um formato incompatível. O original foi preservado; solicite nova análise para conferir os pontos ausentes.')
  if (!sections.length) attention.push(unavailable)
  return publicResultSchema.parse({ version: 1, state: !sections.length ? 'unavailable' : missing || rejected || ['PARCIAL', 'EM_ANDAMENTO'].includes(String(coverage.status)) ? 'partial' : 'ready', sections, attention: unique(attention), sources })
}

export function resultText(result: PublicResult): string {
  return [result.sections.map(s => `${s.title}\n${s.text}`).join('\n\n'), result.attention.length ? `Atenção\n${result.attention.join('\n')}` : '', result.sources.length ? `Fontes\n${result.sources.map(s => `${s.name}${s.page ? `, página ${s.page}` : ''}\n${s.quote}\n${s.verification}${s.href ? `\n${s.href}` : ''}`).join('\n\n')}` : ''].filter(Boolean).join('\n\n')
}

export const resultFields = ['basileResult', 'advocadoResult', 'cabecaResult', 'auditorResult', 'mestreResult', 'orientacoesResult', 'jurisprudenciaResult'] as const
export function removeInstructionEchoes(result: PublicResult, mission: unknown): PublicResult {
  if (typeof mission !== 'string') return result
  const instructions = mission.split('\n\nOBJETIVO DESTA ANÁLISE:')[0].trim()
  if (instructions.length < 30) return result
  const echoed = (text: string) => text.includes(instructions)
  const sections = result.sections.filter(s => !echoed(s.text))
  const attention = result.attention.filter(text => !echoed(text))
  if (sections.length === result.sections.length && attention.length === result.attention.length) return result
  return { ...result, sections, attention: unique([...attention, unavailable]), state: sections.length ? 'partial' : 'unavailable' }
}

export function publicConversation(value: unknown, documents: SourceDocument[] = [], legalSources: LegalSource[] = [], mission?: unknown) {
  return list(value).map(item => {
    const turn = object(item)
    const result = removeInstructionEchoes(presentResult(turn.documentaryResult ?? turn.publicContent ?? turn.content, documents, legalSources), mission)
    if (!turn.documentaryResult) result.sources = result.sources.map(source => source.page ? { ...source, verification: 'Este trecho precisa ser conferido no documento original.' } : source)
    const audit = object(turn.researchCitationAudit)
    if (list(audit.invalidSourceIds).length) result.attention.push('Há referências jurídicas fora das fontes consultadas. Confira a origem antes de utilizá-las.')
    return { id: publicText(turn.id), agent: publicText(turn.agent), message: typeof turn.message === 'string' ? turn.message : '', createdAt: publicText(turn.createdAt), content: resultText(result), result }
  })
}

export function publicAnalysis(value: RecordValue, documents: SourceDocument[] = [], legalSources: LegalSource[] = []) {
  const results = Object.fromEntries(resultFields.map(field => {
    if (value[field] == null) return [field, null]
    const result = removeInstructionEchoes(presentResult(value[field], documents, legalSources), value.missionLiteral)
    return [field, result]
  })) as Record<typeof resultFields[number], PublicResult | null>
  const c = object(value.case)
  return { id: value.id, caseId: value.caseId, status: value.status, createdAt: value.createdAt, completedAt: value.completedAt,
    documentProgress: resultFields.flatMap(field => {
      const coverage = object(object(value[field]).cobertura_documental)
      const pages = list(coverage.paginas)
      return pages.length ? [{ agent: field.replace('Result', ''), processed: pages.filter(p => object(p).processado === true).length, total: pages.length }] : []
    }),
    icpScore: typeof value.icpScore === 'number' ? value.icpScore : null,
    case: { title: publicText(c.title), caseId: publicText(c.caseId) },
    ...results, conversation: publicConversation(value.conversation, documents, legalSources, value.missionLiteral) }
}
