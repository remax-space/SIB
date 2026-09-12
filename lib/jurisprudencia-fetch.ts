import { assertSafeHttpsUrl, fetchWithTimeout } from '@/lib/safe-url'

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
      .map(([key, value]) => `${key}: ${summarizePayload(value, depth + 1)}`)
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
  query: string
): Promise<string> {
  const url = assertSafeHttpsUrl(endpoint)
  const termo = query.trim()
  if (!termo) return ''

  const response = await fetchWithTimeout(
    url.toString(),
    {
      method: 'POST',
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
    },
    20_000
  )

  if (!response.ok) {
    throw new Error(`A base de jurisprudência recusou a consulta (HTTP ${response.status})`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const data = await response.json()
    return clip(summarizePayload(data))
  }

  return clip(await response.text())
}
