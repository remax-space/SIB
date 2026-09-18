import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { extractText } from 'unpdf'
import { prepareSources, validateDocumentSelection, sourceAttachment } from '../lib/document-sources'
import { reviewDocuments, verifyEvidence, type ReviewCoverage } from '../lib/document-review'
import { callLLM } from '../lib/llm'
import { getMestrePrompt, getOrientacoesPrompt } from '../lib/agent-prompts'
import { textAvailability, shouldPreserveExtraction } from '../lib/extraction-integrity'
import { formatAgentOutput } from '../lib/format-agent-output'

test('retomada preserva páginas, rejeita mudança do original e consolida todos os lotes extensos', async () => {
  const { sources } = await fixture(65)
  const received: number[] = [], reduced: number[] = []
  let result: Record<string, any> | undefined
  const llm: typeof callLLM = async opts => {
    if (opts.documents) {
      const pages = opts.documents[0].pages
      received.push(...pages)
      return JSON.stringify({ paginas: pages, avaliacao_documental_propria: 'x'.repeat(12000), evidencias: [] })
    }
    if (opts.system.includes('Consolide estas avaliações')) {
      const groups = JSON.parse(opts.user).avaliacoes
      reduced.push(...groups.flatMap((n: any) => n.paginas))
      return JSON.stringify({ avaliacao_documental_propria: 'Consolidado com referências', paginas: groups.flatMap((n: any) => n.paginas), evidencias: [] })
    }
    assert.equal(received.length, 65, 'não sintetizar com páginas pendentes')
    return JSON.stringify({ sintese_executiva: 'Fim da simulação' })
  }
  const opts = { sources: [sources[0]], agent: 'BASILE', provider: 'openai', model: 'gpt-4o', mission: 'leitura', prompt: { system: 'Analise', user: 'Missão' }, resumable: true, maxBatches: 2, llm }
  for (let step = 0; step < 6; step++) {
    result = await reviewDocuments({ ...opts, deadline: Date.now() + 60_000, resume: result })
    if (result._documentReview.complete) break
    assert.equal(result._documentReview.pending, true)
  }
  assert.equal(result!._documentReview.complete, true)
  assert.deepEqual(received, Array.from({ length: 65 }, (_, i) => i + 1))
  assert.deepEqual(reduced, received)
  assert.equal(result!.avaliacoes_por_lote.length, 9)
  await assert.rejects(reviewDocuments({ ...opts, mission: 'outra missão', deadline: Date.now() + 60_000, resume: result }), /mudaram/)
})

test('erro no meio da leitura nunca é apresentado como revisão concluída', async () => {
  const { sources } = await fixture(17)
  const result = await reviewDocuments({ sources: [sources[0]], agent: 'BASILE', provider: 'openai', model: 'gpt-4o', mission: 'leitura', prompt: { system: '', user: '' }, resumable: true, deadline: Date.now() + 60_000,
    llm: async opts => {
      if (!opts.documents) assert.fail('síntese não pode ignorar páginas com falha')
      if (opts.documents[0].pages.includes(9)) throw new Error('falha transitória')
      return JSON.stringify({ avaliacao_documental_propria: 'Simulação' })
    } })
  assert.equal((result._documentReview as any).complete, false)
  assert.equal((result._documentReview as any).pending, false)
  assert.equal((result.cobertura_documental as ReviewCoverage).paginas.filter(p => p.processado).length, 9)
})

async function fixture(pageCount = 12, scanned = false) {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pageCount; i++) {
    const page = pdf.addPage()
    if (scanned) {
      const image = await pdf.embedPng(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=', 'base64'))
      page.drawImage(image, { x: 0, y: 0, width: 500, height: 700 })
    }
    if (!scanned) {
      for (let line = 0; line < 40; line++) page.drawText(`Pagina ${i} Linha ${line} documento original com texto integral para verificacao.`, { x: 10, y: 800 - line * 18, size: 9, font })
      if (i === pageCount) page.drawText('PAGAMENTO COMPROVADO EM 2024', { x: 10, y: 60, size: 12, font })
    }
  }
  const bytes = Buffer.from(await pdf.save())
  let downloads = 0
  const docs = [{ id: 'doc-a', caseId: 'case-a', filename: 'a.pdf' }, { id: 'doc-b', caseId: 'case-a', filename: 'b.pdf' }]
  const sources = await prepareSources(docs, async () => { downloads++; return bytes })
  return { sources, docs, downloads }
}

