import test from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest, NextResponse } from 'next/server'
import { loadRoute } from './route-harness'

function request(body: unknown) {
  return new NextRequest('http://localhost/api/cases/bulk-delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify(body),
  })
}

async function loadBulk(deleteCase: (id: string) => Promise<{ status: 'deleted' | 'already_absent' }>) {
  return loadRoute('app/api/cases/bulk-delete/route.ts', {
    'lib/auth-helpers': { requireAuth: async () => ({ user: { id: 'operator' } }) },
    'lib/db': { deleteCase },
  })
}

test('lote rejeita JSON inválido, seleção vazia, IDs duplicados e IDs fora do formato', async () => {
  const loaded = await loadBulk(async () => ({ status: 'deleted' }))
  try {
    const invalid = await loaded.route.POST(new NextRequest('http://localhost/api/cases/bulk-delete', { method: 'POST', body: '{' }))
    assert.equal(invalid.status, 400)
    assert.equal((await loaded.route.POST(request({ ids: [] }))).status, 400)
    assert.equal((await loaded.route.POST(request({ ids: ['abc', 'abc'] }))).status, 400)
    assert.equal((await loaded.route.POST(request({ ids: ['abc/def'] }))).status, 400)
    assert.equal((await loaded.route.POST(request({ ids: Array.from({ length: 51 }, (_, index) => `id-${index}`) }))).status, 413)
  } finally { loaded.dispose() }
})

test('lote mantém IDs explícitos, limita concorrência e retorna sucesso parcial', async () => {
  let active = 0
  let maximum = 0
  const loaded = await loadBulk(async id => {
    active++
    maximum = Math.max(maximum, active)
    await new Promise(resolve => setTimeout(resolve, 5))
    active--
    return { status: id === 'absent' ? 'already_absent' : 'deleted' }
  })
  try {
    const response = await loaded.route.POST(request({ ids: ['one', 'absent', 'two', 'three'] }))
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(maximum <= 3, true)
    assert.deepEqual(body.summary, { requested: 4, deleted: 3, alreadyAbsent: 1, blocked: 0, failed: 0 })
    assert.deepEqual(body.results.map((item: { id: string }) => item.id), ['one', 'absent', 'two', 'three'])
  } finally { loaded.dispose() }
})

test('lote diferencia item ausente e falha retomável sem anunciar sucesso total', async () => {
  const loaded = await loadRoute('app/api/cases/bulk-delete/route.ts', {
    'lib/auth-helpers': { requireAuth: async () => ({ user: { id: 'operator' } }) },
    'lib/db': {
      deleteCase: async (id: string) => {
        if (id === 'failed') throw Object.assign(new Error('storage'), { code: 'CASE_CLEANUP_INCOMPLETE' })
        return { status: 'already_absent' }
      },
    },
  })
  try {
    const response = await loaded.route.POST(request({ ids: ['failed', 'missing'] }))
    const body = await response.json()
    assert.equal(body.summary.failed, 1)
    assert.equal(body.summary.alreadyAbsent, 1)
    assert.equal(body.results[0].retryable, true)
  } finally { loaded.dispose() }
})

test('lote exige autenticação', async () => {
  const loaded = await loadRoute('app/api/cases/bulk-delete/route.ts', {
    'lib/auth-helpers': { requireAuth: async () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 }) },
    'lib/db': { deleteCase: async () => ({ status: 'deleted' }) },
  })
  try { assert.equal((await loaded.route.POST(request({ ids: ['abc'] }))).status, 401) } finally { loaded.dispose() }
})
