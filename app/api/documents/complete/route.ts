export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createDocument } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { ResearchError } from '@/lib/research/adapter';
import { researchHttpError } from '@/lib/research/http';
import { rateLimit } from '@/lib/rate-limit';
import crypto from 'crypto';
import { readStoredFile } from '@/lib/storage';
import { publicDocument } from '@/lib/public-document';
import { validatePdfSize } from '@/lib/document-limits';

export async function POST(request: NextRequest) {
  const gate = await requireAuth(); if (gate instanceof NextResponse) return gate;
  const rl = rateLimit(`complete:${(gate.user as { id?: string } | undefined)?.id ?? 'anon'}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: `Muitos registros em sequência. Aguarde ${rl.retryAfter}s.` }, { status: 429 });
  }
  try {
    const body = await request.json();
    const { caseId, fileName, contentType, cloud_storage_path } = body ?? {};

    if (!caseId || !fileName || !cloud_storage_path) {
      return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 });
    }

    const bytes = await readStoredFile(cloud_storage_path, contentType ?? 'application/pdf', false);
    try { validatePdfSize(bytes.length); }
    catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 413 }); }
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');

    const doc = await createDocument({
      caseId,
      filename: fileName,
      cloudStoragePath: cloud_storage_path,
      isPublic: false,
      fileSize: bytes.length,
      mimeType: contentType ?? 'application/pdf',
      sha256,
      readStatus: 'PENDENTE',
    });

    return NextResponse.json(publicDocument(doc), { status: 201 });
  } catch (error: any) {
    if (error instanceof ResearchError) return researchHttpError(error);
    console.error('Document complete error:', error);
    return NextResponse.json({ error: 'Erro ao registrar documento' }, { status: 500 });
  }
}
