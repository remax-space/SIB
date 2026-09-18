import { reviewDocuments } from './document-review'
import type { Source } from './document-sources'
import { comparisonResult } from './review-context'
import { getBasilePrompt, getAdvogadoPrompt, getCabecaPrompt, getAuditorPrompt, getMestrePrompt, getOrientacoesPrompt } from './agent-prompts'
import { loadEvidence, withEvidence, evidenceReceipt, auditResearchCitations } from './research/evidence'

type Result = Record<string, any>
const stages = ['basile', 'advocado', 'cabeca', 'auditor', 'mestre', 'orientacoes'] as const
const names = ['BASILE', 'ADVOGADO DO DIABO', 'CABEÇA DO JUIZ', 'AUDITOR DOCUMENTAL', 'MESTRE', 'ORIENTADOR']

export async function runDocumentPipeline(opts: {
  analysis: Result; sources: Source[]; deadline: number; cutoffDate?: string
  evidence: Awaited<ReturnType<typeof loadEvidence>>
  save: (data: Result) => Promise<unknown>; send: (event: Result) => void
}) {
  const { analysis, sources, evidence, save, send } = opts
  const manifest = JSON.stringify(sources.map(({ id, filename, sha256, pageCount }) => ({ id, filename, sha256, pageCount })))
  const results: Result = { ...analysis }
  const comparison = (agent: string) => JSON.stringify(comparisonResult(results[`${agent}Result`] ?? {}))
  for (const [index, agent] of stages.entries()) {
    if (analysis.runMode === 'SOMENTE_BASILE' && index > 0) break
    const field = `${agent}Result`
    const prior = results[field]
    send({ status: 'agent_start', agent, label: names[index] })
    await save({ currentAgent: agent })
    await evidenceReceipt(evidence, analysis.id, agent, analysis.id)
    const b = comparison('basile'), a = comparison('advocado'), c = comparison('cabeca'), d = comparison('auditor'), m = comparison('mestre')
    const prompts = [
      () => getBasilePrompt(analysis.missionLiteral, manifest, opts.cutoffDate),
      () => getAdvogadoPrompt(b, manifest),
      () => getCabecaPrompt(b, a, manifest),
      () => getAuditorPrompt(b, a, c),
      () => getMestrePrompt(analysis.missionLiteral, manifest, b, a, c, d, opts.cutoffDate),
      () => getOrientacoesPrompt(analysis.missionLiteral, manifest, b, a, c, d, m, opts.cutoffDate),
    ]
    const result = await reviewDocuments({ sources, agent: names[index], mission: analysis.missionLiteral,
      provider: analysis.provider, model: analysis.modelUsed, cutoffDate: opts.cutoffDate,
      prompt: withEvidence(prompts[index](), evidence), deadline: opts.deadline, resumable: true, resume: prior,
      onProgress: async checkpoint => {
        await save({ [field]: checkpoint })
        const pages = (checkpoint.cobertura_documental as { paginas: { processado: boolean }[] }).paginas
        send({ status: 'document_progress', agent, processed: pages.filter(p => p.processado).length, total: pages.length })
      },
    }) as Result
    results[field] = result
    if (evidence) result.fontes_juridicas = auditResearchCitations(result, evidence)
    await save({ [field]: result })
    if (result._documentReview?.pending) {
      await save({ status: 'EM_ANDAMENTO', errorDetail: null })
      send({ status: 'continuation', analysisId: analysis.id, agent })
      return
    }
    if (!result._documentReview?.complete) {
      const pages = result.cobertura_documental?.paginas ?? []
      const reason = pages.find((p: Result) => !p.processado)?.limitacao ?? result.cobertura_documental?.limitacoes?.at(-1)
      throw new Error(`Leitura de ${names[index]} incompleta. ${reason ?? 'Síntese pendente; retome a análise.'}`)
    }
    if (agent === 'auditor') {
      const score = result.icp_basile?.total
      await save({ icpScore: typeof score === 'number' && score >= 0 && score <= 100 ? score : null })
    }
    send({ status: 'agent_complete', agent, label: names[index] })
  }
  await save({ status: 'CONCLUIDO', completedAt: new Date(), exitCode: 0, currentAgent: null, errorDetail: null })
  send({ status: 'completed', analysisId: analysis.id })
}
