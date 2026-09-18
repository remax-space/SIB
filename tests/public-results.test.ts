import test from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest, NextResponse } from 'next/server'
import { presentResult, publicAnalysis, publicConversation, publicResultSchema, publicText, resultFields, resultText } from '../lib/public-result'
import { DEFAULT_MISSION } from '../lib/constants'
import { instructionsVersion, composeMission, instructionsSchema } from '../lib/basile-settings'
import { publicDocument } from '../lib/public-document'
import { loadRoute } from './route-harness'

const documents = [{ id: 'doc-interno', filename: 'Sentença de exemplo.pdf', pageCount: 3 }]
const fixture = {
  resposta: 'O documento relata atraso na entrega.',
  fatos_provas: [{ item: 'A justificativa foi rejeitada na sentença.', categoria: 'ALEGACAO', fonte: 'Sentença, página 2' }],
  limitacoes: ['O material não informa se houve recurso.'],
  evidencias: [{ documentoId: 'doc-interno', pagina: 2, trecho: 'A justificativa não foi comprovada.', verificacao: 'NAO_VERIFICADO' }],
  cobertura_documental: { status: 'PARCIAL', revisao_completa: false, paginas: [{ documentoId: 'doc-interno', pagina: 1, processado: true }, { documentoId: 'doc-interno', pagina: 2, processado: false }], documentos: [{ documentoId: 'doc-interno', nome: 'Sentença de exemplo.pdf' }], limitacoes: ['provider secret trace'] },
  documentoId: 'doc-interno', sha256: 'hash-secreto', provider: 'privado', enviado: true,
  avaliacoes_por_lote: [{ resposta: 'Não repetir a análise por lote.', limitacoes: ['O anexo não está legível.'] }],
}

test('todos os agentes e síntese passam pela mesma projeção, sem mutar o original', () => {
  const record = { id: 'a', caseId: 'c', missionLiteral: DEFAULT_MISSION, modelUsed: 'privado', errorDetail: 'secret', ...Object.fromEntries(resultFields.map(f => [f, fixture])) }
  const original = structuredClone(record)
  const result = publicAnalysis(record, documents)
  for (const field of resultFields) {
    assert.ok(publicResultSchema.safeParse(result[field]).success)
    const text = resultText(result[field]!)
    assert.doesNotMatch(text, /documentoId|sha256|hash-secreto|provider|enviado|revisao_completa|NAO_VERIFICADO|Não repetir/)
    assert.match(text, /1 página\(s\) não puderam ser lidas/)
    assert.match(text, /não informa se houve recurso/)
    assert.match(text, /anexo não está legível/)
    assert.match(text, /precisa ser conferido/)
    assert.equal(result[field]!.sources[0].page, 2)
    assert.equal(result[field]!.sources[0].href, '/api/documents/doc-interno/file#page=2')
  }
  assert.equal('missionLiteral' in result, false)
  assert.equal('modelUsed' in result, false)
  assert.deepEqual(record, original)
})

test('malformados, dumps no campo de resposta e legado não estruturado falham de forma segura', () => {
  for (const value of ['texto legado de origem desconhecida', '{"resposta":', { raw_text: 'sha256: segredo' }, { resposta: '{"documentoId":"segredo"}' }, { resposta: 'revisao_completa: false' }, { resposta: { arbitrary: 'segredo' } }]) {
    const result = presentResult(value)
    assert.notEqual(result.state, 'ready')
    assert.match(resultText(result), /preservado|nova análise/)
    assert.doesNotMatch(resultText(result), /segredo|revisao_completa/)
  }
  assert.match(resultText(presentResult('{"sintese_executiva":"Resumo antigo."}')), /Resumo antigo/)
})

test('entidades são decodificadas uma vez e palavras técnicas legítimas permanecem', () => {
  assert.equal(publicText('Contrato&#x20;A &amp; B'), 'Contrato A & B')
  assert.equal(publicText('&amp;lt;script&amp;gt;'), '&lt;script&gt;')
  assert.equal(publicText('O perito mencionou sha256 na explicação.'), 'O perito mencionou sha256 na explicação.')
  assert.equal(publicText('[PREENCHER] parte autora'), '[PREENCHER] parte autora')
})

