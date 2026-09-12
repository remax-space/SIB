import { fetchDatajudProcess } from '@/lib/datajud'
import { extractPdfCaseMetadata, inferCaseMetadataFromText } from '@/lib/llm'
import {
  mergePdfCaseMetadata,
  missingPdfCaseMetadataFields,
  parsePdfCaseMetadata,
  type PdfCaseMetadata,
} from '@/lib/pdf-case-metadata'

const MAX_PAGES = 4
const MIN_TEXT_CHARS = 80

function extractRawPdfStrings(buffer: Buffer): string {
  const sample = buffer.subarray(0, Math.min(buffer.length, 2_500_000)).toString('latin1')
  const chunks: string[] = []

  for (const match of sample.matchAll(/\((?:\\.|[^\\)]){4,180}\)/g)) {
    const inner = (match[0] ?? '')
      .slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\n')
      .replace(/\\t/g, ' ')
      .replace(/\\([()\\])/g, '$1')
    if (/[A-Za-zÀ-ÿ0-9]/.test(inner)) chunks.push(inner)
  }

  return chunks.join('\n')
}

async function extractLocalPdfText(buffer: Buffer): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await extractText(pdf, { mergePages: false })
    const pages = Array.isArray(text) ? text : [text]
    const sliced = pages.slice(0, MAX_PAGES).join('\n')
    if (sliced.replace(/\s+/g, '').length >= 20) return sliced
  } catch (error) {
    console.warn('unpdf extract failed:', error)
  }
  return extractRawPdfStrings(buffer)
}

function metadataFromLlm(data: {
  numeroProcesso?: string
  nomeCliente?: string
  classeProcessual?: string
}): Partial<PdfCaseMetadata> {
  return {
    caseId: data.numeroProcesso ?? '',
    clientName: data.nomeCliente ?? '',
    legalClass: data.classeProcessual ?? '',
  }
}

async function enrichFromDatajud(caseId: string): Promise<Partial<PdfCaseMetadata>> {
  try {
    const process = await fetchDatajudProcess(caseId)
    if (!process) return {}
    const classe = process.classe as { nome?: string } | undefined
    const poloAtivo = Array.isArray(process.poloAtivo) ? process.poloAtivo : []
    const firstParty = poloAtivo
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>
          return String(record.nome ?? record.nomeParte ?? record.pessoa ?? '')
        }
        return ''
      })
      .find((name) => name.trim())
    return {
      legalClass: classe?.nome ?? '',
      clientName: firstParty ?? '',
    }
  } catch (error) {
    console.warn('DataJud metadata enrich failed:', error)
    return {}
  }
}

export async function previewPdfCaseMetadata(opts: {
  buffer: Buffer
  fileName: string
}): Promise<{ metadata: PdfCaseMetadata; missing: Array<keyof PdfCaseMetadata>; source: string }> {
  const localText = await extractLocalPdfText(opts.buffer)
  let metadata = parsePdfCaseMetadata(localText, opts.fileName)
  let source = localText.replace(/\s+/g, '').length >= 20 ? 'pdf' : 'filename'

  if (missingPdfCaseMetadataFields(metadata).length > 0 && localText.trim().length >= MIN_TEXT_CHARS) {
    try {
      metadata = mergePdfCaseMetadata(metadata, metadataFromLlm(await inferCaseMetadataFromText(localText)))
      source = 'pdf+ia'
    } catch (error) {
      console.warn('LLM text metadata failed:', error)
    }
  }

  if (missingPdfCaseMetadataFields(metadata).length > 0 && localText.trim().length < MIN_TEXT_CHARS) {
    try {
      metadata = mergePdfCaseMetadata(
        metadata,
        metadataFromLlm(
          await extractPdfCaseMetadata({
            base64: opts.buffer.toString('base64'),
            filename: opts.fileName,
          })
        )
      )
      source = 'ia'
    } catch (error) {
      console.warn('LLM pdf metadata failed:', error)
    }
  }

  if (metadata.caseId) {
    metadata = mergePdfCaseMetadata(metadata, await enrichFromDatajud(metadata.caseId))
  }

  return {
    metadata,
    missing: missingPdfCaseMetadataFields(metadata),
    source,
  }
}
