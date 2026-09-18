import Link from 'next/link'
import { PublicResult } from '@/components/public-result'
import { publicResultSchema, presentResult } from '@/lib/public-result'

export function JurisprudenciaResult({ result, caseHref }: { result: unknown; caseHref?: string }) {
  if (!result) return null
  const parsed = publicResultSchema.safeParse(result)
  return <div className="space-y-4"><PublicResult result={parsed.success ? parsed.data : presentResult(result)} />{caseHref && <Link href={caseHref} className="text-sm text-primary underline">Ver análise completa</Link>}</div>
}
