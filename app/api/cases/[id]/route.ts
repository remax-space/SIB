export const dynamic = "force-dynamic";

import { presentAnalysisRecord } from '@/lib/public-analysis-server';
import { NextRequest, NextResponse } from 'next/server';
import { deleteCase, getCaseById, updateCase } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { ResearchError } from '@/lib/research/adapter';
import { researchHttpError } from '@/lib/research/http';
import { publicDocument } from '@/lib/public-document';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(); if (gate instanceof NextResponse) return gate;
  try {
    const { id } = await params;
    const caseData = await getCaseById(id, true);

    if (!caseData) {
      return NextResponse.json({ error: 'Caso não encontrado' }, { status: 404 });
    }

    const analyses = ('analyses' in caseData ? caseData.analyses : []) as Array<Record<string, any>>;
    const documents = Array.isArray(caseData.documents)
      ? caseData.documents.map((document: Record<string, unknown>) => publicDocument(document)).filter((document): document is NonNullable<ReturnType<typeof publicDocument>> => Boolean(document))
      : [];
    const sourceDocuments = documents.map(document => ({ id: document.id, filename: document.filename, pageCount: document.pageCount }));
    const publicAnalyses = await Promise.all(analyses.map(analysis => presentAnalysisRecord(analysis, sourceDocuments)));
    return NextResponse.json({
      ...caseData,
      documents,
      analyses: publicAnalyses,
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
    if (error instanceof ResearchError) return researchHttpError(error);
    console.error('Case PATCH error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar caso' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(); if (gate instanceof NextResponse) return gate;
  try {
    const { id } = await params;
    const result = await deleteCase(id);
    return NextResponse.json(result);
  } catch (error: any) {
    if (error instanceof ResearchError) return researchHttpError(error);
    if (error?.code === 'CASE_CLEANUP_INCOMPLETE') {
      return NextResponse.json({ error: error.message, code: error.code, retryable: true }, { status: 502 });
    }
    console.error('Case DELETE error:', error);
    return NextResponse.json({ error: 'Erro ao excluir caso' }, { status: 500 });
  }
}
