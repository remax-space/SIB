import { fetchDatajudProcess } from '@/lib/datajud'
import { extractPdfCaseMetadata, inferCaseMetadataFromText } from '@/lib/llm'
import {
  mergePdfCaseMetadata,
  missingPdfCaseMetadataFields,
  parsePdfCaseMetadata,
  type PdfCaseMetadata,
} from '@/lib/pdf-case-metadata'

const MIN_TEXT_CHARS = 80

async function extractLocalPdfText(buffer: Buffer): Promise<string> {
  try {
    const { extractText } = await import('unpdf')
    const { text } = await extractText(new Uint8Array(buffer), { mergePages: false })
    const pages = Array.isArray(text) ? text : [text]
    return pages.map((page, index) => `[Página ${index + 1}]\n${page}`).join('\n\n')
  } catch (error) {
    console.warn('unpdf extract failed:', error)
  }
  return ''
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

  // Read the original even when a text layer exists: mixed/scanned pages and
  // column order can make apparently complete local matches incorrect.
  try {
    const visual = metadataFromLlm(await extractPdfCaseMetadata({
      base64: opts.buffer.toString('base64'), filename: opts.fileName,
    }))
    metadata = mergePdfCaseMetadata(visual, metadata)
    source = 'pdf+ia'
  } catch (error) {
    console.warn('LLM pdf metadata failed:', error)
  }

  if (missingPdfCaseMetadataFields(metadata).length > 0 && localText.trim().length >= MIN_TEXT_CHARS) {
    try {
      metadata = mergePdfCaseMetadata(metadata, metadataFromLlm(await inferCaseMetadataFromText(localText)))
      source = 'pdf+ia'
    } catch (error) {
      console.warn('LLM text metadata failed:', error)
    }
  }

  if (metadata.caseId && missingPdfCaseMetadataFields(metadata).length > 0) {
    metadata = mergePdfCaseMetadata(metadata, await enrichFromDatajud(metadata.caseId))
  }

  return {
    metadata,
    missing: missingPdfCaseMetadataFields(metadata),
    source,
  }
}
