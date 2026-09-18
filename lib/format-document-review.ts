import { presentResult, publicResultSchema, resultText } from './public-result'
export function formatDocumentReview(data: unknown): string {
  const parsed = publicResultSchema.safeParse(data)
  return resultText(parsed.success ? parsed.data : presentResult(data))
}
