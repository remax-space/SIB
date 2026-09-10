export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth-helpers';

// Chaves de configuração do gate de Jurisprudência guardadas na tabela Setting (key/value)
const K_PROVIDER = 'jurisprudencia_provider';
const K_API_KEY = 'jurisprudencia_api_key';
const K_ENDPOINT = 'jurisprudencia_endpoint';
const K_ENABLED = 'jurisprudencia_enabled';

async function getSetting(key: string): Promise<string> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s?.value ?? '';
}

async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function GET() {
  const gate = await requireAdmin(); if (gate instanceof NextResponse) return gate;
  try {
    const provider = await getSetting(K_PROVIDER);
    const apiKey = await getSetting(K_API_KEY);
    const endpoint = await getSetting(K_ENDPOINT);
    const enabled = (await getSetting(K_ENABLED)) === 'true';
    return NextResponse.json({
      provider,
      endpoint,
      enabled,
      hasKey: !!apiKey,
      keyMasked: apiKey ? `${apiKey.substring(0, 6)}${'*'.repeat(18)}` : '',
    });
  } catch (error: any) {
    console.error('Jurisprudencia config GET error:', error);
    return NextResponse.json({ error: 'Erro ao buscar configuração' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const gate = await requireAdmin(); if (gate instanceof NextResponse) return gate;
  try {
    const body = await request.json();
    const { provider, apiKey, endpoint, enabled } = body ?? {};

    if (provider !== undefined) await setSetting(K_PROVIDER, String(provider ?? ''));
    if (endpoint !== undefined) await setSetting(K_ENDPOINT, String(endpoint ?? ''));
    if (enabled !== undefined) await setSetting(K_ENABLED, enabled ? 'true' : 'false');
    // Só sobrescreve a chave se um valor não vazio for enviado (evita apagar por engano)
    if (apiKey !== undefined && String(apiKey).trim() !== '') {
      await setSetting(K_API_KEY, String(apiKey).trim());
    }

    const savedKey = await getSetting(K_API_KEY);
    return NextResponse.json({
      provider: await getSetting(K_PROVIDER),
      endpoint: await getSetting(K_ENDPOINT),
      enabled: (await getSetting(K_ENABLED)) === 'true',
      hasKey: !!savedKey,
      keyMasked: savedKey ? `${savedKey.substring(0, 6)}${'*'.repeat(18)}` : '',
    });
  } catch (error: any) {
    console.error('Jurisprudencia config PUT error:', error);
    return NextResponse.json({ error: 'Erro ao salvar configuração' }, { status: 500 });
  }
}
