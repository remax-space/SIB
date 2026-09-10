export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { deleteDocumentRecord, getDocumentById, updateDocument } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(); if (gate instanceof NextResponse) return gate;
  try {
    const { id } = await params;
    const doc = await getDocumentById(id, true);
    if (!doc) return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 });
    return NextResponse.json(doc);
  } catch (error: any) {
    console.error('Document GET error:', error);
    return NextResponse.json({ error: 'Erro' }, { status: 500 });
  }
}

export async function PATCH(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(); if (gate instanceof NextResponse) return gate;
  try {
    const { id } = await params;
    const body = await _request.json();
    const updated = await updateDocument(id, body ?? {});
    if (!updated) return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Document PATCH error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar documento' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(); if (gate instanceof NextResponse) return gate;
  try {
    const { id } = await params;
    await deleteDocumentRecord(id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Document DELETE error:', error);
    return NextResponse.json({ error: 'Erro ao excluir documento' }, { status: 500 });
  }
}
