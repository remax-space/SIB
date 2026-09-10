export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getDocumentById, setDocumentExtractedText } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { readStoredFile } from '@/lib/storage';
import { extractPdfText } from '@/lib/llm';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(); if (gate instanceof NextResponse) return gate;
  try {
    const { id } = await params;
    const doc = await getDocumentById(id);

    if (!doc) {
      return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 });
    }

    const fileBuffer = await readStoredFile(String(doc.cloudStoragePath), String(doc.mimeType), Boolean(doc.isPublic));
    const extractedText = await extractPdfText({
      base64: fileBuffer.toString('base64'),
      filename: String(doc.filename),
    });

    const pageCount = Math.max(1, Math.ceil((extractedText?.length ?? 0) / 3000));
    const readStatus = extractedText?.length > 100 ? 'LIDO_INTEGRALMENTE' : 'LIDO_PARCIALMENTE';

    await setDocumentExtractedText(id, extractedText ?? '', pageCount, readStatus);

    return NextResponse.json({ success: true, pageCount, textLength: extractedText?.length ?? 0 });
  } catch (error: any) {
    console.error('Extract error:', error);
    return NextResponse.json({ error: 'Erro ao extrair texto do documento' }, { status: 500 });
  }
}
