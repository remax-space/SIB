export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { generateUploadTarget } from '@/lib/storage';

export async function POST(request: NextRequest) {
  const gate = await requireAuth(); if (gate instanceof NextResponse) return gate;
  try {
    const body = await request.json();
    const { caseId, fileName, contentType, fileSize } = body ?? {};

    if (!caseId || !fileName || !contentType) {
      return NextResponse.json({ error: 'Campos obrigatórios: caseId, fileName, contentType' }, { status: 400 });
    }

    const caseExists = await prisma.case.findUnique({ where: { id: caseId } });
    if (!caseExists) {
      return NextResponse.json({ error: 'Caso não encontrado' }, { status: 404 });
    }

    const { uploadUrl, cloud_storage_path } = await generateUploadTarget(fileName, contentType);

    return NextResponse.json({ uploadUrl, cloud_storage_path, fileName });
  } catch (error: any) {
    console.error('Upload presign error:', error);
    return NextResponse.json({ error: 'Erro ao gerar URL de upload' }, { status: 500 });
  }
}
