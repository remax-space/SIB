import { createHash } from 'node:crypto'
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib'
import { extractText } from 'unpdf'
import type { LlmDocument } from './llm-documents'
import { MAX_PDF_BYTES, validatePdfSize } from './document-limits'

export class DocumentSelectionError extends Error {}
export function validateDocumentSelection(caseId: string, ids: unknown, docs: Record<string, unknown>[]) {
  if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || !id || id.includes('/')) || new Set(ids).size !== ids.length) {
    throw new DocumentSelectionError('Seleção documental inválida ou duplicada.')
  }
  if (docs.length !== ids.length || ids.some(id => !docs.some(d => d.id === id && d.caseId === caseId))) {
    throw new DocumentSelectionError('Documento inexistente ou pertencente a outro caso.')
  }
}

export type Source = {
  id: string; filename: string; sha256: string; pageCount: number | null
  pages: string[]; visualPages?: number[]; pdf?: PDFDocument; limitation?: string
}
// Per-request cache: both reviewers reuse the same downloaded bytes/page tree.
export async function prepareSources(docs: Record<string, unknown>[], read: (key: string, mime: string, publicFile: boolean) => Promise<Buffer>): Promise<Source[]> {
  const sources: Source[] = []
  let totalBytes = 0
  for (const doc of docs) {
    const source: Source = { id: String(doc.id), filename: String(doc.filename), sha256: '', pageCount: null, pages: [] }
    sources.push(source)
    try {
      if (Number(doc.fileSize ?? 0) > MAX_PDF_BYTES) validatePdfSize(Number(doc.fileSize))
      if (Number(doc.fileSize ?? 0) + totalBytes > 512 * 1024 * 1024) throw new Error('Selecione até 512 MB de documentos por análise (200 MB por PDF).')
      const bytes = await read(String(doc.cloudStoragePath), String(doc.mimeType), Boolean(doc.isPublic))
      totalBytes += bytes.length
      validatePdfSize(bytes.length)
      if (totalBytes > 512 * 1024 * 1024) throw new Error('Selecione até 512 MB de documentos por análise (200 MB por PDF).')
      source.sha256 = createHash('sha256').update(bytes).digest('hex')
      if (doc.sha256 && doc.sha256 !== source.sha256) throw new Error('Hash do original diverge do documento cadastrado')
      source.pdf = await PDFDocument.load(bytes)
      source.pageCount = source.pdf.getPageCount()
      source.visualPages = source.pdf.getPages().flatMap((page, index) => {
        const resources = page.node.Resources()
        const objects = resources?.lookup(PDFName.of('XObject'))
        return objects instanceof PDFDict && objects.keys().length > 0 ? [index + 1] : []
      })
      try { source.pages = (await extractText(new Uint8Array(bytes), { mergePages: false })).text }
      catch { source.limitation = 'Camada textual indisponível; conferir visualmente o PDF.' }
    } catch (error) {
      source.pdf = undefined
      source.limitation = `Original indisponível: ${error instanceof Error ? error.message : 'erro de leitura'}`
    }
  }
  return sources
}

export async function sourceAttachment(source: Source, pages: number[]): Promise<LlmDocument> {
  if (!source.pdf || pages.some(p => !Number.isInteger(p) || p < 1 || p > source.pdf!.getPageCount())) throw new Error('Página original indisponível')
  const pdf = await PDFDocument.create()
  for (const page of await pdf.copyPages(source.pdf, pages.map(p => p - 1))) pdf.addPage(page)
  return { documentId: source.id, filename: source.filename, sha256: source.sha256, pages, base64: Buffer.from(await pdf.save()).toString('base64') }
}