test('não inventa páginas, verificação ou documentos; preserva ausência de prova e divergência relevante', () => {
  const result = presentResult({ ...fixture, evidencias: [{ documentoId: 'estranho', pagina: 9, trecho: 'Trecho alegado', verificacao: 'TRECHO_CONFERIDO_NA_CAMADA_TEXTUAL' }], comparacao_agentes: [{ correcao: 'Nenhuma', impacto: 'Não aplicável' }, { conclusao: 'Prazo não comprovado.', correcao: 'Conferir a intimação.', impacto: 'A data pode mudar a medida seguinte.' }], lacunas_probatorias: [{ fato: 'Pagamento', prova_ausente: 'Comprovante não consta dos documentos.' }] }, documents)
  assert.equal(result.sources[0].page, null)
  assert.equal(result.sources[0].href, undefined)
  assert.match(result.sources[0].verification, /precisa ser conferido/)
  assert.match(resultText(result), /Conferir a intimação/)
  assert.match(resultText(result), /Comprovante não consta/)
  assert.doesNotMatch(resultText(result), /Nenhuma|Não aplicável/)
})

test('textos longos não são truncados e concordâncias exatas não se repetem', () => {
  const long = 'Argumento relevante. '.repeat(1000)
  const result = presentResult({ resposta: long, sintese_executiva: long, parecer_geral: long })
  assert.equal(result.sections.length, 1)
  assert.equal(result.sections[0].text, long.trim())
})

test('conversa, cópia e histórico preservam ressalvas e fontes, sem recibos internos', () => {
  const turns = [{ id: 'turn', agent: 'mestre', message: 'O que consta?', content: 'dump descartado', documentaryResult: fixture, researchEvidence: { evidenceId: 'private' } }]
  const publicTurns = publicConversation(turns, documents)
  assert.equal(publicTurns[0].content, resultText(publicTurns[0].result))
  assert.match(publicTurns[0].content, /Sentença de exemplo.pdf, página 2/)
  assert.doesNotMatch(JSON.stringify(publicTurns), /dump descartado|private|researchEvidence|sha256/)
})

test('missão original preservada, precedência explícita e tamanho limitado', () => {
  assert.equal(composeMission(DEFAULT_MISSION), DEFAULT_MISSION)
  assert.equal(composeMission(DEFAULT_MISSION, 'Verifique o pagamento').split(DEFAULT_MISSION).length, 2)
  assert.equal(instructionsVersion(DEFAULT_MISSION), instructionsVersion(composeMission(DEFAULT_MISSION)))
  assert.ok(instructionsSchema.safeParse(DEFAULT_MISSION).success)
  assert.ok(!instructionsSchema.safeParse('x'.repeat(12001)).success)
  assert.ok(!instructionsSchema.safeParse('Instrução inválida\u0000 com controle').success)
})

