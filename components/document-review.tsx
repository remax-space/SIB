import { formatDocumentReview } from '@/lib/format-document-review'

export function DocumentReview({ result }: { result: Record<string, unknown> }) {
  const coverage = result.cobertura_documental as { status?: string; documentos?: { documentoId: string; nome: string; paginas: number | null }[] } | undefined
  if (!coverage) return <p className="text-xs text-muted-foreground">Resultado anterior sem registro verificável de cobertura documental.</p>
  return <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 space-y-3" aria-label="Fundamentos e cobertura documental">
    <p className="text-sm font-semibold">{coverage.status === 'PARCIAL' ? 'Revisão documental parcial' : coverage.status === 'EM_ANDAMENTO' ? 'Leitura documental em andamento' : 'Processamento documental concluído — leitura integral não comprovada'}</p>
    <p className="text-xs">O envio de páginas e as respostas do modelo não comprovam compreensão integral. Confira as evidências e as limitações abaixo.</p>
    <details><summary className="cursor-pointer text-sm">Fundamentos, evidências e páginas processadas</summary>
      <pre className="mt-3 whitespace-pre-wrap break-words text-xs font-sans">{formatDocumentReview(result)}</pre>
    </details>
  </section>
}
