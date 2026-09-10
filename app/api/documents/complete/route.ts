export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { createDocument } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  const gate = await requireAuth(); if (gate instanceof NextResponse) return gate;
  try {
    const body = await request.json();
    const { caseId, fileName, contentType, fileSize, cloud_storage_path } = body ?? {};

    if (!caseId || !fileName || !cloud_storage_path) {
      return NextResponse.json({ error: 'Campos obrigatórios faltando' }, { status: 400 });
    }

    const sha256 = crypto.createHash('sha256').update(`${cloud_storage_path}-${Date.now()}`).digest('hex');

    const doc = await createDocument({
      caseId,
      filename: fileName,
      cloudStoragePath: cloud_storage_path,
      isPublic: false,
      fileSize: fileSize ?? 0,
      mimeType: contentType ?? 'application/pdf',
      sha256,
      readStatus: 'PENDENTE',
    });

    return NextResponse.json(doc, { status: 201 });
  } catch (error: any) {
    console.error('Document complete error:', error);
    return NextResponse.json({ error: 'Erro ao registrar documento' }, { status: 500 });
  }
}
