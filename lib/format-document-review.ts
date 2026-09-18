function render(value: unknown, depth = 0): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map(item => render(item, depth)).filter(Boolean).join('\n\n')
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${'  '.repeat(depth)}${key.replace(/_/g, ' ')}: ${render(item, depth + 1)}`).join('\n')
  return String(value)
}

export function formatDocumentReview(data: Record<string, unknown>): string {
  const coverage = data.cobertura_documental as { status?: string; paginas?: { enviado: boolean; processado: boolean }[]; limitacoes?: string[] } | undefined
  const sections = []
  if (coverage) sections.push(`COBERTURA DOCUMENTAL — ${coverage.status ?? 'NÃO VERIFICADA'}\nRevisão integral não comprovada. Páginas enviadas: ${coverage.paginas?.filter(p => p.enviado).length ?? 0}; com resposta: ${coverage.paginas?.filter(p => p.processado).length ?? 0}; inventariadas: ${coverage.paginas?.length ?? 0}.\n${(coverage.limitacoes ?? []).join('\n')}\n${render(data.cobertura_documental)}`)
  for (const key of ['resposta', 'avaliacao_documental_propria', 'comparacao_agentes', 'evidencias', 'correcoes', 'limitacoes', 'avaliacoes_por_lote']) {
    if (data[key] != null) sections.push(`${key.replace(/_/g, ' ').toUpperCase()}\n${render(data[key])}`)
  }
  return sections.join('\n\n')
}
