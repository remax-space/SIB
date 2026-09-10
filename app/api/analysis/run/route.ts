export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';
import { rateLimit } from '@/lib/rate-limit';
import { DEFAULT_MISSION } from '@/lib/constants';
import { callLLM, firstConfiguredProvider, getProviderModel } from '@/lib/llm';
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
    // Remove markdown code blocks if present
    let clean = text?.trim() ?? '{}';
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    return JSON.parse(clean);
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
    const caseData = await prisma.case.findUnique({ where: { id: caseId } });
    if (!caseData) {
      return new Response(JSON.stringify({ error: 'Caso não encontrado' }), { status: 404 });
    }

    const documents = await prisma.document.findMany({
      where: { id: { in: documentIds } },
    });

    const corpusText = (documents ?? [])
      .map((d: any) => `--- DOCUMENTO: ${d?.filename ?? 'sem nome'} ---\n${d?.extractedText ?? '(sem texto extraído)'}\n`)
      .join('\n');

    // Create analysis record
    const jobId = generateJobId();
    const analysis = await prisma.analysis.create({
      data: {
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
      },
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
          sendEvent({ status: 'agent_start', agent: 'basile', label: 'BASILE — Investigador' });
          await prisma.analysis.update({ where: { id: analysis.id }, data: { currentAgent: 'basile' } });

          const basilePrompt = getBasilePrompt(missionLiteral, corpusText, caseData?.cutoffDate ?? undefined);
          const basileRaw = await callLLM({ provider: providerKey, system: basilePrompt.system, user: basilePrompt.user, model, json: true, label: 'BASILE' });
          const basileResult = parseJSON(basileRaw);
          await prisma.analysis.update({ where: { id: analysis.id }, data: { basileResult } });
          sendEvent({ status: 'agent_complete', agent: 'basile', label: 'BASILE — Investigador' });

          if (mode === 'SOMENTE_BASILE') {
            await prisma.analysis.update({
              where: { id: analysis.id },
              data: { status: 'CONCLUIDO', completedAt: new Date(), exitCode: 0, currentAgent: null },
            });
            sendEvent({ status: 'completed', analysisId: analysis.id });
            controller.close();
            return;
          }

          // AGENT 2: ADVOGADO DO DIABO
          sendEvent({ status: 'agent_start', agent: 'advocado', label: 'ADVOGADO DO DIABO — Contraditório' });
          await prisma.analysis.update({ where: { id: analysis.id }, data: { currentAgent: 'advocado' } });

          const advPrompt = getAdvogadoPrompt(basileRaw, corpusText);
          const advRaw = await callLLM({ provider: providerKey, system: advPrompt.system, user: advPrompt.user, model, json: true, label: 'ADVOGADO DO DIABO' });
          const advocadoResult = parseJSON(advRaw);
          await prisma.analysis.update({ where: { id: analysis.id }, data: { advocadoResult } });
          sendEvent({ status: 'agent_complete', agent: 'advocado', label: 'ADVOGADO DO DIABO' });

          // AGENT 3: CABEÇA DO JUIZ
          sendEvent({ status: 'agent_start', agent: 'cabeca', label: 'CABEÇA DO JUIZ — Perspectiva Judicial' });
          await prisma.analysis.update({ where: { id: analysis.id }, data: { currentAgent: 'cabeca' } });

          const cabPrompt = getCabecaPrompt(basileRaw, advRaw, corpusText);
          const cabRaw = await callLLM({ provider: providerKey, system: cabPrompt.system, user: cabPrompt.user, model, json: true, label: 'CABEÇA DO JUIZ' });
          const cabecaResult = parseJSON(cabRaw);
          await prisma.analysis.update({ where: { id: analysis.id }, data: { cabecaResult } });
          sendEvent({ status: 'agent_complete', agent: 'cabeca', label: 'CABEÇA DO JUIZ' });

          // AGENT 4: AUDITOR DOCUMENTAL
          sendEvent({ status: 'agent_start', agent: 'auditor', label: 'AUDITOR DOCUMENTAL — Integridade' });
          await prisma.analysis.update({ where: { id: analysis.id }, data: { currentAgent: 'auditor' } });

          const audPrompt = getAuditorPrompt(basileRaw, advRaw, cabRaw);
          const audRaw = await callLLM({ provider: providerKey, system: audPrompt.system, user: audPrompt.user, model, json: true, label: 'AUDITOR DOCUMENTAL' });
          const auditorResult = parseJSON(audRaw);
          const icpScore = auditorResult?.icp_basile?.total ?? null;
          await prisma.analysis.update({ where: { id: analysis.id }, data: { auditorResult, icpScore } });
          sendEvent({ status: 'agent_complete', agent: 'auditor', label: 'AUDITOR DOCUMENTAL', icpScore });

          // AGENT 5: MESTRE
          sendEvent({ status: 'agent_start', agent: 'mestre', label: 'MESTRE — Síntese Estratégica' });
          await prisma.analysis.update({ where: { id: analysis.id }, data: { currentAgent: 'mestre' } });

          const mesPrompt = getMestrePrompt(basileRaw, advRaw, cabRaw, audRaw);
          const mesRaw = await callLLM({ provider: providerKey, system: mesPrompt.system, user: mesPrompt.user, model, json: true, label: 'MESTRE' });
          const mestreResult = parseJSON(mesRaw);
          await prisma.analysis.update({ where: { id: analysis.id }, data: { mestreResult } });
          sendEvent({ status: 'agent_complete', agent: 'mestre', label: 'MESTRE' });

          // AGENT 6: ORIENTAÇÕES — Revisor Independente
          sendEvent({ status: 'agent_start', agent: 'orientacoes', label: 'ORIENTADOR — Revisor Independente' });
          await prisma.analysis.update({ where: { id: analysis.id }, data: { currentAgent: 'orientacoes' } });

          const oriPrompt = getOrientacoesPrompt(missionLiteral, corpusText, basileRaw, advRaw, cabRaw, audRaw, mesRaw);
          const oriRaw = await callLLM({ provider: providerKey, system: oriPrompt.system, user: oriPrompt.user, model, json: true, label: 'ORIENTADOR' });
          const orientacoesResult = parseJSON(oriRaw);
          await prisma.analysis.update({
            where: { id: analysis.id },
            data: { orientacoesResult, status: 'CONCLUIDO', completedAt: new Date(), exitCode: 0, currentAgent: null },
          });
          sendEvent({ status: 'agent_complete', agent: 'orientacoes', label: 'ORIENTADOR — Revisor Independente' });

          sendEvent({ status: 'completed', analysisId: analysis.id, icpScore });
        } catch (err: any) {
          console.error('Analysis pipeline error:', err);
          await prisma.analysis.update({
            where: { id: analysis.id },
            data: { status: 'ERRO', exitCode: 10, errorDetail: String(err?.message ?? err), currentAgent: null },
          });
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
    console.error('Analysis run error:', error);
    return new Response(
      JSON.stringify({ error: 'Erro ao iniciar análise' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
