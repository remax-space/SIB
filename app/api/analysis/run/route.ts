import { loadEvidence, withEvidence, evidenceReceipt, auditResearchCitations } from '@/lib/research/evidence';
import { ResearchError } from '@/lib/research/adapter';
import { researchHttpError } from '@/lib/research/http';
import { comparisonResult } from '@/lib/review-context';
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { createAnalysis, getAnalysisById, getCaseById, getDocumentsWithText, updateAnalysis } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { DEFAULT_MISSION } from '@/lib/constants';
import { callLLM, firstConfiguredProvider, getProviderModel } from '@/lib/llm';
import { prepareSources, validateDocumentSelection, DocumentSelectionError } from '@/lib/document-sources';
import { readStoredFile } from '@/lib/storage';
import { reviewDocuments } from '@/lib/document-review';
import {
  getBasilePrompt,
  getAdvogadoPrompt,
  getCabecaPrompt,
  getAuditorPrompt,
  getMestrePrompt,
  getOrientacoesPrompt,
} from '@/lib/agent-prompts';

function generateJobId(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  return `SIB-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${rand}`;
}

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
  const rl = rateLimit(`analysis:${rlKey}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: `Muitas execuções em sequência. Aguarde ${rl.retryAfter}s.` }, { status: 429 });
  }
  try {
    const body = await request.json();
    const { caseId, authorizedProduct, provider, runMode, documentIds } = body ?? {};
    // Missão padrão do Método Basile quando o operador não digita uma missão própria
    const missionLiteral = (body?.missionLiteral && String(body.missionLiteral).trim())
      ? String(body.missionLiteral).trim()
      : DEFAULT_MISSION;

    if (!caseId || !documentIds?.length) {
      return new Response(
        JSON.stringify({ error: 'Campos obrigatórios: caseId e ao menos um documento' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const providerKey = firstConfiguredProvider(provider);
    const model = getProviderModel(providerKey);
    const mode = runMode ?? 'COMPLETA';

    // Get case + docs
    const caseData = await getCaseById(caseId) as Record<string, unknown> | null;
    if (!caseData) {
      return new Response(JSON.stringify({ error: 'Caso não encontrado' }), { status: 404 });
    }

    if (!Array.isArray(documentIds) || documentIds.some((id: unknown) => typeof id !== 'string' || !id || id.includes('/'))) {
      return NextResponse.json({ error: 'Seleção documental inválida' }, { status: 400 });
    }
    const documents = await getDocumentsWithText(documentIds);
    validateDocumentSelection(caseId, documentIds, documents);
    const evidence = await loadEvidence(body?.evidenceId, caseId);
    if (evidence) {
      const origin = await getAnalysisById(evidence.analysisId);
      if (!origin || origin.missionLiteral !== missionLiteral || JSON.stringify(origin.documentIds) !== JSON.stringify(documentIds)) throw new ResearchError('CONTEXT_CHANGED');
    }
    const deadline = Date.now() + 270_000;
    const sources = mode === 'SOMENTE_BASILE' ? [] : await prepareSources(documents, readStoredFile);
    const sourceManifest = JSON.stringify(sources.map(({ id, filename, sha256, pageCount, limitation }) => ({ id, filename, sha256, pageCount, limitation })));
    const timedLLM: typeof callLLM = (options) => {
      const remaining = deadline - Date.now() - 5000;
      if (remaining < 1000) throw new Error('Tempo da análise esgotado; resultados anteriores preservados.');
      const prompt = withEvidence({ system: options.system, user: options.user }, evidence);
      return callLLM({ ...options, ...prompt, timeoutMs: Math.min(60_000, remaining) });
    };

    const corpusText = (documents ?? [])
      .map((d: any) => `--- DOCUMENTO: ${d?.filename ?? 'sem nome'} ---\n[Origem textual: ${d.textSource}; extração: ${d.extractionStatus}; armazenamento: ${d.storageStatus}]\n${d?.extractedText ?? '(sem texto extraído)'}\n`)
      .join('\n');

    // Create analysis record
    const jobId = generateJobId();
    const analysis = await createAnalysis({
      caseId,
      jobId,
      missionLiteral,
      authorizedProduct: authorizedProduct ?? null,
      provider: providerKey,
      modelUsed: model,
      runMode: mode,
      status: 'EM_ANDAMENTO',
      documentIds,
      currentAgent: 'basile',
      ...(evidence ? { evidenceId: evidence.id, parentAnalysisId: evidence.analysisId } : {}),
    });

    // SSE Stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        function sendEvent(data: any) {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch { /* stream closed */ }
        }

        try {
          // AGENT 1: BASILE
          sendEvent({ status: 'agent_start', agent: 'basile', label: 'OPERADOR — Investigador' });
          await updateAnalysis(analysis.id, { currentAgent: 'basile' });
          await evidenceReceipt(evidence, analysis.id, 'basile', analysis.id);

          const cutoffDate = typeof caseData.cutoffDate === 'string' ? caseData.cutoffDate : undefined;
          const basilePrompt = getBasilePrompt(missionLiteral, corpusText, cutoffDate);
          const basileRaw = await timedLLM({ provider: providerKey, system: basilePrompt.system, user: basilePrompt.user, model, json: true, label: 'BASILE' });
          const basileResult = parseJSON(basileRaw);
          if (evidence) basileResult.fontes_juridicas = auditResearchCitations(basileRaw, evidence);
          await updateAnalysis(analysis.id, { basileResult });
          sendEvent({ status: 'agent_complete', agent: 'basile', label: 'OPERADOR — Investigador' });

          if (mode === 'SOMENTE_BASILE') {
            await updateAnalysis(analysis.id, { status: 'CONCLUIDO', completedAt: new Date(), exitCode: 0, currentAgent: null });
            sendEvent({ status: 'completed', analysisId: analysis.id });
            controller.close();
            return;
          }

          // AGENT 2: ADVOGADO DO DIABO
          sendEvent({ status: 'agent_start', agent: 'advocado', label: 'ADVOGADO DO DIABO — Contraditório' });
          await updateAnalysis(analysis.id, { currentAgent: 'advocado' });
          await evidenceReceipt(evidence, analysis.id, 'advocado', analysis.id);

          const advPrompt = getAdvogadoPrompt(basileRaw, corpusText);
          const advRaw = await timedLLM({ provider: providerKey, system: advPrompt.system, user: advPrompt.user, model, json: true, label: 'ADVOGADO DO DIABO' });
          const advocadoResult = parseJSON(advRaw);
          if (evidence) advocadoResult.fontes_juridicas = auditResearchCitations(advRaw, evidence);
          await updateAnalysis(analysis.id, { advocadoResult });
          sendEvent({ status: 'agent_complete', agent: 'advocado', label: 'ADVOGADO DO DIABO' });

          // AGENT 3: CABEÇA DO JUIZ
          sendEvent({ status: 'agent_start', agent: 'cabeca', label: 'CABEÇA DO JUIZ — Perspectiva Judicial' });
          await updateAnalysis(analysis.id, { currentAgent: 'cabeca' });
          await evidenceReceipt(evidence, analysis.id, 'cabeca', analysis.id);

          const cabPrompt = getCabecaPrompt(basileRaw, advRaw, corpusText);
          const cabRaw = await timedLLM({ provider: providerKey, system: cabPrompt.system, user: cabPrompt.user, model, json: true, label: 'CABEÇA DO JUIZ' });
          const cabecaResult = parseJSON(cabRaw);
          if (evidence) cabecaResult.fontes_juridicas = auditResearchCitations(cabRaw, evidence);
          await updateAnalysis(analysis.id, { cabecaResult });
          sendEvent({ status: 'agent_complete', agent: 'cabeca', label: 'CABEÇA DO JUIZ' });

          // AGENT 4: AUDITOR DOCUMENTAL
          sendEvent({ status: 'agent_start', agent: 'auditor', label: 'AUDITOR DOCUMENTAL — Integridade' });
          await updateAnalysis(analysis.id, { currentAgent: 'auditor' });
          await evidenceReceipt(evidence, analysis.id, 'auditor', analysis.id);

          const audPrompt = getAuditorPrompt(basileRaw, advRaw, cabRaw);
          const audRaw = await timedLLM({ provider: providerKey, system: audPrompt.system, user: audPrompt.user, model, json: true, label: 'AUDITOR DOCUMENTAL' });
          const auditorResult = parseJSON(audRaw);
          if (evidence) auditorResult.fontes_juridicas = auditResearchCitations(audRaw, evidence);
          const icpScore = auditorResult?.icp_basile?.total ?? null;
          await updateAnalysis(analysis.id, { auditorResult, icpScore });
          sendEvent({ status: 'agent_complete', agent: 'auditor', label: 'AUDITOR DOCUMENTAL', icpScore });

          // AGENT 5: MESTRE
          sendEvent({ status: 'agent_start', agent: 'mestre', label: 'MESTRE — Síntese Estratégica' });
          await updateAnalysis(analysis.id, { currentAgent: 'mestre' });
          await evidenceReceipt(evidence, analysis.id, 'mestre', analysis.id);

          const mesPrompt = getMestrePrompt(missionLiteral, sourceManifest, basileRaw, advRaw, cabRaw, audRaw, cutoffDate);
          const mestreResult = await reviewDocuments({ sources, provider: providerKey, model, agent: 'MESTRE', mission: missionLiteral, cutoffDate, prompt: withEvidence(mesPrompt, evidence), deadline: Date.now() + Math.max(0, (deadline - Date.now()) / 2), onProgress: async (result) => { await updateAnalysis(analysis.id, { mestreResult: evidence ? { ...result, fontes_juridicas: auditResearchCitations(result, evidence) } : result }); } });
          if (evidence) mestreResult.fontes_juridicas = auditResearchCitations(mestreResult, evidence);
          const mesRaw = JSON.stringify(comparisonResult(mestreResult));
          await updateAnalysis(analysis.id, { mestreResult });
          sendEvent({ status: 'agent_complete', agent: 'mestre', label: 'MESTRE' });

          // AGENT 6: ORIENTAÇÕES — Revisor Independente
          sendEvent({ status: 'agent_start', agent: 'orientacoes', label: 'ORIENTADOR — Revisor Independente' });
          await updateAnalysis(analysis.id, { currentAgent: 'orientacoes' });
          await evidenceReceipt(evidence, analysis.id, 'orientacoes', analysis.id);

          const oriPrompt = getOrientacoesPrompt(missionLiteral, sourceManifest, basileRaw, advRaw, cabRaw, audRaw, mesRaw, cutoffDate);
          const orientacoesResult = await reviewDocuments({ sources, provider: providerKey, model, agent: 'ORIENTADOR', mission: missionLiteral, cutoffDate, prompt: withEvidence(oriPrompt, evidence), deadline, onProgress: async (result) => { await updateAnalysis(analysis.id, { orientacoesResult: evidence ? { ...result, fontes_juridicas: auditResearchCitations(result, evidence) } : result }); } });
          if (evidence) orientacoesResult.fontes_juridicas = auditResearchCitations(orientacoesResult, evidence);
          await updateAnalysis(analysis.id, { orientacoesResult, status: 'CONCLUIDO', completedAt: new Date(), exitCode: 0, currentAgent: null });
          sendEvent({ status: 'agent_complete', agent: 'orientacoes', label: 'ORIENTADOR — Revisor Independente' });

          sendEvent({ status: 'completed', analysisId: analysis.id, icpScore });
        } catch (err: any) {
          console.error('Analysis pipeline error:', err);
          await updateAnalysis(analysis.id, { status: 'ERRO', exitCode: 10, errorDetail: String(err?.message ?? err), currentAgent: null });
          sendEvent({ status: 'error', message: String(err?.message ?? 'Erro desconhecido') });
        } finally {
          try { controller.close(); } catch { /* already closed */ }
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Analysis-Id': analysis.id,
      },
    });
  } catch (error: any) {
    if (error instanceof ResearchError) return researchHttpError(error);
    if (error instanceof DocumentSelectionError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('Analysis run error:', error);
    return new Response(
      JSON.stringify({ error: 'Erro ao iniciar análise' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
