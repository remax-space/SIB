import { presentResult } from '@/lib/public-result'
import { PublicResult as PublicResultView } from '@/components/public-result'

export function DocumentReview({ result }: { result: Record<string, unknown> }) {
  return <PublicResultView result={presentResult(result)} />
}
