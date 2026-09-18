import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { getDocumentById } from '@/lib/db'
import { readStoredFile } from '@/lib/storage'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth(); if (session instanceof NextResponse) return session
  try {
    const { id } = await params
    const doc = await getDocumentById(id)
    if (!doc || doc.mimeType !== 'application/pdf') return NextResponse.json({ error: 'PDF indisponível.' }, { status: 404 })
    const bytes = await readStoredFile(String(doc.cloudStoragePath), 'application/pdf', false)
    return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } })
  } catch { return NextResponse.json({ error: 'Não foi possível abrir o original. Tente novamente.' }, { status: 503 }) }
}
