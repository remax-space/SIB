import { parseCnj } from '../datajud'
import type { Plan, Research } from './contracts'

export type FullTextDefaults = Pick<Plan, 'processNumber' | 'tribunal' | 'page' | 'relator' | 'judgmentDate'>
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const identity = (value: string) => value.replace(/[^a-z0-9]/gi, '').toUpperCase()

/** Only reuse metadata belonging to this process; cited precedents may be unrelated. */
export function fullTextDefaults(caseData: Record<string, unknown>, documents: Record<string, unknown>[], history: Research[]): FullTextDefaults {
  const processNumber = text(caseData.caseId)
  const cnj = parseCnj(processNumber)
  // A prepared or failed request is not evidence that its tribunal/decision was correct.
  const saved = history.filter(r => (r.state === 'success' || r.state === 'partial') && r.plan.provider === 'legaw' && r.plan.tool === 'ler_inteiro_teor' && identity(r.plan.processNumber ?? '') === identity(processNumber))
    .sort((a, b) => b.createdAt - a.createdAt)[0]?.plan
  // Read explicit labels from document headers only, never arbitrary citations in the body.
  const headers = documents.map(d => text(d.extractedText).slice(0, 4000)).filter(header => {
    const numbers = header.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}|\b\d{20}\b/g) ?? []
    return numbers.length > 0 && numbers.every(number => identity(number) === identity(processNumber))
  })
  const unique = (pattern: RegExp) => {
    const values = [...new Set(headers.flatMap(header => [...header.matchAll(pattern)].map(match => match[1].trim()))) ]
    return values.length === 1 ? values[0] : undefined
  }
  const tribunal = unique(/^\s*Tribunal\s*:\s*([A-Z][A-Z0-9-]{1,14})\s*$/gim)?.toUpperCase()
  return {
    processNumber: processNumber.length >= 6 && processNumber.length <= 120 ? processNumber : undefined,
    tribunal: saved?.tribunal || tribunal || (cnj && ['1', '3', '4', '5', '7', '8'].includes(cnj.justice) ? cnj.alias.toUpperCase() : undefined),
    page: saved?.page ?? 1,
    relator: saved?.relator || unique(/^\s*Relator(?:a|\(a\))?\s*:\s*([^\r\n]{2,200})$/gim),
    judgmentDate: saved?.judgmentDate || unique(/^\s*Data (?:do |de )?julgamento\s*:\s*(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})\s*$/gim),
  }
}
