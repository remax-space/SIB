import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fullTextDefaults } from '../lib/research/full-text-defaults'
import { planSchema, type Research } from '../lib/research/contracts'

const number = '0001234-56.2024.8.26.0001'
test('fills case number, CNJ court and explicit document metadata', () => {
  assert.deepEqual(fullTextDefaults({ caseId: number }, [{ extractedText: `${number}\nRelator: Maria Silva\nData do julgamento: 12/03/2024\n[Página 87]` }], []), {
    processNumber: number, tribunal: 'TJSP', page: 1, relator: 'Maria Silva', judgmentDate: '12/03/2024',
  })
})
test('does not copy another process or ambiguous metadata', () => {
  const result = fullTextDefaults({ caseId: number }, [
    { extractedText: '0009876-54.2024.8.26.0001\nRelator: Outra Pessoa' },
    { extractedText: `${number}\nRelator: Maria Silva` },
    { extractedText: `${number}\nRelator: Joana Silva` },
  ], [])
  assert.equal(result.relator, undefined)
  assert.equal(result.judgmentDate, undefined)
})
test('restores the most recent full-text parameters for the same process only', () => {
  const record = (processNumber: string, createdAt: number, page: number) => ({ state: 'success', createdAt, plan: planSchema.parse({ caseId: 'case', analysisId: 'analysis', tool: 'ler_inteiro_teor', processNumber, tribunal: 'STJ', page, relator: 'Maria Silva' }) }) as Research
  const result = fullTextDefaults({ caseId: number }, [], [record('outro-processo', 3, 9), record(number, 1, 2), record(number, 2, 3)])
  assert.equal(result.page, 3)
  assert.equal(result.tribunal, 'STJ')
  assert.equal(result.relator, 'Maria Silva')
})
test('leaves unavailable metadata blank', () => {
  const result = fullTextDefaults({ caseId: 'processo-antigo' }, [], [])
  assert.equal(result.tribunal, undefined)
  assert.equal(result.page, 1)
})

test('a prepared or failed STJ request does not override the Goiás process tribunal', () => {
  const processNumber = '5277837-27.2024.8.09.0024'
  for (const state of ['awaiting_confirmation', 'error', 'empty', 'cancelled', 'remote_uncertain'] as const) {
    const history = [{ state, createdAt: 1, plan: planSchema.parse({ caseId: 'case', analysisId: 'analysis', tool: 'ler_inteiro_teor', processNumber, tribunal: 'STJ', page: 7, relator: 'Relator incorreto' }) }] as Research[]
    const result = fullTextDefaults({ caseId: processNumber }, [], history)
    assert.equal(result.tribunal, 'TJGO')
    assert.equal(result.page, 1)
    assert.equal(result.relator, undefined)
  }
})
