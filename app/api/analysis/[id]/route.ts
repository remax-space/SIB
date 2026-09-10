export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { deleteAnalysisRecord, getAnalysisById } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(); if (gate instanceof NextResponse) return gate;
  try {
    const { id } = await params;
    await deleteAnalysisRecord(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Analysis DELETE error:', error);
    return NextResponse.json({ error: 'Erro ao limpar análise' }, { status: 500 });
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(); if (gate instanceof NextResponse) return gate;
  try {
    const { id } = await params;
    const analysis = await getAnalysisById(id, true);

    if (!analysis) {
      return NextResponse.json({ error: 'Análise não encontrada' }, { status: 404 });
    }

    return NextResponse.json({
      ...analysis,
      icpScore: analysis?.icpScore != null ? Number(analysis.icpScore) : null,
    });
  } catch (error: any) {
    console.error('Analysis GET error:', error);
    return NextResponse.json({ error: 'Erro ao buscar análise' }, { status: 500 });
  }
}
