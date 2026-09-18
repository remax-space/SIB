import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin, requireAuth } from '@/lib/auth-helpers'
import { rateLimit } from '@/lib/rate-limit'
import { idSchema } from '@/lib/research/contracts'
import { ResearchError } from '@/lib/research/adapter'
import { checkResearchOrigin, researchBody, researchHttpError } from '@/lib/research/http'
import { confirmResearch, prepareResearch, publicResearch, researchAvailability, researchContext, selectEvidence } from '@/lib/research/service'
import { getResearch, listResearch, readResearchResult, reconcileResearch, requestResearchCancellation } from '@/lib/repo/research'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  const session = await requireAuth(); if (session instanceof NextResponse) return session
  try {
    const analysisId = idSchema.parse(request.nextUrl.searchParams.get('analysisId'))
    const ctx = await researchContext(analysisId)
    const id = request.nextUrl.searchParams.get('id')
    if (id) {
      const record = await getResearch(idSchema.parse(id))
      if (!record || record.caseId !== ctx.analysis.caseId || record.analysisId !== analysisId) throw new ResearchError('RESEARCH_NOT_FOUND', 404)
      return NextResponse.json({ research: publicResearch(record), result: await readResearchResult(record) })
    }
    return NextResponse.json({ availability: await researchAvailability(), caseId: ctx.analysis.caseId, cutoffDate: ctx.caseData.cutoffDate ?? null, suggestion: String(ctx.caseData.objective ?? ''), completed: ctx.analysis.status === 'CONCLUIDO', canReconcile: (session.user as { role?: string } | undefined)?.role === 'ADMIN', history: (await listResearch(analysisId)).map(publicResearch), limitations: ['Conclusão da análise não comprova leitura integral. Confira a cobertura documental do Mestre e do Orientador.'] })
  } catch (error) { return researchHttpError(error) }
}
export async function POST(request: NextRequest) {
  const deadline = Date.now() + 55_000
  const session = await requireAuth(); if (session instanceof NextResponse) return session
  try {
    checkResearchOrigin(request)
    const userId = session.user?.id
    if (!userId) throw new ResearchError('INVALID_SESSION', 401)
    if (!rateLimit(`research:${userId}`, 30, 60_000).ok) throw new ResearchError('LOCAL_BUDGET_EXHAUSTED', 429)
    const envelope = z.object({ action: z.enum(['prepare', 'confirm', 'cancel', 'select', 'reconcile']), data: z.unknown() }).strict().parse(await researchBody(request))
    if (envelope.action === 'prepare') return NextResponse.json(await prepareResearch(envelope.data, userId))
    if (envelope.action === 'select') return NextResponse.json({ evidence: await selectEvidence(envelope.data, userId) })
    if (envelope.action === 'reconcile') {
      const admin = await requireAdmin(); if (admin instanceof NextResponse) return admin
      const { id } = z.object({ id: idSchema }).strict().parse(envelope.data)
      return NextResponse.json({ research: publicResearch(await reconcileResearch(id)) })
    }
    if (envelope.action === 'cancel') {
      const { id } = z.object({ id: idSchema }).strict().parse(envelope.data)
      await requestResearchCancellation(id, userId)
      return NextResponse.json({ research: publicResearch((await getResearch(id))!), message: 'Cancelamento solicitado. Após envio, interrupção e cobrança remotas não são garantidas.' })
    }
    const { id, approvalToken } = z.object({ id: idSchema, approvalToken: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(envelope.data)
    return NextResponse.json({ research: await confirmResearch(id, approvalToken, userId, request.signal, deadline) })
  } catch (error) { return researchHttpError(error) }
}