test('Mestre e Orientador percorrem os mesmos PDFs e últimas páginas sem respostas anteriores', async () => {
  const { sources, downloads } = await fixture()
  assert.equal(downloads, 2)
  assert.ok(sources[0].pages.join('').indexOf('PAGAMENTO COMPROVADO') > 15000)
  const received: { agent: string; id: string; pages: number[] }[] = []
  for (const agent of ['mestre', 'orientacoes']) {
    const result = await reviewDocuments({ sources, agent, mission: 'Verifique o pagamento', provider: 'openai', model: 'gpt-4o', deadline: Date.now() + 60_000,
      prompt: agent === 'mestre' ? getMestrePrompt('Verifique o pagamento', 'manifest', '', '', '', '') : getOrientacoesPrompt('Verifique o pagamento', 'manifest', '', '', '', '', ''),
      llm: async opts => {
        for (const doc of opts.documents ?? []) {
          received.push({ agent, id: doc.documentId, pages: doc.pages })
          const pdf = await PDFDocument.load(Buffer.from(doc.base64, 'base64'))
          assert.equal(pdf.getPageCount(), doc.pages.length)
          const text = (await extractText(new Uint8Array(Buffer.from(doc.base64, 'base64')), { mergePages: true })).text
          if (doc.pages.includes(12)) assert.match(text, /PAGAMENTO COMPROVADO EM 2024/)
        }
        return JSON.stringify({ avaliacao_documental_propria: 'Simulação de transporte', evidencias: [{ documentoId: 'doc-a', pagina: 12, trecho: 'PAGAMENTO COMPROVADO EM 2024', categoria: 'FATO_DOCUMENTADO' }] })
      },
    })
    const coverage = result.cobertura_documental as ReviewCoverage
    assert.equal(coverage.paginas.length, 24)
    assert.ok(coverage.paginas.every(p => p.enviado && p.processado))
    assert.equal(coverage.revisao_completa, false)
    assert.equal(coverage.status, 'PROCESSAMENTO_CONCLUIDO')
  }
  const forAgent = (agent: string) => received.filter(r => r.agent === agent).map(({ id, pages }) => ({ id, pages }))
  assert.deepEqual(forAgent('mestre'), forAgent('orientacoes'))
  assert.ok(received.some(r => r.pages.includes(12)))
})

test('interpretações erradas são separadas da leitura própria; síntese recebe fonte contrária e pode reconsultar página', async () => {
  const { sources } = await fixture(2)
  let synthesis = 0, supplementary = false
  await reviewDocuments({ sources, agent: 'mestre', mission: 'pagamento', provider: 'openai', model: 'gpt-4o', deadline: Date.now() + 60_000,
    prompt: getMestrePrompt('pagamento', 'manifest', 'NÃO HOUVE PAGAMENTO', '', '', ''),
    llm: async opts => {
      if (opts.documents) {
        if (opts.user.includes('NÃO HOUVE PAGAMENTO')) supplementary = true
        else assert.ok(!opts.user.includes('NÃO HOUVE PAGAMENTO'))
        return JSON.stringify({ evidencias: [{ documentoId: 'doc-a', pagina: 2, trecho: 'PAGAMENTO COMPROVADO EM 2024' }] })
      }
      assert.match(opts.user, /NÃO HOUVE PAGAMENTO/)
      assert.match(opts.user, /PAGAMENTO COMPROVADO EM 2024/)
      return JSON.stringify(++synthesis === 1 ? { solicitar_paginas: [{ documentoId: 'doc-a', paginas: [2] }] } : { sintese_executiva: 'Resposta simulada' })
    },
  })
  assert.equal(supplementary, true)
  // This is a data-flow test, not evidence of actual model reasoning.
})

test('prévia, ausência e falha de armazenamento não representam texto integral', () => {
  assert.equal(textAvailability({ extractedTextPreview: 'x'.repeat(2000), textLength: 90000 }, null).textSource, 'PREVIEW')
  assert.equal(textAvailability({}, null).textSource, 'NO_TEXT')
  assert.equal(textAvailability({}, null, true).textSource, 'STORAGE_ERROR')
  assert.equal(textAvailability({}, 'conteúdo completo da extração').extractionStatus, 'UNKNOWN')
  assert.equal(textAvailability({ textLength: 20000 }, 'curto').textSource, 'PARTIAL_TEXT')
  assert.equal(shouldPreserveExtraction('extração anterior longa', 'curta'), true)
})

