import test from 'node:test'
import assert from 'node:assert/strict'
import { loadRoute } from './route-harness'

async function repository() {
  let version = 1, failWrite = false
  const state: Record<string, any> = { caseId: 'case', extractedTextPreview: 'prévia original', textLength: 15, readStatus: 'LIDO_PARCIALMENTE' }
  const blobs = new Map<string, string>([['extracted/doc.txt', 'prévia original']])
  const snapshot = () => {
    const v = version
    return { id: 'doc', exists: true, data: () => structuredClone(state), updateTime: { version: v, isEqual: (other: { version: number }) => other.version === v } }
  }
  const ref = { get: async () => snapshot(), update: async (data: unknown) => { Object.assign(state, data); version++ } }
  const loaded = await loadRoute('lib/repo/documents.ts', {
    'lib/firebase/admin': {
      getDb: () => ({ collection: () => ({ doc: () => ref }), runTransaction: async (fn: any) => fn({ get: async () => snapshot(), update: (_: unknown, data: unknown) => { Object.assign(state, data); version++ } }) }),
      getBucket: () => ({ file: (path: string) => ({ save: async (text: string) => { if (failWrite) throw new Error('storage offline'); blobs.set(path, text) }, download: async () => { if (!blobs.has(path)) throw Object.assign(new Error('not found'), { code: 404 }); return [Buffer.from(blobs.get(path)!)] } }) }),
    },
    'lib/storage': { deleteStoredFile: async () => {} },
  })
  return { ...loaded, state, blobs, failWrite: () => { failWrite = true } }
}

test('falha real no adaptador de gravação não atualiza tamanho/prévia/status de leitura', async () => {
  const h = await repository()
  try {
    h.failWrite()
    await assert.rejects(h.route.setDocumentExtractedText('doc', 'nova extração muito mais longa', 2, 'LIDO_INTEGRALMENTE'), /storage offline/)
    assert.equal(h.state.storageStatus, 'WRITE_FAILED')
    assert.equal(h.state.extractedTextPreview, 'prévia original')
    assert.equal(h.state.textLength, 15)
    assert.equal(h.state.readStatus, 'LIDO_PARCIALMENTE')
    assert.equal((await h.route.getDocumentById('doc', true)).extractedText, 'prévia original')
  } finally { h.dispose() }
})

test('extração inferior preserva versão anterior; nova versão usa ponteiro imutável e nunca leitura integral', async () => {
  const h = await repository()
  try {
    await h.route.setDocumentExtractedText('doc', 'curta', 1, 'LIDO_INTEGRALMENTE')
    assert.equal(h.blobs.size, 1)
    await h.route.setDocumentExtractedText('doc', 'extração nova válida mais longa', 4, 'LIDO_INTEGRALMENTE')
    assert.match(h.state.extractedTextPath, /^extracted\/doc\/.+\.txt$/)
    assert.equal(h.blobs.get('extracted/doc.txt'), 'prévia original')
    assert.equal(h.state.pageCount, 4)
    assert.equal(h.state.readStatus, 'LIDO_PARCIALMENTE')
    assert.equal(h.state.extractionStatus, 'PARTIAL')
    const hydrated = await h.route.getDocumentById('doc', true)
    assert.equal(hydrated.textSource, 'FULL_TEXT')
    assert.equal(hydrated.extractedText, 'extração nova válida mais longa')
  } finally { h.dispose() }
})

test('blob ausente com prévia de 2 mil caracteres é explicitamente PREVIEW', async () => {
  const h = await repository()
  try {
    h.blobs.clear()
    Object.assign(h.state, { extractedTextPreview: 'x'.repeat(2000), textLength: 40000 })
    const doc = await h.route.getDocumentById('doc', true)
    assert.equal(doc.extractedText.length, 2000)
    assert.equal(doc.textSource, 'PREVIEW')
    assert.notEqual(doc.extractionStatus, 'COMPLETE')
  } finally { h.dispose() }
})
