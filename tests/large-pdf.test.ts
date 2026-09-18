import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { NextRequest } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { MAX_PDF_BYTES, validatePdfSize } from '../lib/document-limits'
import { prepareSources } from '../lib/document-sources'
import { reviewDocuments } from '../lib/document-review'
import { fetchAnalysisStream } from '../lib/analysis-stream'
import { loadRoute } from './route-harness'

test('limite aceita exatamente 200 MB e rejeita vazio, tamanho inválido e excesso', () => {
  assert.doesNotThrow(() => validatePdfSize(MAX_PDF_BYTES))
  for (const size of [0, -1, NaN, MAX_PDF_BYTES + 1]) assert.throws(() => validatePdfSize(size))
})

test('envio em partes preserva bytes, rejeita parte incompleta e reúne arquivo somente no fim', async () => {
  const blobs = new Map<string, Buffer>()
  const h = await loadRoute('app/api/documents/local-put/route.ts', {
    'lib/auth-helpers': { requireAuth: async () => ({ user: { id: 'user' } }) },
    'lib/storage': {
      writeStoredFile: async (key: string, bytes: Buffer) => { blobs.set(key, bytes) },
      readStoredFile: async (key: string) => { if (!blobs.has(key)) throw new Error('missing'); return blobs.get(key) },
      deleteStoredFile: async (key: string) => { blobs.delete(key) },
    },
  })
  const size = 3 * 1024 * 1024 + 21
  const query = new URLSearchParams({ key: 'uploads/test.pdf', uploadId: crypto.randomUUID(), parts: '2', size: String(size) })
  const bytes = Buffer.alloc(size, 42)
  const req = (method: string, suffix = '', body?: Buffer) => new NextRequest(`http://localhost/api/documents/local-put?${query}${suffix}`, { method, ...(body ? { body: new Uint8Array(body) } : {}) })
  try {
    assert.equal((await h.route.PUT(req('PUT', '&part=0', bytes.subarray(0, 10)))).status, 400)
    assert.equal((await h.route.PUT(req('PUT', '&part=0', bytes.subarray(0, 3 * 1024 * 1024)))).status, 200)
    assert.equal(blobs.has('uploads/test.pdf'), false)
    assert.equal((await h.route.POST(req('POST'))).status, 400)
    assert.equal((await h.route.PUT(req('PUT', '&part=1', bytes.subarray(3 * 1024 * 1024)))).status, 200)
    assert.equal((await h.route.POST(req('POST'))).status, 200)
    assert.deepEqual(blobs.get('uploads/test.pdf'), bytes)
    assert.equal(blobs.size, 1)
  } finally { h.dispose() }
})

test('originais declarados entre 128 e 200 MB não são rejeitados pelo antigo orçamento', async () => {
  const pdf = await PDFDocument.create(); pdf.addPage()
  const bytes = Buffer.from(await pdf.save())
  const [source] = await prepareSources([{ id: 'doc', filename: 'large.pdf', fileSize: MAX_PDF_BYTES }], async () => bytes)
  assert.equal(source.pageCount, 1)
  assert.ok(source.pdf)
  let read = false
  const [oversized] = await prepareSources([{ id: 'doc', filename: 'large.pdf', fileSize: MAX_PDF_BYTES + 1 }], async () => { read = true; return bytes })
  assert.equal(read, false)
  assert.match(oversized.limitation!, /200 MB/)
})

test('cliente continua SSE no mesmo identificador até o evento final', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async (_url, init) => {
    calls++
    if (calls > 1) assert.deepEqual(JSON.parse(String(init?.body)), { resumeAnalysisId: 'same-analysis' })
    return new Response(`data: ${JSON.stringify({ status: calls < 3 ? 'continuation' : 'completed', analysisId: 'same-analysis' })}\n\n`, { headers: { 'X-Analysis-Id': 'same-analysis' } })
  }
  try {
    const response = await fetchAnalysisStream('/api/analysis/run', { method: 'POST', body: '{}' })
    assert.match(await response.text(), /completed/)
    assert.equal(calls, 3)
  } finally { globalThis.fetch = original }
})

test('PDF real: seis agentes recebem todas as páginas em execuções retomáveis', { skip: !process.env.PDF_REGRESSION_FILE }, async () => {
  const bytes = await readFile(process.env.PDF_REGRESSION_FILE!)
  const sources = await prepareSources([{ id: 'real', filename: 'IDPJ 03.pdf', fileSize: bytes.length }], async () => bytes)
  assert.equal(sources[0].pageCount, 618)
  for (const agent of ['BASILE', 'ADVOGADO', 'JUIZ', 'AUDITOR', 'MESTRE', 'ORIENTADOR']) {
    const received: number[] = []
    let result: Record<string, any> | undefined
    for (let step = 0; step < 30; step++) {
      result = await reviewDocuments({ sources, agent, provider: 'openai', model: 'gpt-4o', mission: 'Teste de transporte completo', prompt: { system: 'Teste', user: 'Teste' }, deadline: Date.now() + 180_000, resumable: true, resume: result,
        llm: async opts => {
          for (const doc of opts.documents ?? []) {
            assert.equal((await PDFDocument.load(Buffer.from(doc.base64, 'base64'))).getPageCount(), doc.pages.length)
            received.push(...doc.pages)
          }
          return JSON.stringify({ avaliacao_documental_propria: 'Resposta simulada, sem avaliação jurídica.' })
        } })
      if (result._documentReview.complete) break
      assert.equal(result._documentReview.pending, true)
    }
    assert.equal(result!._documentReview.complete, true, agent)
    assert.deepEqual(received, Array.from({ length: 618 }, (_, i) => i + 1), agent)
  }
})
