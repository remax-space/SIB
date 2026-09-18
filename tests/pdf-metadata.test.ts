import assert from 'node:assert/strict'
import test from 'node:test'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { parsePdfCaseMetadata, mergePdfCaseMetadata } from '../lib/pdf-case-metadata'
import { loadRoute } from './route-harness'
import { pdfPreviewParts, PREVIEW_PART_BYTES, readPdfPreview } from '../lib/pdf-preview-upload'
import { readFile } from 'node:fs/promises'

const cnj = '1234567-89.2024.8.26.0100'

const courtCover = `Processo Nº: ${cnj}\n1. Dados Processo\nTipo Ação.......................: PROCESSO CÍVEL E DO TRABALHO -> Outros Procedimentos -\n> Incidentes -> Incidente de Desconsideração de Personalidade Jurídica\nSegredo de Justiça.........: NÃO\n2. Partes Processos:\nPolo Ativo\nMARIA DA SILVA\nPolo Passivo\nBANCO EXEMPLO`

test('capa Projudi reconhece classe hierárquica e parte em linha separada', () => {
  assert.deepEqual(parsePdfCaseMetadata(courtCover), { caseId: cnj, clientName: 'MARIA DA SILVA', legalClass: 'Incidente de Desconsideração de Personalidade Jurídica' })
})

test('PDF grande é dividido sem perder páginas e cada pedido cabe no limite', async () => {
  const pdf = await PDFDocument.create()
  for (let i = 0; i < 17; i++) pdf.addPage().drawText(`Pagina ${i + 1}`)
  const bytes = await pdf.save()
  const file = new File([bytes, new Uint8Array(PREVIEW_PART_BYTES)], 'grande.pdf')
  let total = 0
  for await (const part of pdfPreviewParts(file)) {
    assert.ok(part.size <= PREVIEW_PART_BYTES)
    total += (await PDFDocument.load(await part.arrayBuffer())).getPageCount()
  }
  assert.equal(total, 17)
})

test('capa completa não depende de IA nem é substituída por processo anexado', async () => {
  const harness = await loadRoute('lib/pdf-preview.ts', {
    unpdf: { extractText: async () => ({ text: [courtCover, 'Processo: 7654321-00.2020.8.26.0001\nClasse: Execução Fiscal'] }) },
    'lib/llm': { extractPdfCaseMetadata: async () => { assert.fail('capa suficiente') }, inferCaseMetadataFromText: async () => { assert.fail('capa suficiente') } },
    'lib/datajud': { fetchDatajudProcess: async () => null, parseCnj: () => null },
  })
  try {
    const result = await harness.route.previewPdfCaseMetadata({ buffer: Buffer.from('fixture'), fileName: 'autos.pdf' })
    assert.equal(result.metadata.caseId, cnj)
    assert.equal(result.metadata.clientName, 'MARIA DA SILVA')
    assert.deepEqual(result.missing, [])
  } finally { harness.dispose() }
})

test('arquivo real informado para regressão: leitura pelo mesmo caminho do navegador', { skip: !process.env.PDF_REGRESSION_FILE }, async () => {
  const bytes = await readFile(process.env.PDF_REGRESSION_FILE!)
  const harness = await loadRoute('lib/pdf-preview.ts', {
    'lib/llm': { extractPdfCaseMetadata: async () => { throw new Error('offline') }, inferCaseMetadataFromText: async () => ({}) },
    'lib/datajud': { fetchDatajudProcess: async () => null, parseCnj: () => null },
  })
  const originalFetch = globalThis.fetch
  let requests = 0
  globalThis.fetch = async (_url, init) => {
    requests++
    const part = (init!.body as FormData).get('file') as File
    assert.ok(part.size <= PREVIEW_PART_BYTES)
    const result = await harness.route.previewPdfCaseMetadata({ buffer: Buffer.from(await part.arrayBuffer()), fileName: part.name })
    return Response.json(result.metadata)
  }
  try {
    const result = await readPdfPreview(new File([bytes], 'IDPJ 03.pdf'), () => {})
    assert.equal(result.caseId, '5283376-03.2026.8.09.0024')
    assert.equal(result.clientName, 'LUCAS EDUARDO BASILE')
    assert.equal(result.legalClass, 'Incidente de Desconsideração de Personalidade Jurídica')
    assert.equal(result.error, '')
    assert.equal(requests, 1)
  } finally { globalThis.fetch = originalFetch; harness.dispose() }
})

