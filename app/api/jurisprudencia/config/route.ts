export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSetting, setSetting } from '@/lib/db';
import { requireAdmin } from '@/lib/auth-helpers';
import { checkResearchOrigin, researchBody, researchHttpError } from '@/lib/research/http';
import { ResearchError } from '@/lib/research/adapter';
import { assertSafeHttpsUrl } from '@/lib/safe-url';

// Chaves de configuração do gate de Jurisprudência guardadas na tabela Setting (key/value)
const K_PROVIDER = 'jurisprudencia_provider';
const K_API_KEY = 'jurisprudencia_api_key';
const K_ENDPOINT = 'jurisprudencia_endpoint';
const K_ENABLED = 'jurisprudencia_enabled';

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
    });
  } catch (error: any) {
    console.error('Jurisprudencia config GET error:', error);
    return NextResponse.json({ error: 'Erro ao buscar configuração' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const gate = await requireAdmin(); if (gate instanceof NextResponse) return gate;
  try {
    checkResearchOrigin(request);
    const body = z.object({
      provider: z.string().trim().max(80).optional(),
      apiKey: z.string().max(2000).optional(),
      endpoint: z.string().trim().max(2048).optional(),
      enabled: z.boolean().optional(),
    }).strict().parse(await researchBody(request));
    const { provider, apiKey, endpoint, enabled } = body;
    if (provider === 'legaw' || (typeof endpoint === 'string' && /legaw\.ai/i.test(endpoint))) {
      return NextResponse.json({ error: 'Legaw utiliza o serviço MCP central e LEGAW_MCP_KEY no servidor; este cadastro é exclusivo dos provedores legados.' }, { status: 400 });
    }
    if (endpoint) {
      try { assertSafeHttpsUrl(String(endpoint)); }
      catch { throw new ResearchError('INVALID_ENDPOINT', 400); }
    }

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
    });
  } catch (error: any) {
    return researchHttpError(error);
  }
}
