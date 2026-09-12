export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { listCases, listRecentDocuments } from '@/lib/db'
import { requireAuth } from '@/lib/auth-helpers'

export async function GET() {
  const gate = await requireAuth()
  if (gate instanceof NextResponse) return gate

  try {
    const [documents, cases] = await Promise.all([
      listRecentDocuments(200),
      listCases({}),
    ])
    const caseMap = new Map((cases ?? []).map((item: any) => [String(item.id), item]))

    return NextResponse.json(
      (documents ?? []).map((doc: any) => {
        const related = caseMap.get(String(doc.caseId))
        return {
          ...doc,
          caseName: related?.caseId ?? doc.caseId,
          caseDbId: doc.caseId,
        }
      })
    )
  } catch (error) {
    console.error('Documents list error:', error)
    return NextResponse.json({ error: 'Erro ao listar documentos' }, { status: 500 })
  }
}
