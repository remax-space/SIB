import { type PublicResult as Result } from '@/lib/public-result'
import { ExpandedView } from '@/components/expanded-view'

export function PublicResult({ result, title = 'Resultado da análise', expanded = false }: { result: Result; title?: string; expanded?: boolean }) {
  return <div className="space-y-5 break-words">
    {!expanded && <ExpandedView title={title}><PublicResult result={result} title={title} expanded /></ExpandedView>}
    {result.state !== 'ready' && <p className="text-sm font-medium">{result.state === 'partial' ? 'Resultado parcial' : 'Resultado indisponível para apresentação'}</p>}
    {result.sections.map((section, i) => <section key={i} className="space-y-2"><h3 className="text-sm font-semibold">{section.title}</h3><p className="whitespace-pre-wrap text-sm leading-7">{section.text}</p></section>)}
    {result.attention.length > 0 && <section aria-label="Pontos de atenção" className="border-l-4 border-warning pl-4 space-y-2"><h3 className="font-semibold text-sm">Atenção</h3>{result.attention.map((text, i) => <p key={i} className="text-sm leading-6">{text}</p>)}</section>}

    {result.sources.length > 0 && <details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium text-sm focus-visible:outline focus-visible:outline-2">Fontes e trechos ({result.sources.length})</summary><div className="mt-4 space-y-5">{result.sources.map((source, i) => <section key={i}><h4 className="font-medium text-sm">{source.href ? <a href={source.href} target="_blank" rel="noopener noreferrer" className="underline">{source.name} (abrir original)</a> : source.name}{source.page ? ` · página ${source.page}` : ''}</h4><blockquote className="border-l-2 pl-3 my-2 text-sm whitespace-pre-wrap leading-6">{source.quote}</blockquote><p className="text-xs text-muted-foreground">{source.verification}</p></section>)}</div></details>}
  </div>
}
