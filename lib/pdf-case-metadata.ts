import { LEGAL_CLASSES } from '@/lib/constants'
import { parseCnj } from '@/lib/datajud'

export type PdfCaseMetadata = {
  caseId: string
  clientName: string
  legalClass: string
}

export type PdfCaseMetadataField = keyof PdfCaseMetadata

const CNJ_PRETTY_RE = /(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/g
const CNJ_LOOSE_RE = /(\d{7})\s*[-.]?\s*(\d{2})\s*[.]?\s*(\d{4})\s*[.]?\s*(\d)\s*[.]?\s*(\d{2})\s*[.]?\s*(\d{4})/g

const CLASS_ALIASES: Record<string, string[]> = {
  ACAO_INOMINADA: ['acao inominada', 'ação inominada'],
  MANDADO_SEGURANCA: ['mandado de seguranca', 'mandado de segurança', 'ms coletivo', 'ms individual'],
  HABEAS_CORPUS: ['habeas corpus'],
  HABEAS_DATA: ['habeas data'],
  MANDADO_INJUNCAO: ['mandado de injuncao', 'mandado de injunção'],
  ACAO_POPULAR: ['acao popular', 'ação popular'],
  ACAO_CIVIL_PUBLICA: ['acao civil publica', 'ação civil pública'],
  RECLAMACAO_CONSTITUCIONAL: ['reclamacao constitucional', 'reclamação constitucional'],
  ADI: ['acao direta de inconstitucionalidade', 'ação direta de inconstitucionalidade'],
  ADC: ['acao declaratoria de constitucionalidade', 'ação declaratória de constitucionalidade'],
  ADPF: ['arguicao de descumprimento', 'arguição de descumprimento'],
  ADO: ['inconstitucionalidade por omissao', 'inconstitucionalidade por omissão'],
  APELACAO: ['apelacao', 'apelação'],
  RESP: ['recurso especial'],
  ARESP: ['agravo em recurso especial'],
  RE: ['recurso extraordinario', 'recurso extraordinário'],
  ARE: ['agravo em recurso extraordinario', 'agravo em recurso extraordinário'],
  AGRAVO_PETICAO: ['agravo em peticao', 'agravo em petição'],
  RECURSO_REVISTA: ['recurso de revista'],
  RESE: ['recurso em sentido estrito'],
  AGRAVO_EXECUCAO_PENAL: ['agravo em execucao penal', 'agravo em execução penal'],
  EXECUCAO: ['execucao de titulo', 'execução de título'],
  EXECUCAO_FISCAL: ['execucao fiscal', 'execução fiscal'],
  CUMPRIMENTO_SENTENCA: ['cumprimento de sentenca', 'cumprimento de sentença'],
  ACAO_CONHECIMENTO: [
    'acao de conhecimento',
    'ação de conhecimento',
    'procedimento comum',
    'procedimento ordinario',
    'procedimento ordinário',
    'acao ordinaria',
    'ação ordinária',
  ],
}

const CLIENT_LABELS = [
  'polo ativo',
  'nome do cliente',
  'cliente',
  'autor',
  'autora',
  'requerente',
  'recorrente',
  'apelante',
  'agravante',
  'impetrante',
  'exequente',
  'reclamante',
  'promovente',
  'embargante',
  'querelante',
  'paciente',
  'inventariante',
  'parte autora',
  'demandante',
]

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanName(value: string): string {
  const cleaned = value
    .replace(/\s+/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/\b(cpf|cnpj|rg|oab)[:\s].*$/i, '')
    .replace(/\d{2,}/g, ' ')
    .replace(/[^\p{L}\s'.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (cleaned.length < 5 || cleaned.length > 120) return ''
  const words = cleaned.split(' ').filter(Boolean)
  if (words.length < 2 || words.length > 12) return ''
  if (words.every((word) => word.length <= 1)) return ''
  return cleaned
}

export function formatCnj(input: string): string {
  const parsed = parseCnj(input)
  if (parsed) return parsed.raw
  const digits = input.replace(/\D/g, '')
  if (digits.length !== 20) return ''
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16)}`
}

export function extractCnjFromText(text: string): string {
  const prettyMatches = [...text.matchAll(CNJ_PRETTY_RE)].map((match) => formatCnj(match[1] ?? ''))
  const found = prettyMatches.find(Boolean)
  if (found) return found

  for (const match of text.matchAll(CNJ_LOOSE_RE)) {
    const formatted = formatCnj(match[0] ?? '')
    if (formatted) return formatted
  }
  return ''
}

export function extractLegalClassFromText(text: string): string {
  const folded = fold(text)
  const labeled = folded.match(
    /classe(?:\s+processual)?(?:\s+da\s+acao)?\s*[:\-–—]?\s*([a-z0-9çãõáéíóúâêô ]{4,80})/
  )
  if (labeled?.[1]) {
    const fromLabel = matchLegalClass(labeled[1])
    if (fromLabel) return fromLabel
  }

  const window = folded.slice(0, 12_000)
  let best: { value: string; index: number } | null = null
  for (const item of LEGAL_CLASSES) {
    const aliases = [fold(item.label), ...(CLASS_ALIASES[item.value] ?? [])]
    for (const alias of aliases) {
      const index = window.indexOf(alias)
      if (index < 0) continue
      if (!best || index < best.index) best = { value: item.value, index }
    }
  }
  return best?.value ?? ''
}

export function matchLegalClass(text: string): string {
  const folded = fold(text)
  if (!folded) return ''

  for (const item of LEGAL_CLASSES) {
    if (fold(item.label) === folded || fold(item.value) === folded) return item.value
  }

  let best: { value: string; length: number } | null = null
  for (const item of LEGAL_CLASSES) {
    const aliases = [fold(item.label), ...(CLASS_ALIASES[item.value] ?? [])]
    for (const alias of aliases) {
      if (!alias || alias.length < 4) continue
      if (folded.includes(alias) || alias.includes(folded)) {
        if (!best || alias.length > best.length) best = { value: item.value, length: alias.length }
      }
    }
  }
  return best?.value ?? ''
}

export function extractClientNameFromText(text: string): string {
  const normalized = text.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ')
  const labelGroup = CLIENT_LABELS.join('|')
  const labeled = new RegExp(
    `(?:^|[\\n:;])\\s*(?:${labelGroup})\\s*[:\\-–—]?\\s*([^\\n]{5,140})`,
    'i'
  )
  const labeledMatch = normalized.match(labeled)
  if (labeledMatch?.[1]) {
    const name = cleanName(labeledMatch[1])
    if (name) return name
  }

  const block = new RegExp(
    `(?:${labelGroup})\\s*\\n\\s*([^\\n]{5,140})`,
    'i'
  )
  const blockMatch = normalized.match(block)
  if (blockMatch?.[1]) {
    const name = cleanName(blockMatch[1])
    if (name) return name
  }

  return ''
}

export function parsePdfCaseMetadata(text: string, fileName = ''): PdfCaseMetadata {
  const haystack = `${fileName}\n${text}`
  return {
    caseId: extractCnjFromText(haystack),
    clientName: extractClientNameFromText(text),
    legalClass: extractLegalClassFromText(haystack),
  }
}

export function mergePdfCaseMetadata(
  ...sources: Array<Partial<PdfCaseMetadata> | null | undefined>
): PdfCaseMetadata {
  const merged: PdfCaseMetadata = { caseId: '', clientName: '', legalClass: '' }
  for (const source of sources) {
    if (!source) continue
    if (!merged.caseId && source.caseId) merged.caseId = formatCnj(source.caseId) || source.caseId.trim()
    if (!merged.clientName && source.clientName) merged.clientName = source.clientName.trim()
    if (!merged.legalClass && source.legalClass) {
      merged.legalClass = matchLegalClass(source.legalClass)
    }
  }
  return merged
}

export function missingPdfCaseMetadataFields(meta: PdfCaseMetadata): PdfCaseMetadataField[] {
  const missing: PdfCaseMetadataField[] = []
  if (!meta.caseId.trim()) missing.push('caseId')
  if (!meta.clientName.trim()) missing.push('clientName')
  if (!meta.legalClass.trim()) missing.push('legalClass')
  return missing
}
