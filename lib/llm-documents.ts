/** Transport contracts: physical PDF page numbers, never printed/estimated pagination. */
export type LlmDocument = {
  documentId: string
  filename: string
  sha256: string
  pages: number[]
  base64: string
}

export function supportsPdf(provider: string, model: string): boolean {
  if (provider === 'openai') return /^(gpt-4o|gpt-4\.1|gpt-5|gpt-6|o3|o4)(-|$)/.test(model)
  if (provider === 'anthropic') return /^claude-(sonnet-4|opus-4|haiku-4|3-5-sonnet|3-7-sonnet)/.test(model)
  return /^gemini-(2\.|3\.)/.test(model)
}

export function documentParts(provider: string, documents: LlmDocument[]) {
  return documents.flatMap((d) => {
    const label = JSON.stringify({ documentId: d.documentId, filename: d.filename, sha256: d.sha256, originalPages: d.pages })
    if (provider === 'openai') return [
      { type: 'input_text', text: label },
      { type: 'input_file', filename: d.filename, file_data: `data:application/pdf;base64,${d.base64}` },
    ] as Record<string, unknown>[]
    if (provider === 'anthropic') return [
      { type: 'text', text: label },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: d.base64 } },
    ] as Record<string, unknown>[]
    return [{ text: label }, { inline_data: { mime_type: 'application/pdf', data: d.base64 } }] as Record<string, unknown>[]
  })
}
