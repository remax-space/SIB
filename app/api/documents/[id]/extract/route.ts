export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { getFileUrl } from '@/lib/s3';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(); if (gate instanceof NextResponse) return gate;
  try {
    const { id } = await params;
    const doc = await prisma.document.findUnique({ where: { id } });

    if (!doc) {
      return NextResponse.json({ error: 'Documento não encontrado' }, { status: 404 });
    }

    // Get file URL for downloading
    const fileUrl = await getFileUrl(doc.cloudStoragePath, doc.mimeType, doc.isPublic);

    // Download the file and convert to base64
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      return NextResponse.json({ error: 'Erro ao baixar arquivo do armazenamento' }, { status: 500 });
    }
    const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
    const base64String = fileBuffer.toString('base64');

    // Use LLM API to extract text from PDF
    const llmResponse = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gemini-3.8-flash',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'file',
              file: {
                filename: doc.filename,
                file_data: `data:application/pdf;base64,${base64String}`,
              },
            },
            {
              type: 'text',
              text: 'Extraia TODO o texto deste documento PDF. Retorne apenas o texto extraído, sem comentários adicionais. Mantenha a estrutura e formatação do documento original o máximo possível. Se houver tabelas, preserve-as em formato legível.',
            },
          ],
        }],
        max_tokens: 16000,
      }),
    });

    if (!llmResponse.ok) {
      const errText = await llmResponse.text();
      console.error('LLM extraction error:', errText);
      return NextResponse.json({ error: 'Erro na extração via IA' }, { status: 500 });
    }

    const llmData = await llmResponse.json();
    const extractedText = llmData?.choices?.[0]?.message?.content ?? '';

    // Count approximate pages (1 page ~ 3000 chars)
    const pageCount = Math.max(1, Math.ceil((extractedText?.length ?? 0) / 3000));

    // Update document
    const updated = await prisma.document.update({
      where: { id },
      data: {
        extractedText,
        pageCount,
        readStatus: extractedText?.length > 100 ? 'LIDO_INTEGRALMENTE' : 'LIDO_PARCIALMENTE',
      },
    });

    return NextResponse.json({ success: true, pageCount, textLength: extractedText?.length ?? 0 });
  } catch (error: any) {
    console.error('Extract error:', error);
    return NextResponse.json({ error: 'Erro ao extrair texto do documento' }, { status: 500 });
  }
}
