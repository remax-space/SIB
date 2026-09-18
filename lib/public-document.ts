/**
 * Fields that the browser needs for document lists and source links.
 * Storage paths, hashes and extraction internals stay on the server.
 */
export type PublicDocument = {
  id: string
  filename: string
  caseId?: string
  fileSize?: number
  mimeType?: string
  pageCount: number | null
  readStatus: string
  textSource: string
  extractedText?: string
}

export function publicDocument(document: Record<string, unknown> | null | undefined): PublicDocument | null {
  if (!document) return null
  const value = (key: string) => document[key]
  const caseId = value('caseId')
  const fileSize = value('fileSize')
  const mimeType = value('mimeType')
  const pageCount = value('pageCount')
  const readStatus = value('readStatus')
  const textSource = value('textSource')
  const extractedText = value('extractedText')
  return {
    id: String(value('id') ?? ''),
    filename: String(value('filename') ?? 'Documento sem nome'),
    ...(typeof caseId === 'string' ? { caseId } : {}),
    ...(typeof fileSize === 'number' ? { fileSize } : {}),
    ...(typeof mimeType === 'string' ? { mimeType } : {}),
    pageCount: typeof pageCount === 'number' ? pageCount : null,
    readStatus: typeof readStatus === 'string' ? readStatus : 'PENDENTE',
    textSource: typeof textSource === 'string' ? textSource : 'NO_TEXT',
    ...(typeof extractedText === 'string' && extractedText.trim()
      ? { extractedText }
      : {}),
  }
}
