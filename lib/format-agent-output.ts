import { presentResult, publicResultSchema, resultText } from './public-result'
export function normalizeAgentResult(data: unknown): unknown { return data }
export function formatAgentOutput(data: unknown, _agent?: string): string {
  void _agent
  if (data == null) return ''
  const parsed = publicResultSchema.safeParse(data)
  return resultText(parsed.success ? parsed.data : presentResult(data))
}
