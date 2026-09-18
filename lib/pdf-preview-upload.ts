import { mergePdfCaseMetadata, missingPdfCaseMetadataFields, type PdfCaseMetadata } from './pdf-case-metadata'
import { validatePdfSize } from './document-limits'

// Keep multipart requests below serverless request limits, including overhead.
export const PREVIEW_PART_BYTES = 3 * 1024 * 1024

export async function* pdfPreviewParts(file: File): AsyncGenerator<File> {
  validatePdfSize(file.size)
  if (file.size <= PREVIEW_PART_BYTES) { yield file; return }
  const { PDFDocument } = await import('pdf-lib')
  const original = await PDFDocument.load(await file.arrayBuffer())
  for (let start = 0; start < original.getPageCount();) {
    let count = Math.min(8, original.getPageCount() - start)
    while (true) {
      const part = await PDFDocument.create()
      for (const page of await part.copyPages(original, Array.from({ length: count }, (_, i) => start + i))) part.addPage(page)
      const bytes = await part.save()
      if (bytes.length <= PREVIEW_PART_BYTES) {
        yield new File([new Uint8Array(bytes)], file.name, { type: 'application/pdf' })
        start += count
        break
      }
      if (count === 1) throw new Error(`A página ${start + 1} excede o tamanho permitido para leitura automática. Comprima o PDF ou preencha os campos restantes.`)
      count = Math.max(1, Math.floor(count / 2))
    }
  }
}

export async function readPdfPreview(file: File, onProgress: (message: string) => void) {
  let metadata: PdfCaseMetadata = { caseId: '', clientName: '', legalClass: '' }
  let batch = 0
  try {
    for await (const part of pdfPreviewParts(file)) {
      onProgress(`Lendo o PDF — trecho ${++batch}…`)
      const form = new FormData()
      form.append('file', part)
      const response = await fetch('/api/documents/preview-metadata', { method: 'POST', body: form })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Não foi possível ler o PDF.')
      // The cover/main case takes precedence over cases attached later.
      metadata = mergePdfCaseMetadata(metadata, data)
      if (!missingPdfCaseMetadataFields(metadata).length) break
    }
    return { ...metadata, error: '' }
  } catch (error) {
    return { ...metadata, error: error instanceof Error ? error.message : 'Não foi possível ler o PDF.' }
  }
}
