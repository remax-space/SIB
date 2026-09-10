export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth-helpers';

export async function GET() {
  const gate = await requireAdmin(); if (gate instanceof NextResponse) return gate;
  try {
    const providers = await prisma.providerConfig.findMany({ orderBy: { provider: 'asc' } });
    // Mask API keys
    const masked = (providers ?? []).map((p: any) => ({
      ...p,
      apiKey: p?.apiKey ? `${p.apiKey.substring(0, 8)}${'*'.repeat(20)}` : '',
    }));
    return NextResponse.json(masked);
  } catch (error: any) {
    console.error('Providers GET error:', error);
    return NextResponse.json({ error: 'Erro ao buscar provedores' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const gate = await requireAdmin(); if (gate instanceof NextResponse) return gate;
  try {
    const body = await request.json();
    const { provider, apiKey, model, enabled } = body ?? {};

    if (!provider) {
      return NextResponse.json({ error: 'Provider obrigatório' }, { status: 400 });
    }

    const updated = await prisma.providerConfig.upsert({
      where: { provider },
      update: {
        ...(apiKey !== undefined ? { apiKey } : {}),
        ...(model !== undefined ? { model } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
      },
      create: {
        provider,
        apiKey: apiKey ?? '',
        model: model ?? '',
        enabled: enabled ?? false,
      },
    });

    return NextResponse.json({
      ...updated,
      apiKey: updated?.apiKey ? `${updated.apiKey.substring(0, 8)}${'*'.repeat(20)}` : '',
    });
  } catch (error: any) {
    console.error('Providers PUT error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar provedor' }, { status: 500 });
  }
}
