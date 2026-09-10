export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { writeLocalFile } from '@/lib/storage'

export async function PUT(request: NextRequest) {
  const gate = await requireAuth()
  if (gate instanceof NextResponse) return gate

  try {
    const key = request.nextUrl.searchParams.get('key')
    if (!key) {
      return NextResponse.json({ error: 'key obrigatória' }, { status: 400 })
    }

    const body = Buffer.from(await request.arrayBuffer())
    if (!body.length) {
      return NextResponse.json({ error: 'Arquivo vazio' }, { status: 400 })
    }

    await writeLocalFile(key, body)
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Local upload error:', error)
    return NextResponse.json({ error: 'Erro ao gravar arquivo local' }, { status: 500 })
  }
}
