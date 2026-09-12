export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getAnalysisById, getCaseById, getDocumentsWithText, getSetting, updateAnalysis } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { getJurisprudenciaPrompt } from '@/lib/agent-prompts';
import { callLLM, firstConfiguredProvider, getProviderModel } from '@/lib/llm';
import { fetchJurisprudencia } from '@/lib/jurisprudencia-fetch';

function parseJSON(text: string): any {
  try {
    let clean = text?.trim() ?? '{}';
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    if (!clean.startsWith('{') && !clean.startsWith('[')) {
      const start = clean.indexOf('{');
      const end = clean.lastIndexOf('}');
      if (start >= 0 && end > start) clean = clean.slice(start, end + 1);
    }
    const parsed = JSON.parse(clean);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      delete parsed.missao_registrada;
      delete parsed.registros_obediencia;
    }
    return parsed;
  } catch {
    return { raw_text: text };
  }
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

    if (!apiKey || !enabled || !endpoint) {
      return NextResponse.json({
        status: 'aguardando_chave',
        message: 'A base de jurisprudência ainda não foi conectada. Cadastre a chave, o endpoint HTTPS e ative a pesquisa na tela Jurisprudência (acesso administrador). O sistema não inventa precedentes.',
      });
    }

    // 2) Carrega a análise + caso + corpus
    const analysis = await getAnalysisById(analysisId);
    if (!analysis) {
      return NextResponse.json({ error: 'Análise não encontrada' }, { status: 404 });
    }
    const caseData = await getCaseById(String(analysis.caseId));
    const analysisDocumentIds = Array.isArray(analysis.documentIds) ? analysis.documentIds as string[] : []
    const documents = await getDocumentsWithText(analysisDocumentIds);
    const corpusText = (documents ?? [])
      .map((d: any) => `--- DOCUMENTO: ${d?.filename ?? 'sem nome'} ---\n${d?.extractedText ?? '(sem texto extraído)'}\n`)
      .join('\n');

    const mestreOutput = JSON.stringify(analysis.mestreResult ?? {});
    const orientadorOutput = JSON.stringify(analysis.orientacoesResult ?? {});
    const mission = analysis.missionLiteral ?? '';
    const searchQuery = String(query ?? '').trim() || `${caseData?.classText ?? ''} ${caseData?.objective ?? ''} ${mission}`.trim();

    let searchResults = ''
    try {
      searchResults = await fetchJurisprudencia(cfgProvider, apiKey, endpoint, searchQuery)
    } catch (err: any) {
      return NextResponse.json(
        { error: err?.message ?? 'Falha ao consultar a base contratada' },
        { status: 502 }
      )
    }

    // 4) Agente de Jurisprudência analisa APENAS os resultados reais
    const providerKey = firstConfiguredProvider(provider ?? analysis.provider);
    const model = getProviderModel(providerKey);

    const prompt = getJurisprudenciaPrompt(mission, corpusText, mestreOutput, orientadorOutput, searchResults);
    const raw = await callLLM({ provider: providerKey, system: prompt.system, user: prompt.user, model, json: true, label: 'JURISPRUDÊNCIA' });
    const jurisprudenciaResult = parseJSON(raw);

    await updateAnalysis(analysisId, { jurisprudenciaResult });

    return NextResponse.json({ status: 'ok', jurisprudenciaResult });
  } catch (error: any) {
    console.error('Jurisprudencia consult error:', error);
    return NextResponse.json({ error: 'Erro ao consultar jurisprudência' }, { status: 500 });
  }
}
