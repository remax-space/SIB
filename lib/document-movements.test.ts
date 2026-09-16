import assert from 'node:assert/strict'
import test from 'node:test'
import { locateMovement } from './document-movements'

test('finds movement 28 without matching 280 and preserves source text', () => {
  const pages = ['Movimento 280 — outro ato', 'Mov. 28.1\nDecisão\nTexto original.', 'Continuação da decisão', 'Evento 29 — intimação']
  assert.deepEqual(locateMovement(pages, '28'), [{ page: 2, text: pages[1] }, { page: 3, text: pages[2] }])
})
test('does not infer continuation from an index containing multiple movements', () => {
  assert.deepEqual(locateMovement(['Índice: movimento 28, movimento 29', 'Sem identificador'], '28').map((source) => source.page), [1])
})
test('handles Portuguese labels and missing or scanned text', () => {
  assert.equal(locateMovement(['MOVIMENTAÇÃO Nº 28: decisão'], '28').length, 1)
  assert.deepEqual(locateMovement(['', 'Movimento 12'], '28'), [])
})
