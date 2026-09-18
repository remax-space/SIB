export type CitationAudit = {
  evidenceId: string
  citedSourceIds: string[]
  invalidSourceIds: string[]
  warnings: string[]
}

export function ResearchCitationAudit({ audit }: { audit?: CitationAudit }) {
  if (!audit) return null
  return <section aria-label="Conferência das fontes jurídicas" className="mt-3 rounded border border-warning/40 bg-warning/5 p-3 space-y-2">
    <p className="text-sm font-medium">Conferência das fontes jurídicas</p>
    <p className="text-xs break-words">Referências localizadas no pacote: {audit.citedSourceIds.length ? audit.citedSourceIds.join(', ') : 'nenhuma'}.</p>
    {audit.invalidSourceIds.length > 0 && <p role="alert" className="text-sm break-words">Referências fora do pacote: {audit.invalidSourceIds.join(', ')}. Não utilize essas citações sem conferir a origem.</p>}
    {audit.warnings.map((warning, index) => <p key={index} className="text-xs">{warning}</p>)}
  </section>
}

export function citationAuditText(audit?: CitationAudit): string {
  if (!audit) return ''
  return `\n\nCONFERÊNCIA DAS FONTES JURÍDICAS\nPacote: ${audit.evidenceId}\nReferências localizadas: ${audit.citedSourceIds.join(', ') || 'nenhuma'}\nReferências fora do pacote: ${audit.invalidSourceIds.join(', ') || 'nenhuma'}\n${audit.warnings.join('\n')}`
}
