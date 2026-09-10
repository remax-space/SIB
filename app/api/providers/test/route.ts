export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(); if (gate instanceof NextResponse) return gate;
  try {
    const body = await request.json();
    const { provider, model } = body ?? {};

    const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: model ?? 'gpt-5.4-mini',
        messages: [{ role: 'user', content: 'Responda apenas: "Conexão estabelecida com sucesso."' }],
        max_tokens: 50,
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ success: false, error: `Erro HTTP ${response.status}` });
    }

    const data = await response.json();
    const msg = data?.choices?.[0]?.message?.content ?? 'Sem resposta';

    return NextResponse.json({ success: true, message: msg });
  } catch (error: any) {
    console.error('Provider test error:', error);
    return NextResponse.json({ success: false, error: String(error?.message ?? error) });
  }
}