test('seleção ausente, duplicada e de outro caso é rejeitada', () => {
  assert.throws(() => validateDocumentSelection('a', ['1', '2'], [{ id: '1', caseId: 'a' }]))
  assert.throws(() => validateDocumentSelection('a', ['1'], [{ id: '1', caseId: 'b' }]))
  assert.throws(() => validateDocumentSelection('a', ['1', '1'], [{ id: '1', caseId: 'a' }]))
  assert.doesNotThrow(() => validateDocumentSelection('a', ['1'], [{ id: '1', caseId: 'a' }]))
})

test('PDF sem texto e modelo textual sem OCR geram limitação explícita', async () => {
  const { sources } = await fixture(1, true)
  const savedEnv = { ...process.env }
  for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY']) delete process.env[key]
  try {
    const result = await reviewDocuments({ sources, agent: 'mestre', mission: 'ler', provider: 'openai', model: 'text-only', deadline: Date.now() + 60_000, prompt: { system: '', user: '' }, llm: async () => '{}' })
    const coverage = result.cobertura_documental as ReviewCoverage
    assert.equal(coverage.status, 'PARCIAL')
    assert.ok(coverage.paginas.every(p => !p.processado))
    assert.match(coverage.limitacoes.join(' '), /OCR/)
  } finally { process.env = savedEnv }
})

test('tempo esgotado preserva progresso e marca páginas não processadas', async () => {
  const { sources } = await fixture(1)
  let progress = 0
  const result = await reviewDocuments({ sources, agent: 'orientacoes', mission: 'ler', provider: 'openai', model: 'gpt-4o', deadline: Date.now() - 1, prompt: { system: '', user: '' }, onProgress: async () => { progress++ }, llm: async () => { throw new Error('não deveria chamar') } })
  assert.ok(progress > 0)
  assert.equal((result.cobertura_documental as ReviewCoverage).status, 'PARCIAL')
})

test('páginas inventadas e transcrições ausentes nunca recebem verificação', async () => {
  const { sources } = await fixture(1)
  const result = verifyEvidence([{ documentoId: 'doc-a', pagina: 500, trecho: 'falso' }, { documentoId: 'doc-a', pagina: 1, trecho: 'falso' }], sources)
  assert.equal(result[0].pagina, null)
  assert.ok(result.every(r => r.verificacao === 'NAO_VERIFICADO'))
  await assert.rejects(sourceAttachment(sources[0], [500]))
})

test('contratos HTTP: OpenAI Responses, Anthropic document e Gemini inline_data', async () => {
  const savedFetch = globalThis.fetch, savedEnv = { ...process.env }
  process.env.OPENAI_API_KEY = process.env.ANTHROPIC_API_KEY = process.env.GEMINI_API_KEY = 'contract-test'
  try {
    for (const [provider, model] of [['openai', 'gpt-4o'], ['anthropic', 'claude-sonnet-4-20250514'], ['gemini', 'gemini-2.5-flash']]) {
      globalThis.fetch = async (url, init) => {
        const body = JSON.parse(String(init?.body))
        if (provider === 'openai') {
          assert.match(String(url), /\/responses$/)
          assert.equal(body.input[0].content[2].file_data, 'data:application/pdf;base64,cGRm')
          assert.equal(body.instructions, 'sistema')
          assert.equal(body.text.format.type, 'json_object')
          assert.match(body.input[0].content[0].text, /JSON/)
          assert.match(body.input[0].content[0].text, /missão/)
        } else if (provider === 'anthropic') assert.equal(body.messages[0].content[1].source.data, 'cGRm')
        else assert.equal(body.contents[0].parts[1].inline_data.data, 'cGRm')
        return Response.json(provider === 'openai' ? { status: 'completed', output_text: '{"ok":true}' } : provider === 'anthropic' ? { stop_reason: 'end_turn', content: [{ text: '{"ok":true}' }] } : { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }] })
      }
      assert.equal(await callLLM({ provider, model, system: 'sistema', user: 'missão', json: true, documents: [{ documentId: 'd', filename: 'd.pdf', sha256: 'hash', pages: [15], base64: 'cGRm' }] }), '{"ok":true}')
    }
  } finally { globalThis.fetch = savedFetch; process.env = savedEnv }
})

