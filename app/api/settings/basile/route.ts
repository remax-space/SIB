import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireAdmin } from '@/lib/auth-helpers'
import { getDb } from '@/lib/firebase/admin'
import { DEFAULT_MISSION } from '@/lib/constants'
import { BASILE_SETTING_KEY, getBasileInstructions, instructionsSchema, instructionsVersion } from '@/lib/basile-settings'
import { z } from 'zod'

export async function GET() {
  const session = await requireAuth(); if (session instanceof NextResponse) return session
  try { return NextResponse.json({ ...await getBasileInstructions(), canEdit: session.user?.role === 'ADMIN' }) }
  catch { return NextResponse.json({ error: 'Não foi possível carregar as instruções. Tente novamente.' }, { status: 503 }) }
}
export async function PUT(request: NextRequest) {
  const session = await requireAdmin(); if (session instanceof NextResponse) return session
  const parsed = z.object({ content: instructionsSchema.optional(), restore: z.boolean().optional(), version: z.string().length(64) }).strict().safeParse(await request.json().catch(() => null))
  if (!parsed.success || (!parsed.data.restore && !parsed.data.content)) return NextResponse.json({ error: 'Use entre 20 e 12.000 caracteres, sem caracteres de controle.' }, { status: 400 })
  try {
    const content = parsed.data.restore ? DEFAULT_MISSION : parsed.data.content!
    const updated = await getDb().runTransaction(async tx => {
      const ref = getDb().collection('settings').doc(BASILE_SETTING_KEY)
      const current = await tx.get(ref)
      if (instructionsVersion(current.data()?.value || DEFAULT_MISSION) !== parsed.data.version) return false
      tx.set(ref, { key: BASILE_SETTING_KEY, value: parsed.data.restore ? '' : content, version: instructionsVersion(content), updatedBy: session.user?.id, updatedAt: new Date() })
      return true
    })
    if (!updated) return NextResponse.json({ error: 'Outro administrador alterou as instruções. Seu texto foi mantido; recarregue a versão atual antes de salvar.' }, { status: 409 })
    return NextResponse.json({ content, version: instructionsVersion(content), customized: !parsed.data.restore, canEdit: true })
  } catch { return NextResponse.json({ error: 'Não foi possível salvar. Seu texto foi mantido; tente novamente.' }, { status: 503 }) }
}
