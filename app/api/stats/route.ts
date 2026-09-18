export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { getDashboardStats } from '@/lib/db';
import { getDocumentsWithText } from '@/lib/db';
import { presentAnalysisRecord } from '@/lib/public-analysis-server';
import { requireAuth } from '@/lib/auth-helpers';

export async function GET() {
  const gate = await requireAuth(); if (gate instanceof NextResponse) return gate;
  try {
    const stats = await getDashboardStats();
    const recentAnalyses = await Promise.all(stats.recentAnalyses.map(async (a: Record<string, unknown>) => {
      const docs = await getDocumentsWithText(Array.isArray(a.documentIds) ? a.documentIds as string[] : [])
      const projected = await presentAnalysisRecord(a, docs.map(d => ({ id: String(d.id), filename: String(d.filename), pageCount: typeof d.pageCount === 'number' ? d.pageCount : null })))
      return { ...projected, case: a.case }
    }))
    return NextResponse.json({ ...stats, recentAnalyses });
  } catch (error: any) {
    console.error('Stats error:', error);
    return NextResponse.json({ error: 'Erro ao buscar estatísticas' }, { status: 500 });
  }
}
