import { getBucket } from '@/lib/firebase/admin'

const PREVIEW_LEN = 2000
const MAX_INLINE_JSON = 700_000

export function extractedTextPath(documentId: string) {
  return `extracted/${documentId}.txt`
}

export function analysisFieldPath(analysisId: string, field: string) {
  return `analyses/${analysisId}/${field}.json`
}

export function previewText(text: string) {
  return text.slice(0, PREVIEW_LEN)
}

export async function saveExtractedText(documentId: string, text: string) {
  await getBucket().file(extractedTextPath(documentId)).save(text, {
    contentType: 'text/plain; charset=utf-8',
    resumable: false,
  })
}

export async function readExtractedText(documentId: string): Promise<string | null> {
  try {
    const [buf] = await getBucket().file(extractedTextPath(documentId)).download()
    return buf.toString('utf8')
  } catch (err: any) {
    if (err?.code === 404) return null
    throw err
  }
}

export async function deleteExtractedText(documentId: string) {
  try {
    await getBucket().file(extractedTextPath(documentId)).delete({ ignoreNotFound: true })
  } catch {
    /* ignore */
  }
}

export async function storeLargeJson(analysisId: string, field: string, value: unknown) {
  const json = JSON.stringify(value ?? null)
  if (!json || json.length < MAX_INLINE_JSON) {
    return { stored: value, pointer: null as string | null }
  }
  const path = analysisFieldPath(analysisId, field)
  await getBucket().file(path).save(json, {
    contentType: 'application/json',
    resumable: false,
  })
  return { stored: { _storagePath: path }, pointer: path }
}

export async function readLargeJson(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const path = (value as { _storagePath?: string })._storagePath
  if (!path) return value
  try {
    const [buf] = await getBucket().file(path).download()
    return JSON.parse(buf.toString('utf8'))
  } catch {
    return value
  }
}

export async function deleteAnalysisBlobs(analysisId: string) {
  try {
    const [files] = await getBucket().getFiles({ prefix: `analyses/${analysisId}/` })
    await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })))
  } catch {
    /* Storage pode ainda não estar habilitado */
  }
}