test('campos em linha, rótulos em linhas separadas e classe específica', () => {
  for (const text of [
    `Processo: ${cnj} Autor: Maria da Silva Réu: Banco Exemplo\nClasse: Inventário`,
    `Processo\n${cnj}\nNome do cliente:\nMaria da Silva\nClasse processual:\nInventário`,
  ]) {
    assert.deepEqual(parsePdfCaseMetadata(text), { caseId: cnj, clientName: 'Maria da Silva', legalClass: 'Inventário' })
  }
})

test('processo no documento prevalece sobre arquivo e precedente; cliente explícito prevalece sobre autor', () => {
  const result = parsePdfCaseMetadata(`Precedente 7654321-00.2020.8.26.0001\nProcesso: ${cnj}\nAutor: Banco Exemplo\nCliente: Maria da Silva\nClasse: Agravo em Recurso Especial`, '7654321-00.2020.8.26.0001.pdf')
  assert.equal(result.caseId, cnj)
  assert.equal(result.clientName, 'Maria da Silva')
  assert.equal(result.legalClass, 'ARESP')
  assert.equal(mergePdfCaseMetadata({ legalClass: 'Inventário' }).legalClass, 'Inventário')
})

test('lê metadados após a quarta página quando IA está indisponível', async () => {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < 5; i++) pdf.addPage().drawText(i === 4
    ? `Processo: ${cnj}\nCliente: Maria da Silva\nClasse: Inventário`
    : 'Capa sem dados processuais', { font, size: 12, x: 30, y: 700 })
  const harness = await loadRoute('lib/pdf-preview.ts', {
    'lib/llm': { extractPdfCaseMetadata: async () => { throw new Error('offline') }, inferCaseMetadataFromText: async () => ({}) },
    'lib/datajud': { fetchDatajudProcess: async () => null, parseCnj: () => null },
  })
  try {
    const result = await harness.route.previewPdfCaseMetadata({ buffer: Buffer.from(await pdf.save()), fileName: 'autos.pdf' })
    assert.deepEqual(result.metadata, { caseId: cnj, clientName: 'Maria da Silva', legalClass: 'Inventário' })
    assert.deepEqual(result.missing, [])
  } finally { harness.dispose() }
})

test('leitura visual roda mesmo com texto completo e corrige ordem das colunas', async () => {
  let calls = 0
  const harness = await loadRoute('lib/pdf-preview.ts', {
    unpdf: { extractText: async () => ({ text: [`Processo: ${cnj}\nAutor: Banco Exemplo\nClasse: Apelação`] }) },
    'lib/llm': {
      extractPdfCaseMetadata: async () => { calls++; return { numeroProcesso: cnj, nomeCliente: 'Maria da Silva', classeProcessual: 'Inventário' } },
      inferCaseMetadataFromText: async () => { throw new Error('não deveria chamar') },
    },
    'lib/datajud': { fetchDatajudProcess: async () => null, parseCnj: () => null },
  })
  try {
    const result = await harness.route.previewPdfCaseMetadata({ buffer: Buffer.from('fixture'), fileName: 'autos.pdf' })
    assert.equal(calls, 1)
    assert.equal(result.metadata.clientName, 'Maria da Silva')
    assert.equal(result.metadata.legalClass, 'Inventário')
    assert.deepEqual(result.missing, [])
  } finally { harness.dispose() }
})

test('PDF digitalizado sem dados reconhecidos informa campos ausentes', async () => {
  const harness = await loadRoute('lib/pdf-preview.ts', {
    unpdf: { extractText: async () => ({ text: ['', ''] }) },
    'lib/llm': { extractPdfCaseMetadata: async () => ({}), inferCaseMetadataFromText: async () => ({}) },
    'lib/datajud': { fetchDatajudProcess: async () => null, parseCnj: () => null },
  })
  try {
    const result = await harness.route.previewPdfCaseMetadata({ buffer: Buffer.from('fixture'), fileName: 'autos.pdf' })
    assert.deepEqual(result.missing, ['caseId', 'clientName', 'legalClass'])
  } finally { harness.dispose() }
})
