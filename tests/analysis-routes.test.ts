import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { NextRequest, NextResponse } from 'next/server'
import { loadRoute } from './route-harness'
import { contextVersion } from '../lib/research/identity'
import { createHash } from 'node:crypto'
import { prepareSources } from '../lib/document-sources'

async function harness(file: string, options: { foreign?: boolean; missing?: boolean; unauthenticated?: boolean; evidence?: boolean; failFirst?: boolean; noText?: boolean; scanned?: boolean; unreadable?: boolean; pages?: number } = {}) {
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage()
  if (!options.scanned) page.drawText('PAGAMENTO NO ORIGINAL', { font })
  for (let i = 1; i < (options.pages ?? 1); i++) pdf.addPage().drawText(`PAGINA ${i + 1}`, { font })
  const bytes = Buffer.from(await pdf.save())
  const documents = [{ id: 'd1', caseId: options.foreign ? 'other' : 'case', filename: 'documento.pdf', extractedText: options.noText ? '' : 'PAGAMENTO', textSource: options.noText ? 'NO_TEXT' : 'FULL_TEXT' }]
  const state: Record<string, any> = { id: 'analysis', caseId: 'case', status: 'CONCLUIDO', provider: 'openai', modelUsed: 'gpt-4o', documentIds: ['d1'], missionLiteral: 'Apure pagamento', conversation: [], case: { cutoffDate: '2025-01-01' } }
  const calls: any[] = [], updates: any[] = []
  const receipts: any[] = []
  const evidence = { id: 'snapshot', analysisId: 'analysis', caseId: 'case', createdAt: Date.now(), createdBy: 'user', contextVersion: contextVersion(state, { cutoffDate: '2025-01-01' }, documents), sourceIds: ['research:1'], researchIds: ['research'], sources: [{ id: 'research:1', title: 'Fonte de teste', text: 'FUNDAMENTO EXTERNO COMUM', date: '2024-01-01' }], criteria: [], allowAfterCutoff: false, acknowledgeStale: false }
  let downloads = 0
  const mocks = {
    'lib/auth-helpers': { requireAuth: async () => options.unauthenticated ? NextResponse.json({}, { status: 401 }) : { user: { id: 'user' } } },
    'lib/rate-limit': { rateLimit: () => ({ ok: true }) },
    'lib/db': {
      getCaseById: async () => ({ id: 'case', cutoffDate: '2025-01-01' }),
      getDocumentsWithText: async () => options.missing ? [] : documents,
      createAnalysis: async (data: any) => { Object.assign(state, data); return { id: 'analysis' } },
      updateAnalysis: async (_id: string, data: any) => { updates.push(structuredClone(data)); Object.assign(state, structuredClone(data)); return state },
      getAnalysisById: async () => structuredClone(state), setSetting: async () => undefined, getSetting: async () => null,
      claimAnalysisRun: async () => 'lease', releaseAnalysisRun: async () => undefined,
    },
    'lib/storage': { readStoredFile: async () => { downloads++; if (options.unreadable) throw new Error('Original indisponível'); return bytes } },
    'lib/repo/research': {
      assertCaseWritable: async () => undefined,
      assertCaseWritableInTransaction: async () => undefined,
      listResearch: async () => [],
      ...Object.fromEntries(['createResearch', 'cachedResearch', 'claimResearch', 'finishResearch', 'readResearchResult', 'saveEvidence', 'markDispatched', 'saveResearchResult'].map(name => [name, async () => { throw new Error(`Pesquisa externa inesperada: ${name}`) }])),
      getEvidence: async () => options.evidence ? structuredClone(evidence) : null,
      getResearch: async () => ({ id: 'research', caseId: 'case', resultPath: 'snapshot', state: 'success', validUntil: Date.now() + 86400_000 }),
      recordEvidenceUse: async (...args: any[]) => { receipts.push(structuredClone(args)) },
    },
    'lib/repo/text-store': { storeLargeJson: async (_id: string, _field: string, value: unknown) => ({ stored: structuredClone(value) }) },
    'lib/firebase/admin': { getBucket: () => { throw new Error('Unexpected storage access') }, getDb: () => ({ collection: () => ({ doc: () => ({}) }), runTransaction: async (fn: any) => fn({ get: async () => ({ exists: true, data: () => structuredClone(state) }), update: (_ref: unknown, data: any) => { updates.push(structuredClone(data)); Object.assign(state, structuredClone(data)) } }) }) },
    'lib/llm': {
      firstConfiguredProvider: () => 'openai', getProviderModel: () => 'gpt-4o', getProviderApiKey: () => 'test', LLM_PROVIDERS: ['openai'],
      callLLM: async (opts: any) => { calls.push(opts); if (options.failFirst && calls.length === 1) throw new Error('Falha simulada de interpretação'); return JSON.stringify({ sintese_executiva: 'Simulação [fonte: research:1]', parecer_geral: 'Simulação [fonte: research:1]', resposta: 'Simulação [fonte: research:1]', avaliacao_documental_propria: 'Fonte recebida', evidencias: [{ documentoId: 'd1', pagina: 1, trecho: 'PAGAMENTO NO ORIGINAL' }] }) },
    },
  }
  const loaded = await loadRoute(file, mocks)
  return { ...loaded, state, calls, updates, receipts, evidence, downloads: () => downloads }
}
const request = (body: unknown) => new NextRequest('http://localhost/api/test', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })

test('análise longa retoma o mesmo registro, percorre todas as páginas e não repete lotes concluídos', async () => {
  const h = await harness('app/api/analysis/run/route.ts', { pages: 65 })
  try {
    const first = await h.route.POST(request({ caseId: 'case', documentIds: ['d1'], runMode: 'SOMENTE_BASILE' }))
    const initial = await first.text()
    assert.match(initial, /"status":"continuation"/)
    assert.doesNotMatch(initial, /"status":"completed"/)
    assert.equal(h.state.status, 'EM_ANDAMENTO')
    assert.equal(h.state.basileResult.cobertura_documental.paginas.filter((p: any) => p.processado).length, 48)
    const second = await h.route.POST(request({ resumeAnalysisId: 'analysis' }))
    assert.match(await second.text(), /"status":"completed"/)
    assert.equal(h.state.status, 'CONCLUIDO')
    assert.deepEqual(h.calls.flatMap(c => c.documents?.flatMap((d: any) => d.pages) ?? []), Array.from({ length: 65 }, (_, i) => i + 1))
    assert.equal(h.state.basileResult.cobertura_documental.paginas.length, 65)
  } finally { h.dispose() }
})

test('upload calcula hash e tamanho dos bytes e mantém rejeição de original alterado', async () => {
  const pdf = await PDFDocument.create(); pdf.addPage()
  const bytes = Buffer.from(await pdf.save())
  let saved: any
  const loaded = await loadRoute('app/api/documents/complete/route.ts', {
    'lib/auth-helpers': { requireAuth: async () => ({ user: { id: 'user' } }) },
    'lib/rate-limit': { rateLimit: () => ({ ok: true }) },
    'lib/storage': { readStoredFile: async () => bytes },
    'lib/db': { createDocument: async (doc: any) => { saved = { ...doc, id: 'doc' }; return saved } },
  })
  try {
    const response = await loaded.route.POST(request({ caseId: 'case', fileName: 'a.pdf', fileSize: 1, cloud_storage_path: 'uploads/a.pdf' }))
    assert.equal(response.status, 201)
    assert.equal(saved.sha256, createHash('sha256').update(bytes).digest('hex'))
    assert.equal(saved.fileSize, bytes.length)
    assert.ok((await prepareSources([saved], async () => bytes))[0].pdf)
    const changed = Buffer.concat([bytes, Buffer.from('\n% changed')])
    const [rejected] = await prepareSources([saved], async () => changed)
    assert.equal(rejected.pdf, undefined)
    assert.match(rejected.limitation!, /Hash do original diverge/)
  } finally { loaded.dispose() }
})

test('rota inicial mantém SSE, ordem, persistência e fontes próprias dos dois revisores', async () => {
  const h = await harness('app/api/analysis/run/route.ts')
  try {
    const response = await h.route.POST(request({ caseId: 'case', documentIds: ['d1'], missionLiteral: 'Apure pagamento' }))
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type'), /text\/event-stream/)
    const events = String(await response.text()).split('\n\n').filter(Boolean).map(line => JSON.parse(line.replace(/^data: /, '')))
    assert.deepEqual(events.filter(e => e.status === 'agent_complete').map(e => e.agent), ['basile', 'advocado', 'cabeca', 'auditor', 'mestre', 'orientacoes'])
    assert.equal(events[events.length - 1].status, 'completed')
    assert.equal(h.state.status, 'CONCLUIDO')
    assert.equal(h.downloads(), 1)
    const documentCalls = h.calls.filter(c => c.documents?.length)
    assert.equal(documentCalls.length, 6)
    assert.match(documentCalls[4].system, /MESTRE/)
    assert.match(documentCalls[5].system, /ORIENTADOR/)
    for (const call of documentCalls) {
      assert.equal(call.documents[0].sha256, documentCalls[0].documents[0].sha256)
      assert.deepEqual(call.documents[0].pages, [1])
      assert.equal((await PDFDocument.load(Buffer.from(call.documents[0].base64, 'base64'))).getPageCount(), 1)
    }
    assert.ok(h.updates.some(u => u.mestreResult?.cobertura_documental?.status === 'EM_ANDAMENTO'))
    assert.ok(h.state.orientacoesResult.cobertura_documental.paginas[0].processado)
  } finally { h.dispose() }
})

