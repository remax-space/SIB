export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { PROVIDER_MODELS } from '@/lib/constants';
import { getJurisprudenciaPrompt } from '@/lib/agent-prompts';

async function getSetting(key: string): Promise<string> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s?.value ?? '';
}

async function callLLM(systemPrompt: string, userPrompt: string, model: string): Promise<string> {
  const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 8000,
      response_format: { type: 'json_object' },
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LLM API error (${response.status}): ${errText}`);
  }
  const data = await response.json();
  return data?.choices?.[0]?.message?.content ?? '{}';
}

function parseJSON(text: string): any {
  try {
    let clean = text?.trim() ?? '{}';
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    return JSON.parse(clean);
  } catch {
    return { raw_text: text };
  }
}

/**
 * GATE DE JURISPRUDÊNCIA REAL
 * ---------------------------------------------------------------------------
 * A busca por precedentes reais depende de uma base/API contratada pelo
 * operador (ex.: Escavador, Jusbrasil, Digesto, Codilo, JusBrasil, DataJud).
 * Enquanto NENHUMA chave estiver configurada em /jurisprudencia (admin),
 * a consulta responde `status: 'aguardando_chave'` e o agente NÃO inventa
 * jurisprudência.
 *
 * Quando a chave for cadastrada, implemente aqui a chamada real à API
 * escolhida e monte `searchResults` com o texto dos precedentes retornados.
 */
async function fetchJurisprudencia(
  provider: string,
  apiKey: string,
  endpoint: string,
  query: string
): Promise<string> {
  // TODO(API CONTRATADA): substituir pela integração real do provedor escolhido.
  // O provedor, a chave e o endpoint já chegam prontos aqui. Exemplo esperado:
  //   const r = await fetch(`${endpoint}?q=${encodeURIComponent(query)}`, {
  //     headers: { Authorization: `Bearer ${apiKey}` },
  //   });
  //   const data = await r.json();
  //   return data.results.map(...).join('\n');
  //
  // Por enquanto retornamos string vazia — o agente responderá "sem_resultados".
  return '';
}

export async function POST(request: NextRequest) {
  const gate = await requireAuth(); if (gate instanceof NextResponse) return gate;
  const rlKey = (gate.user as any)?.id ?? 'anon';
  const rl = rateLimit(`jurisprudencia:${rlKey}`, 15, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: `Muitas consultas em sequência. Aguarde ${rl.retryAfter}s.` }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { analysisId, query, provider } = body ?? {};

    if (!analysisId) {
      return NextResponse.json({ error: 'analysisId é obrigatório' }, { status: 400 });
    }

    // 1) Estado do gate
    const cfgProvider = await getSetting('jurisprudencia_provider');
    const apiKey = await getSetting('jurisprudencia_api_key');
    const endpoint = await getSetting('jurisprudencia_endpoint');
    const enabled = (await getSetting('jurisprudencia_enabled')) === 'true';

    if (!apiKey || !enabled) {
      return NextResponse.json({
        status: 'aguardando_chave',
        message: 'A base de jurisprudência ainda não foi conectada. Cadastre a chave da API contratada na tela Jurisprudência (acesso administrador) para ativar a pesquisa de precedentes reais.',
      });
    }

    // 2) Carrega a análise + caso + corpus
    const analysis = await prisma.analysis.findUnique({ where: { id: analysisId } });
    if (!analysis) {
      return NextResponse.json({ error: 'Análise não encontrada' }, { status: 404 });
    }
    const caseData = await prisma.case.findUnique({ where: { id: analysis.caseId } });
    const analysisDocumentIds = Array.isArray(analysis.documentIds) ? analysis.documentIds as string[] : []
    const documents = await prisma.document.findMany({ where: { id: { in: analysisDocumentIds } } });
    const corpusText = (documents ?? [])
      .map((d: any) => `--- DOCUMENTO: ${d?.filename ?? 'sem nome'} ---\n${d?.extractedText ?? '(sem texto extraído)'}\n`)
      .join('\n');

    const mestreOutput = JSON.stringify(analysis.mestreResult ?? {});
    const orientadorOutput = JSON.stringify(analysis.orientacoesResult ?? {});
    const mission = analysis.missionLiteral ?? '';
    const searchQuery = String(query ?? '').trim() || `${caseData?.classText ?? ''} ${caseData?.objective ?? ''} ${mission}`.trim();

    // 3) Busca real na base contratada (gate)
    const searchResults = await fetchJurisprudencia(cfgProvider, apiKey, endpoint, searchQuery);

    // 4) Agente de Jurisprudência analisa APENAS os resultados reais
    const providerKey = provider ?? analysis.provider ?? 'openai';
    const modelInfo = PROVIDER_MODELS[providerKey] ?? PROVIDER_MODELS.openai;
    const model = modelInfo?.model ?? 'gpt-5.4';

    const prompt = getJurisprudenciaPrompt(mission, corpusText, mestreOutput, orientadorOutput, searchResults);
    const raw = await callLLM(prompt.system, prompt.user, model);
    const jurisprudenciaResult = parseJSON(raw);

    await prisma.analysis.update({
      where: { id: analysisId },
      data: { jurisprudenciaResult },
    });

    return NextResponse.json({ status: 'ok', jurisprudenciaResult });
  } catch (error: any) {
    console.error('Jurisprudencia consult error:', error);
    return NextResponse.json({ error: 'Erro ao consultar jurisprudência' }, { status: 500 });
  }
}