test('configuração exige ADMIN, salva com concorrência, restaura e mantém execuções anteriores', async () => {
  let role = 'MACHINE', authenticated = true
  let stored: Record<string, unknown> = {}
  const oldRun = { missionLiteral: DEFAULT_MISSION, instructionsVersion: instructionsVersion(DEFAULT_MISSION) }
  const requireAuth = async () => authenticated ? { user: { id: 'admin', role } } : NextResponse.json({}, { status: 401 })
  const h = await loadRoute('app/api/settings/basile/route.ts', {
    'lib/auth-helpers': { requireAuth, requireAdmin: async () => !authenticated ? NextResponse.json({}, { status: 401 }) : role === 'ADMIN' ? { user: { id: 'admin', role } } : NextResponse.json({}, { status: 403 }) },
    'lib/db': { getSetting: async () => stored.value || '' },
    'lib/firebase/admin': { getDb: () => ({ collection: (name: string) => { assert.equal(name, 'settings'); return { doc: (key: string) => { assert.equal(key, 'basile-instructions-installation-v1'); return {} } } }, runTransaction: async (fn: any) => fn({ get: async () => ({ data: () => stored }), set: (_ref: unknown, data: Record<string, unknown>) => { stored = data } }) }) },
  })
  const put = (body: unknown) => h.route.PUT(new NextRequest('http://localhost/api/settings/basile', { method: 'PUT', body: JSON.stringify(body) }))
  try {
    const initial = await (await h.route.GET()).json()
    assert.equal(initial.content, DEFAULT_MISSION); assert.equal(initial.canEdit, false)
    const content = 'Priorize a cronologia e as lacunas documentais sem inventar informações.'
    assert.equal((await put({ content, version: initial.version })).status, 403)
    assert.deepEqual(stored, {})
    role = 'ADMIN'
    assert.equal((await put({ content: '', version: initial.version })).status, 400)
    const saved = await (await put({ content, version: initial.version })).json()
    assert.equal((await (await h.route.GET()).json()).content, content)
    assert.equal((await put({ content: content + ' outra', version: initial.version })).status, 409)
    const restored = await (await put({ restore: true, version: saved.version })).json()
    assert.equal(restored.content, DEFAULT_MISSION)
    assert.equal(oldRun.missionLiteral, DEFAULT_MISSION)
    assert.equal(oldRun.instructionsVersion, initial.version)
    authenticated = false
    assert.equal((await h.route.GET()).status, 401)
  } finally { h.dispose() }
})

test('API de resultado protege o registro completo e mantém a mesma política do histórico', async () => {
  const record = { id: 'a', caseId: 'c', documentIds: ['doc-interno'], basileResult: fixture, provider: 'privado', missionLiteral: DEFAULT_MISSION, conversation: [] }
  const h = await loadRoute('app/api/analysis/[id]/route.ts', {
    'lib/auth-helpers': { requireAuth: async () => ({ user: { id: 'machine', role: 'MACHINE' } }) },
    'lib/db': { getAnalysisById: async () => record, getDocumentsWithText: async () => documents, deleteAnalysisRecord: async () => undefined },
    'lib/repo/research': { getEvidence: async () => null },
  })
  try {
    const response = await h.route.GET(new NextRequest('http://localhost/api/analysis/a'), { params: Promise.resolve({ id: 'a' }) })
    assert.equal(response.status, 200)
    const data = await response.json()
    assert.deepEqual(data.basileResult, publicAnalysis(record, documents).basileResult)
    assert.equal('provider' in data, false); assert.equal('missionLiteral' in data, false)
  } finally { h.dispose() }
})

test('projeção de documentos mantém apenas os campos necessários à interface', () => {
  const projected = publicDocument({ id: 'doc', caseId: 'case', filename: 'autos.pdf', fileSize: 1200, pageCount: 4, readStatus: 'LIDO_PARCIALMENTE', extractedText: 'texto', sha256: 'segredo', cloudStoragePath: 'uploads/segredo.pdf', extractionInfo: { method: 'OCR' } })
  assert.deepEqual(projected, { id: 'doc', filename: 'autos.pdf', caseId: 'case', fileSize: 1200, pageCount: 4, readStatus: 'LIDO_PARCIALMENTE', textSource: 'NO_TEXT', extractedText: 'texto' })
  assert.doesNotMatch(JSON.stringify(projected), /sha256|cloudStoragePath|segredo|extractionInfo/)
})