test('SOMENTE_BASILE lê o original mesmo sem extração salva e não executa revisores', async () => {
  const h = await harness('app/api/analysis/run/route.ts', { noText: true })
  try {
    const response = await h.route.POST(request({ caseId: 'case', documentIds: ['d1'], runMode: 'SOMENTE_BASILE' }))
    assert.match(await response.text(), /completed/)
    assert.equal(h.calls.length, 2)
    assert.equal(h.downloads(), 1)
    assert.deepEqual(h.calls[0].documents[0].pages, [1])
    assert.equal(h.state.status, 'CONCLUIDO')
  } finally { h.dispose() }
})

test('Basile recebe PDF para leitura visual quando não há camada textual', async () => {
  const h = await harness('app/api/analysis/run/route.ts', { noText: true, scanned: true })
  try {
    const response = await h.route.POST(request({ caseId: 'case', documentIds: ['d1'], runMode: 'SOMENTE_BASILE' }))
    assert.match(await response.text(), /completed/)
    assert.equal(h.calls[0].documents[0].documentId, 'd1')
    assert.deepEqual(h.calls[0].documents[0].pages, [1])
    assert.ok(h.state.basileResult.cobertura_documental.paginas[0].processado)
  } finally { h.dispose() }
})

test('falha em todas as páginas protege o motivo no SSE e preserva a cobertura', async () => {
  const h = await harness('app/api/analysis/run/route.ts', { scanned: true, failFirst: true })
  try {
    const response = await h.route.POST(request({ caseId: 'case', documentIds: ['d1'], runMode: 'SOMENTE_BASILE' }))
    const events: { status: string; message: string }[] = String(await response.text()).split('\n\n').filter(Boolean).map(line => JSON.parse(line.replace(/^data: /, '')))
    assert.match(events.find(e => e.status === 'error')?.message ?? '', /resultados disponíveis foram preservados/)
    assert.doesNotMatch(JSON.stringify(events), /Falha simulada de interpretação/)
    assert.equal(h.state.status, 'ERRO')
    assert.match(h.state.errorDetail, /Falha simulada de interpretação/)
    assert.equal(h.state.basileResult.cobertura_documental.paginas[0].processado, false)
    assert.ok(!events.some(e => e.status === 'completed'))
  } finally { h.dispose() }
})

test('original indisponível bloqueia a análise antes de enviar corpus vazio à IA', async () => {
  const h = await harness('app/api/analysis/run/route.ts', { noText: true, unreadable: true })
  try {
    const response = await h.route.POST(request({ caseId: 'case', documentIds: ['d1'] }))
    assert.equal(response.status, 400)
    assert.match((await response.json()).error, /Não foi possível ler/)
    assert.equal(h.calls.length, 0)
    assert.equal(h.updates.length, 0)
  } finally { h.dispose() }
})

test('rotas rejeitam seleção ausente, outro caso e usuário sem autenticação antes de envio', async () => {
  for (const file of ['app/api/analysis/run/route.ts', 'app/api/analysis/[id]/conversation/route.ts']) {
    for (const option of [{ foreign: true }, { missing: true }, { unauthenticated: true }]) {
      const h = await harness(file, option)
      try {
        const response = await h.route.POST(request({ caseId: 'case', documentIds: ['d1'], agent: 'mestre', message: 'verifique', revision: 0 }), { params: Promise.resolve({ id: 'analysis' }) })
        assert.equal(response.status, 'unauthenticated' in option ? 401 : 400)
        assert.equal(h.calls.length, 0)
        assert.equal(h.downloads(), 0)
      } finally { h.dispose() }
    }
  }
})

