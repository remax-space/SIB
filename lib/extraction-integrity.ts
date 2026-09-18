export type ExtractionInfo = { pageCount: number | null; textPages: number[]; emptyPages: number[]; status: 'PARTIAL' | 'NO_TEXT'; method: 'TEXT_LAYER' | 'OCR' | 'UNKNOWN' }
/** A complete stored string is not proof that all visual content was extracted. */
export function textAvailability(data: Record<string, unknown>, full: string | null | undefined, readFailed = false) {
  const preview = typeof data.extractedTextPreview === 'string' ? data.extractedTextPreview : ''
  return {
    extractedText: full ?? preview,
    textSource: readFailed ? 'STORAGE_ERROR' : full != null ? (Number(data.textLength ?? full.length) > full.length ? 'PARTIAL_TEXT' : 'FULL_TEXT') : preview ? 'PREVIEW' : 'NO_TEXT',
    extractionStatus: data.extractionStatus ?? 'UNKNOWN',
    storageStatus: data.storageStatus ?? 'UNKNOWN',
  }
}

export function shouldPreserveExtraction(previous: string | null, candidate: string, previousInfo?: ExtractionInfo, nextInfo?: ExtractionInfo) {
  if (!previous?.trim()) return false
  // Conservative: an automatic retry cannot discard an existing larger extraction or covered pages.
  return candidate.trim().length < previous.trim().length || !!previousInfo?.textPages.some(p => !nextInfo?.textPages.includes(p))
}
