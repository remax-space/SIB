export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { deleteCase } from '@/lib/db'
import { ResearchError } from '@/lib/research/adapter'

export const MAX_CASES_PER_REQUEST = 50
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/

type BulkResult = {
  id: string
  status: 'deleted' | 'already_absent' | 'blocked' | 'failed'
  message?: string
  retryable?: boolean
}

async function mapWithConcurrency<T>(items: string[], worker: (id: string) => Promise<T>, limit: number) {
  const results = new Array<T>(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++
      if (index >= items.length) return
      results[index] = await worker(items[index]!)
    }
  }))
  return results
}

function failureResult(id: string, error: unknown): BulkResult {
  if (error instanceof ResearchError && ['RESEARCH_IN_PROGRESS', 'CASE_DELETION_IN_PROGRESS'].includes(error.code)) {
    return { id, status: 'blocked', message: 'Há uma operação em andamento neste processo. Tente novamente quando ela terminar.' }
  }
  if (error && typeof error === 'object' && (error as { code?: string }).code === 'CASE_CLEANUP_INCOMPLETE') {
    return { id, status: 'failed', retryable: true, message: 'A limpeza dos dados vinculados não foi concluída. É possível tentar novamente.' }
  }
  console.error('Bulk case deletion item failed:', { id, error: error instanceof Error ? error.message : String(error) })
  return { id, status: 'failed', retryable: true, message: 'Não foi possível concluir a exclusão. É possível tentar novamente.' }
}

export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if (gate instanceof NextResponse) return gate

  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: 'Origem da requisição não permitida' }, { status: 403 })
  }

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'O corpo da requisição precisa ser JSON válido' }, { status: 400 })
  }
  const ids = body && typeof body === 'object' && Array.isArray((body as { ids?: unknown }).ids)
    ? (body as { ids: unknown[] }).ids
    : null
  if (!ids) return NextResponse.json({ error: 'Informe um array ids com os identificadores internos dos processos' }, { status: 400 })
  if (ids.length === 0) return NextResponse.json({ error: 'Selecione ao menos um processo' }, { status: 400 })
  if (ids.length > MAX_CASES_PER_REQUEST) return NextResponse.json({ error: `É possível excluir no máximo ${MAX_CASES_PER_REQUEST} processos por requisição` }, { status: 413 })
  if (ids.some(id => typeof id !== 'string' || !ID_PATTERN.test(id))) return NextResponse.json({ error: 'Um ou mais IDs de processo são inválidos' }, { status: 400 })
  const normalized = ids as string[]
  if (new Set(normalized).size !== normalized.length) return NextResponse.json({ error: 'A seleção contém IDs duplicados' }, { status: 400 })

  const results = await mapWithConcurrency(normalized, async id => {
    try {
      const result = await deleteCase(id)
      return { id, status: result.status } satisfies BulkResult
    } catch (error) {
      return failureResult(id, error)
    }
  }, 3)

  const summary = {
    requested: results.length,
    deleted: results.filter(result => result.status === 'deleted').length,
    alreadyAbsent: results.filter(result => result.status === 'already_absent').length,
    blocked: results.filter(result => result.status === 'blocked').length,
    failed: results.filter(result => result.status === 'failed').length,
  }
  return NextResponse.json({ results, summary })
}