test('conversa posterior dos dois revisores e alias orientacoes recebe PDF e salva checkpoints', async () => {
  for (const agent of ['mestre', 'orientador', 'orientacoes']) {
    const h = await harness('app/api/analysis/[id]/conversation/route.ts')
    try {
      const response = await h.route.POST(request({ agent, message: 'Verifique o pagamento no original', revision: 0 }), { params: Promise.resolve({ id: 'analysis' }) })
      assert.equal(response.status, 200)
      const body = await response.json()
      assert.equal(body.conversation[0].agent, agent)
      assert.ok(h.calls.some(c => c.documents?.[0].documentId === 'd1'))
      assert.ok(h.updates.length > 2)
      assert.equal(h.state.conversation.length, 1)
      assert.ok(h.state.conversation[0].documentaryResult.cobertura_documental.paginas[0].processado)
      assert.match(h.calls[0].user, /2025-01-01/)
    } finally { h.dispose() }
  }
})

test('rota SSE distribui snapshot aos seis agentes, registra recibos e preserva PDFs dos revisores', async () => {
  const h = await harness('app/api/analysis/run/route.ts', { evidence: true })
  try {
    const response = await h.route.POST(request({ caseId: 'case', documentIds: ['d1'], missionLiteral: 'Apure pagamento', evidenceId: 'snapshot' }))
    assert.equal(response.status, 200)
    assert.match(await response.text(), /"status":"completed"/)
    assert.deepEqual(h.receipts.map(r => r[2]), ['basile', 'advocado', 'cabeca', 'auditor', 'mestre', 'orientacoes'])
    for (const receipt of h.receipts) assert.deepEqual(receipt[0], h.evidence)
    for (const field of ['basileResult', 'advocadoResult', 'cabecaResult', 'auditorResult', 'mestreResult', 'orientacoesResult']) {
      assert.equal(h.state[field].fontes_juridicas.evidenceId, 'snapshot')
      assert.deepEqual(h.state[field].fontes_juridicas.receivedSourceIds, ['research:1'])
    }
    const prompts = h.calls.filter(c => c.user.includes('PACOTE DE FONTES JURÍDICAS'))
    assert.ok(prompts.length >= 6)
    for (const prompt of prompts) assert.match(prompt.user, /FUNDAMENTO EXTERNO COMUM/)
    assert.equal(h.calls.filter(c => c.documents?.length).length, 6)
  } finally { h.dispose() }
})

test('falha de interpretação na mesa preserva pacote e permite repetir somente IA', async () => {
  const h = await harness('app/api/analysis/[id]/conversation/route.ts', { evidence: true, failFirst: true })
  const body = { agent: 'jurisprudencia', message: 'Interprete as fontes selecionadas', revision: 0, evidenceId: 'snapshot' }
  try {
    const first = await h.route.POST(request(body), { params: Promise.resolve({ id: 'analysis' }) })
    assert.equal(first.status, 502); assert.equal(h.state.conversation.length, 0)
    const second = await h.route.POST(request(body), { params: Promise.resolve({ id: 'analysis' }) })
    assert.equal(second.status, 200)
    const result = await second.json()
    assert.equal(result.conversation[0].researchEvidence, undefined)
    assert.equal(h.state.conversation[0].researchEvidence.evidenceId, 'snapshot')
    assert.deepEqual(h.state.conversation[0].researchCitationAudit.citedSourceIds, ['research:1'])
    assert.doesNotMatch(JSON.stringify(result), /research:1|snapshot|documentoId/)
    assert.equal(h.calls.length, 2)
    assert.equal(h.calls[0].user, h.calls[1].user)
    assert.equal(h.downloads(), 0)
  } finally { h.dispose() }
})

test('mesa contabiliza fontes jurídicas no limite total antes de chamar IA ou salvar recibo', async () => {
  const h = await harness('app/api/analysis/[id]/conversation/route.ts', { evidence: true })
  try {
    h.state.basileResult = { texto: 'x'.repeat(250_000) }
    h.evidence.sources[0].text = 'y'.repeat(70_000)
    const response = await h.route.POST(request({ agent: 'jurisprudencia', message: 'Interprete', revision: 0, evidenceId: 'snapshot' }), { params: Promise.resolve({ id: 'analysis' }) })
    assert.equal(response.status, 422)
    assert.match((await response.json()).error, /fontes jurídicas excedem/)
    assert.equal(h.calls.length, 0); assert.equal(h.receipts.length, 0)
  } finally { h.dispose() }
})
