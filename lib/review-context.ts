import { presentResult, resultText } from './public-result'
/** Keep conclusions intact, but do not duplicate the page-by-page working log in every comparison. */
export function comparisonResult(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const { avaliacoes_por_lote, cobertura_documental, ...conclusions } = value as Record<string, unknown>
  const coverage = cobertura_documental as Record<string, unknown> | undefined
  return { ...conclusions, ...(coverage ? { cobertura_documental: { status: coverage.status, revisao_completa: false, limitacoes: coverage.limitacoes, documentos: coverage.documentos }, registro_por_lote: avaliacoes_por_lote ? 'Disponível no resultado persistido; os originais serão consultados diretamente nesta revisão.' : undefined } : {}) }
}

export function conversationReviewContent(result: Record<string, unknown>) {
  return resultText(presentResult(result))
}
