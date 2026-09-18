import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth-helpers'
import { configureLegawMcp, mcpConnectionState } from '@/lib/research/connection'
import { checkResearchOrigin, researchBody, researchHttpError } from '@/lib/research/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  const session = await requireAdmin(); if (session instanceof NextResponse) return session
  try { return NextResponse.json(await mcpConnectionState(), { headers: { 'Cache-Control': 'no-store' } }) } catch (error) { return researchHttpError(error) }
}

export async function PUT(request: Request) {
  const session = await requireAdmin(); if (session instanceof NextResponse) return session
  void session
  try {
    checkResearchOrigin(request)
    const body = z.object({ enabled: z.boolean(), sharedUseAuthorized: z.boolean().default(false) }).strict().parse(await researchBody(request))
    return NextResponse.json(await configureLegawMcp(body.enabled, body.sharedUseAuthorized, AbortSignal.any([request.signal, AbortSignal.timeout(20_000)])), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return researchHttpError(error) }
}
