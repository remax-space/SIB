export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { deleteCase, getCaseById, updateCase } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(); if (gate instanceof NextResponse) return gate;
  try {
    const { id } = await params;
    const caseData = await getCaseById(id, true);

    if (!caseData) {
      return NextResponse.json({ error: 'Caso não encontrado' }, { status: 404 });
    }

    return NextResponse.json({
      ...caseData,
      analyses: (caseData?.analyses ?? []).map((a: any) => ({
        ...a,
        icpScore: a?.icpScore != null ? Number(a.icpScore) : null,
      })),
    });
  } catch (error: any) {
    console.error('Case GET error:', error);
    return NextResponse.json({ error: 'Erro ao buscar caso' }, { status: 500 });
  }
}

export async function PATCH(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(); if (gate instanceof NextResponse) return gate;
  try {
    const { id } = await params;
    const body = await _request.json();
    const updated = await updateCase(id, body ?? {});
    if (!updated) return NextResponse.json({ error: 'Caso não encontrado' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Case PATCH error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar caso' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(); if (gate instanceof NextResponse) return gate;
  try {
    const { id } = await params;
    await deleteCase(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Case DELETE error:', error);
    return NextResponse.json({ error: 'Erro ao excluir caso' }, { status: 500 });
  }
}