test('falhas de PDF da OpenAI preservam o motivo da rejeição e da resposta incompleta', async () => {
  const savedFetch = globalThis.fetch, savedEnv = { ...process.env }
  process.env.OPENAI_API_KEY = 'contract-test'
  try {
    for (const response of [
      { status: 400, body: { error: { message: 'Input must contain json' } }, reason: /400.*Input must contain json/ },
      { status: 200, body: { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }, reason: /max_output_tokens/ },
    ]) {
      globalThis.fetch = async () => Response.json(response.body, { status: response.status })
      await assert.rejects(callLLM({ provider: 'openai', model: 'gpt-4o', system: 'sistema', user: 'leia', json: true,
        documents: [{ documentId: 'd', filename: 'd.pdf', sha256: 'hash', pages: [1], base64: 'cGRm' }] }), response.reason)
    }
  } finally { globalThis.fetch = savedFetch; process.env = savedEnv }
})

test('formatação preserva resultados antigos e apresenta cobertura dos novos', () => {
  assert.match(formatAgentOutput({ sintese_executiva: 'antigo' }, 'mestre'), /antigo/)
  assert.match(formatAgentOutput({ parecer_geral: 'antigo' }, 'orientacoes'), /antigo/)
  assert.match(formatAgentOutput({ resposta: 'nova', cobertura_documental: { status: 'PARCIAL', paginas: [], limitacoes: ['OCR indisponível'] } }), /páginas não têm texto legível/)
})

test('modelo textual recebe todos os fragmentos de uma página densa sem corte silencioso', async () => {
  const { sources } = await fixture(1)
  sources[0].pages[0] = 'x'.repeat(70_000) + 'FIM_DA_PAGINA'
  const received: string[] = []
  const result = await reviewDocuments({ sources: [sources[0]], agent: 'mestre', mission: 'ler', provider: 'openai', model: 'text-only', deadline: Date.now() + 60_000, prompt: { system: '', user: '' }, llm: async opts => {
    assert.ok(!opts.documents)
    const data = opts.user.startsWith('{') ? JSON.parse(opts.user) : null
    if (data?.texto_por_pagina) received.push(data.texto_por_pagina)
    return '{"avaliacao_documental_propria":"teste"}'
  } })
  assert.ok(received.join('').includes('x'.repeat(70000) + 'FIM_DA_PAGINA'))
  assert.equal((result.cobertura_documental as ReviewCoverage).status, 'PARCIAL')
  assert.ok((result.cobertura_documental as ReviewCoverage).paginas[0].processado)
})

test('OCR em página digitalizada usa PDF original e entrega transcrição rastreada ao modelo textual', async () => {
  const { sources } = await fixture(1, true)
  const savedEnv = { ...process.env }
  process.env.OPENAI_API_KEY = 'test'; process.env.OPENAI_MODEL = 'gpt-4o'
  let ocr = 0, read = 0
  try {
    const result = await reviewDocuments({ sources: [sources[0]], agent: 'orientacoes', mission: 'ler', provider: 'openai', model: 'text-only', deadline: Date.now() + 60_000, prompt: { system: '', user: '' }, llm: async opts => {
      if (opts.documents) { ocr++; assert.deepEqual(opts.documents[0].pages, [1]); return 'TRANSCRICAO OCR SIMULADA' }
      if (opts.user.includes('texto_por_pagina')) { read++; assert.match(opts.user, /TRANSCRICAO OCR SIMULADA/); assert.match(opts.user, /doc-a/) }
      return '{"avaliacao_documental_propria":"teste"}'
    } })
    assert.equal(ocr, 1); assert.equal(read, 1)
    const coverage = result.cobertura_documental as ReviewCoverage
    assert.equal(coverage.paginas[0].modo, 'ocr')
    assert.equal(coverage.status, 'PARCIAL')
  } finally { process.env = savedEnv }
})

test('falha de checkpoint interrompe chamadas para não perder progresso', async () => {
  const { sources } = await fixture(1)
  let calls = 0
  await assert.rejects(reviewDocuments({ sources, agent: 'mestre', mission: 'ler', provider: 'openai', model: 'gpt-4o', deadline: Date.now() + 60000, prompt: { system: '', user: '' }, onProgress: async () => { throw new Error('storage failed') }, llm: async () => { calls++; return '{}' } }), /preservar progresso/)
  assert.equal(calls, 0)
})
