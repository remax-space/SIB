export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { createAnalysis, getAnalysisById, getCaseById, getDocumentsWithText, updateAnalysis, claimAnalysisRun, releaseAnalysisRun } from '@/lib/db'
import { requireAuth } from '@/lib/auth-helpers'
import { rateLimit } from '@/lib/rate-limit'
import { composeMission, getBasileInstructions } from '@/lib/basile-settings'
import { DEFAULT_MISSION } from '@/lib/constants'
import { firstConfiguredProvider, getProviderModel } from '@/lib/llm'
import { prepareSources, validateDocumentSelection, DocumentSelectionError } from '@/lib/document-sources'
import { readStoredFile } from '@/lib/storage'
import { loadEvidence } from '@/lib/research/evidence'
import { ResearchError } from '@/lib/research/adapter'
import { researchHttpError } from '@/lib/research/http'
import { runDocumentPipeline } from '@/lib/analysis-pipeline'

export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if (gate instanceof NextResponse) return gate
  const rl = rateLimit(`analysis:${gate.user?.id ?? 'anon'}`, 10, 60_000)
  if (!rl.ok) return NextResponse.json({ error: `Muitas execuções em sequência. Aguarde ${rl.retryAfter}s.` }, { status: 429 })
  let lease: { id: string; token: string } | undefined
  try {
    const body = await request.json()
    let resume: Awaited<ReturnType<typeof getAnalysisById>> = null
    if (body?.resumeAnalysisId) {
      if (typeof body.resumeAnalysisId !== 'string' || body.resumeAnalysisId.includes('/')) return NextResponse.json({ error: 'Análise inválida.' }, { status: 400 })
      resume = await getAnalysisById(body.resumeAnalysisId)
      if (!resume) return NextResponse.json({ error: 'Análise não encontrada.' }, { status: 404 })
      const token = await claimAnalysisRun(resume.id)
      if (!token) return NextResponse.json({ error: 'Esta análise já está sendo processada. Aguarde a etapa atual.' }, { status: 409 })
      lease = { id: resume.id, token }
      // Reload only after acquiring the lease: another run may have just checkpointed.
      resume = await getAnalysisById(resume.id)
      if (!resume) throw new Error('Análise indisponível.')
      Object.assign(body, { caseId: resume.caseId, documentIds: resume.documentIds, provider: resume.provider, runMode: resume.runMode, evidenceId: resume.evidenceId })
    } else if (body?.sourceAnalysisId) {
      const origin = typeof body.sourceAnalysisId === 'string' && !body.sourceAnalysisId.includes('/') ? await getAnalysisById(body.sourceAnalysisId) : null
      if (!origin || origin.caseId !== body.caseId) return NextResponse.json({ error: 'Análise de origem indisponível.' }, { status: 404 })
      Object.assign(body, { documentIds: origin.documentIds, missionLiteral: origin.analysisRequest ?? (origin.missionLiteral === DEFAULT_MISSION ? '' : origin.missionLiteral), authorizedProduct: origin.authorizedProduct, provider: origin.provider, runMode: origin.runMode })
    }
    const { caseId, documentIds } = body
    if (!caseId || !Array.isArray(documentIds) || !documentIds.length || documentIds.some((id: unknown) => typeof id !== 'string' || !id || id.includes('/'))) throw new DocumentSelectionError('Campos obrigatórios: caseId e seleção documental válida.')
    const caseData = await getCaseById(caseId) as Record<string, unknown> | null
    if (!caseData) throw new DocumentSelectionError('Caso não encontrado')
    const documents = await getDocumentsWithText(documentIds)
    validateDocumentSelection(caseId, documentIds, documents)
    const instructions = await getBasileInstructions()
    const analysisRequest = resume ? String(resume.analysisRequest ?? '') : typeof body.missionLiteral === 'string' ? body.missionLiteral.trim() : ''
    if (analysisRequest.length > 6000) throw new DocumentSelectionError('Use até 6.000 caracteres no objetivo.')
    const missionLiteral = resume?.missionLiteral ?? composeMission(instructions.content, analysisRequest)
    const provider = resume ? String(resume.provider) : firstConfiguredProvider(body.provider)
    const model = resume ? String(resume.modelUsed) : getProviderModel(provider)
    const evidence = await loadEvidence(body.evidenceId, caseId)
    if (evidence && !resume) {
      const origin = await getAnalysisById(evidence.analysisId)
      const sameMission = origin && (origin.instructionsVersion ? origin.missionLiteral === missionLiteral : origin.missionLiteral === analysisRequest || (origin.missionLiteral === DEFAULT_MISSION && !analysisRequest))
      if (!sameMission || JSON.stringify(origin?.documentIds) !== JSON.stringify(documentIds)) throw new ResearchError('CONTEXT_CHANGED')
    }
    const deadline = Date.now() + 250_000
    const sources = await prepareSources(documents, readStoredFile)
    const unavailable = sources.find(source => !source.pdf || !source.pageCount)
    if (unavailable) throw new DocumentSelectionError(`Não foi possível ler ${unavailable.filename}. ${unavailable.limitation ?? 'Confira o PDF e envie-o novamente.'}`)
    const analysis = resume ?? await createAnalysis({ caseId, jobId: `SIB-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      missionLiteral, instructionsVersion: instructions.version, analysisRequest,
      documentSources: sources.map(s => ({ id: s.id, filename: s.filename, pageCount: s.pageCount })),
      authorizedProduct: body.authorizedProduct ?? null, provider, modelUsed: model, runMode: body.runMode ?? 'COMPLETA',
      status: 'EM_ANDAMENTO', documentIds, currentAgent: 'basile', ...(evidence ? { evidenceId: evidence.id, parentAnalysisId: evidence.analysisId } : {}) })
    if (!lease) {
      const token = await claimAnalysisRun(analysis.id)
      if (!token) throw new Error('Análise já em processamento.')
      lease = { id: analysis.id, token }
    }
    const activeLease = lease
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: Record<string, unknown>) => { try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)) } catch { /* consumer disconnected; finish checkpoint */ } }
        try {
          await updateAnalysis(analysis.id, { status: 'EM_ANDAMENTO', errorDetail: null })
          await runDocumentPipeline({ analysis: { ...analysis, id: analysis.id, missionLiteral, provider, modelUsed: model, runMode: resume?.runMode ?? body.runMode ?? 'COMPLETA' }, sources, evidence, deadline,
            cutoffDate: typeof caseData.cutoffDate === 'string' ? caseData.cutoffDate : undefined,
            save: data => updateAnalysis(analysis.id, data, { returnRecord: false }), send })
        } catch (error) {
          console.error('Analysis pipeline error:', error)
          await updateAnalysis(analysis.id, { status: 'ERRO', exitCode: 10, errorDetail: String(error instanceof Error ? error.message : error), currentAgent: null })
          send({ status: 'error', message: 'Não foi possível concluir a análise. Os resultados disponíveis foram preservados. Retome a leitura no resultado da análise.' })
        } finally {
          try { await releaseAnalysisRun(activeLease.id, activeLease.token) }
          finally { try { controller.close() } catch { /* closed */ } }
        }
      },
    })
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Analysis-Id': analysis.id } })
  } catch (error) {
    if (lease) await releaseAnalysisRun(lease.id, lease.token)
    if (error instanceof ResearchError) return researchHttpError(error)
    if (error instanceof DocumentSelectionError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('Analysis run error:', error)
    return NextResponse.json({ error: 'Erro ao iniciar análise' }, { status: 500 })
  }
}
