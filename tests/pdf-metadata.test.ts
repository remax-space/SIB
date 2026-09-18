import assert from 'node:assert/strict'
import test from 'node:test'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { parsePdfCaseMetadata, mergePdfCaseMetadata } from '../lib/pdf-case-metadata'
import { loadRoute } from './route-harness'

const cnj = '1234567-89.2024.8.26.0100'

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
