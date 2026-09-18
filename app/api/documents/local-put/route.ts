export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { writeStoredFile, readStoredFile, deleteStoredFile } from '@/lib/storage'
import { MAX_PDF_BYTES, PDF_SIZE_ERROR } from '@/lib/document-limits'
import { createHash } from 'node:crypto'

const PART_SIZE = 3 * 1024 * 1024
function uploadParts(request: NextRequest, user: string) {
  const query = request.nextUrl.searchParams
  const id = query.get('uploadId'), key = query.get('key'), size = Number(query.get('size')), parts = Number(query.get('parts'))
  if (!id || !/^[a-f0-9-]{36}$/i.test(id) || !key || key.includes('..') || !Number.isSafeInteger(size) || size <= 0 || size > MAX_PDF_BYTES || parts !== Math.ceil(size / PART_SIZE)) throw new Error('Envio em partes inválido.')
  const prefix = `upload-parts/${createHash('sha256').update(JSON.stringify([user, key, id])).digest('hex')}`
  return { key, size, parts, partKey: (index: number) => `${prefix}/${index}` }
}

export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if (gate instanceof NextResponse) return gate
  try {
    const upload = uploadParts(request, String(gate.user?.id))
    const chunks: Buffer[] = []
    for (let i = 0; i < upload.parts; i++) {
      const part = await readStoredFile(upload.partKey(i), 'application/octet-stream', false)
      if (part.length !== Math.min(PART_SIZE, upload.size - i * PART_SIZE)) throw new Error('Parte do arquivo ausente ou incompleta. Envie novamente.')
      chunks.push(part)
    }
    await writeStoredFile(upload.key, Buffer.concat(chunks, upload.size), request.headers.get('content-type') ?? 'application/pdf')
    await Promise.allSettled(chunks.map((_, i) => deleteStoredFile(upload.partKey(i))))
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Upload assembly error:', error)
    return NextResponse.json({ error: 'Não foi possível reunir todas as partes do PDF. Envie novamente.' }, { status: 400 })
  }
}

export async function PUT(request: NextRequest) {
  const gate = await requireAuth()
  if (gate instanceof NextResponse) return gate

  try {
    const key = request.nextUrl.searchParams.get('key')
    if (!key) {
      return NextResponse.json({ error: 'key obrigatória' }, { status: 400 })
    }

    const upload = request.nextUrl.searchParams.has('uploadId') ? uploadParts(request, String(gate.user?.id)) : null
    const part = Number(request.nextUrl.searchParams.get('part'))
    if (upload && (!Number.isInteger(part) || part < 0 || part >= upload.parts)) return NextResponse.json({ error: 'Parte inválida.' }, { status: 400 })
    const limit = upload ? PART_SIZE : MAX_PDF_BYTES
    if (Number(request.headers.get('content-length')) > limit) return NextResponse.json({ error: PDF_SIZE_ERROR }, { status: 413 })
    const reader = request.body?.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    if (reader) while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > limit) { await reader.cancel(); return NextResponse.json({ error: PDF_SIZE_ERROR }, { status: 413 }) }
      chunks.push(value)
    }
    const body = Buffer.concat(chunks, size)
    if (!body.length) {
      return NextResponse.json({ error: 'Arquivo vazio' }, { status: 400 })
    }

    if (upload && body.length !== Math.min(PART_SIZE, upload.size - part * PART_SIZE)) return NextResponse.json({ error: 'Parte incompleta.' }, { status: 400 })
    await writeStoredFile(upload ? upload.partKey(part) : key, body, request.headers.get('content-type') ?? undefined)
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Local upload error:', error)
    return NextResponse.json({ error: 'Erro ao gravar arquivo local' }, { status: 500 })
  }
}