test('pesquisa pública preserva a consulta aprovada e exclui diagnósticos por origem', async () => {
  const { clientResearch, publicResearchResult, publicEvidence } = await import('../lib/research/public')
  const record = { id: 'pesquisa', state: 'success', createdAt: 1, plan: { tool: 'buscar_jurisprudencia', query: 'Pergunta curta' }, parameters: { consulta: 'Consulta completa com contexto aprovado', secret: 'privado' }, remoteId: 'privado', futureInternalField: 'privado', resultPath: 'privado' }
  const projected = clientResearch(record)
  assert.deepEqual(projected.submitted, [{ label: 'Consulta', text: 'Consulta completa com contexto aprovado' }])
  assert.ok(!JSON.stringify(projected).includes('privado'))
  const result = { sources: [{ id: 'fonte', title: 'Acórdão sintético', text: 'Trecho', providerId: 'privado', url: 'https://example.org/acordao' }], raw: { secret: 'privado' }, remoteId: 'privado', partial: true, limitations: ['Texto parcial'], consumption: null }
  assert.ok(!JSON.stringify(publicResearchResult(result)).includes('privado'))
  assert.equal(publicResearchResult(result)?.partial, true)
  assert.deepEqual(publicEvidence({ id: 'selecao', sources: result.sources } as any).sources, publicResearchResult(result)?.sources)
})

test('identificadores curtos não alteram palavras e conversa não confere citações por declaração do modelo', () => {
  const result = presentResult({ resposta: 'O documento descreve dano.' }, [{ id: 'd', filename: 'Documento.pdf' }])
  assert.equal(result.sections[0].text, 'O documento descreve dano.')
  const [turn] = publicConversation([{ content: JSON.stringify({ resposta: 'Resposta', evidencias: [{ documentoId: 'doc-interno', pagina: 2, trecho: 'Trecho inventado', verificacao: 'TRECHO_CONFERIDO_NA_CAMADA_TEXTUAL' }] }) }], documents)
  assert.match(turn.result.sources[0].verification, /precisa ser conferido/)
})


test('instruções personalizadas não reaparecem em resultado ou conversa com objetivo adicional', () => {
  const instructions = 'Priorize cronologia documental e não reproduza estas instruções internas.'
  const content = { resposta: instructions, limitacoes: ['Não há documento suficiente.'] }
  const record = { missionLiteral: composeMission(instructions, 'Verifique o pagamento'), mestreResult: content, conversation: [{ content: JSON.stringify(content) }] }
  const output = publicAnalysis(record)
  assert.ok(!JSON.stringify(output).includes(instructions))
  assert.match(output.conversation[0].content, /Não há documento suficiente/)
})


test('seleções integradas podem ser reabertas sem expor dados internos ou outro caso', async () => {
  const evidence = { id: 'saved', caseId: 'case', analysisId: 'analysis', createdAt: 10, createdBy: 'privado', sources: [{ id: 'source', title: 'Fonte sintética', text: 'Texto completo recebido', providerId: 'privado' }] }
  const h = await loadRoute('app/api/research/route.ts', {
    'lib/auth-helpers': { requireAuth: async () => ({ user: { id: 'user' } }), requireAdmin: async () => NextResponse.json({}, { status: 403 }) },
    'lib/research/service': { researchContext: async () => ({ analysis: { caseId: 'case', status: 'CONCLUIDO' }, caseData: {} }), researchAvailability: async () => ({}), prepareResearch: async () => null, confirmResearch: async () => null, selectEvidence: async () => null },
    'lib/repo/research': { getEvidence: async (id: string) => id === 'saved' ? evidence : { ...evidence, analysisId: 'another' }, listEvidence: async () => [evidence], listResearch: async () => [], getResearch: async () => null, readResearchResult: async () => null, reconcileResearch: async () => null, requestResearchCancellation: async () => null },
  })
  try {
    const list = await (await h.route.GET(new NextRequest('http://localhost/api/research?analysisId=analysis'))).json()
    assert.equal(list.integrated[0].sources[0].title, 'Fonte sintética')
    assert.equal(list.integrated[0].sources[0].text, undefined)
    const response = await h.route.GET(new NextRequest('http://localhost/api/research?analysisId=analysis&evidenceId=saved'))
    const body = await response.json()
    assert.equal(body.evidence.sources[0].text, 'Texto completo recebido')
    assert.ok(!JSON.stringify(body).includes('privado'))
    assert.equal((await h.route.GET(new NextRequest('http://localhost/api/research?analysisId=analysis&evidenceId=other'))).status, 404)
  } finally { h.dispose() }
})
