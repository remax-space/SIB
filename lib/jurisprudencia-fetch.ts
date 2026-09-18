import { assertSafeHttpsUrl } from '@/lib/safe-url'
import { ResearchError } from '@/lib/research/adapter'

const MAX_RESULT_CHARS = 24_000

function authorizationHeader(provider: string, apiKey: string): string {
  if (provider === 'datajud') return `APIKey ${apiKey}`
  if (provider === 'digesto') return `Token ${apiKey}`
  return `Bearer ${apiKey}`
}

function summarizePayload(data: unknown, depth = 0): string {
  if (data == null) return ''
  if (typeof data === 'string') return data
  if (typeof data === 'number' || typeof data === 'boolean') return String(data)
  if (Array.isArray(data)) {
    return data
      .slice(0, 20)
      .map((item) => summarizePayload(item, depth + 1))
      .filter(Boolean)
      .join('\n\n')
  }
  if (typeof data === 'object') {
    const record = data as Record<string, unknown>
    const preferred = [
      record.ementa,
      record.resumo,
      record.texto,
      record.textoIntegral,
      record.decisao,
      record.identificacao,
      record.titulo,
      record.tribunal,
      record.numeroProcesso,
    ]
      .filter((value) => typeof value === 'string' && value.trim())
      .join(' | ')
    if (preferred && depth < 3) return preferred
    if (depth >= 3) return preferred
    return Object.entries(record)
      .slice(0, 12)
      .map(([key, value]) => { const text = summarizePayload(value, depth + 1); return text ? `${key}: ${text}` : '' })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

function clip(text: string): string {
  const clean = text.replace(/\s+\n/g, '\n').trim()
  if (clean.length <= MAX_RESULT_CHARS) return clean
  return `${clean.slice(0, MAX_RESULT_CHARS)}\n\n[resultado truncado]`
}

export async function fetchJurisprudencia(
  provider: string,
  apiKey: string,
  endpoint: string,
  query: string,
  signal: AbortSignal
): Promise<{ text: string; raw: unknown; partial: boolean }> {
  const url = assertSafeHttpsUrl(endpoint)
  if (url.hostname === 'legaw.ai' || url.hostname.endsWith('.legaw.ai') || provider === 'legaw') throw new Error('Legaw exige o adaptador central próprio')
  const termo = query.trim()
  if (!termo) return { text: '', raw: null, partial: false }

  const response = await fetch(
    url.toString(),
    {
      method: 'POST',
      signal,
      redirect: 'error',
      headers: {
        Authorization: authorizationHeader(provider, apiKey),
        Accept: 'application/json, text/plain',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: termo,
        q: termo,
        termo,
        size: 10,
      }),
    }
  )

  if (!response.ok) {
    await response.body?.cancel()
    throw new ResearchError(`PROVIDER_HTTP_${response.status}`, response.status === 429 ? 429 : 502)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new ResearchError('EMPTY_RESPONSE_BODY', 502, true)
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    size += chunk.value.byteLength
    if (size > 10 * 1024 * 1024) { await reader.cancel(); throw new ResearchError('RESULT_TOO_LARGE', 502, true) }
    chunks.push(chunk.value)
  }
  const body = Buffer.concat(chunks).toString('utf8')
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const data: unknown = JSON.parse(body)
    const text = clip(summarizePayload(data))
    return { text, raw: data, partial: text.includes('[resultado truncado]') || Array.isArray(data) && data.length > 20 }
  }
  const text = clip(body)
  return { text, raw: body, partial: body.length > MAX_RESULT_CHARS }
}
