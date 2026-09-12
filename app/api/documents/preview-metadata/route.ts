export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { rateLimit } from '@/lib/rate-limit'
import { previewPdfCaseMetadata } from '@/lib/pdf-preview'

const MAX_BYTES = 20 * 1024 * 1024

export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if (gate instanceof NextResponse) return gate

  const rl = rateLimit(`preview-meta:${(gate.user as { id?: string } | undefined)?.id ?? 'anon'}`, 12, 60_000)
  if (!rl.ok) {
    return NextResponse.json({ error: `Muitas leituras em sequência. Aguarde ${rl.retryAfter}s.` }, { status: 429 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Envie um arquivo PDF.' }, { status: 400 })
    }

    const fileName = file.name || 'documento.pdf'
    if (!fileName.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'O arquivo precisa ser um PDF.' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'PDF acima de 20 MB. Digite os dados manualmente.' }, { status: 413 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await previewPdfCaseMetadata({ buffer, fileName })

    return NextResponse.json({
      success: true,
      ...result.metadata,
      missing: result.missing,
      source: result.source,
    })
  } catch (error) {
    console.error('Preview metadata error:', error)
    return NextResponse.json({ error: 'Não foi possível ler os dados do PDF.' }, { status: 500 })
  }
}
