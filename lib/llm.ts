export const LLM_PROVIDERS = ['openai', 'anthropic', 'gemini'] as const
export type LlmProvider = (typeof LLM_PROVIDERS)[number]

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
  gemini: 'gemini-2.0-flash',
}

const ENV_KEY_NAMES: Record<LlmProvider, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
}

export function normalizeProvider(provider?: string | null): LlmProvider {
  if (provider === 'anthropic' || provider === 'claude') return 'anthropic'
  if (provider === 'gemini' || provider === 'google') return 'gemini'
  if (provider === 'openai') return 'openai'
  const fallback = process.env.DEFAULT_LLM_PROVIDER
  if (fallback === 'anthropic' || fallback === 'gemini' || fallback === 'openai') return fallback
  return 'openai'
}

export function getProviderApiKey(provider?: string | null): string {
  const id = normalizeProvider(provider)
  if (id === 'openai') return (process.env.OPENAI_API_KEY ?? '').trim()
  if (id === 'anthropic') {
    return (process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_API_KEY ?? '').trim()
  }
  return (
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_API_KEY ??
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    ''
  ).trim()
}

export function getProviderModel(provider?: string | null, override?: string | null): string {
  if (override?.trim()) return override.trim()
  const id = normalizeProvider(provider)
  if (id === 'openai') return (process.env.OPENAI_MODEL ?? DEFAULT_MODELS.openai).trim()
  if (id === 'anthropic') {
    return (process.env.ANTHROPIC_MODEL ?? process.env.CLAUDE_MODEL ?? DEFAULT_MODELS.anthropic).trim()
  }
  return (process.env.GEMINI_MODEL ?? DEFAULT_MODELS.gemini).trim()
}

export function getProviderEnvVar(provider?: string | null): string {
  return ENV_KEY_NAMES[normalizeProvider(provider)]
}

export function listEnvProviders() {
  return LLM_PROVIDERS.map((provider) => {
    const hasKey = Boolean(getProviderApiKey(provider))
    return {
      provider,
      model: getProviderModel(provider),
      enabled: hasKey,
      hasKey,
      envVar: getProviderEnvVar(provider),
    }
  })
}

export function firstConfiguredProvider(preferred?: string | null): LlmProvider {
  const wanted = preferred ? normalizeProvider(preferred) : normalizeProvider(process.env.DEFAULT_LLM_PROVIDER)
  if (getProviderApiKey(wanted)) return wanted
  const ready = LLM_PROVIDERS.find((id) => getProviderApiKey(id))
  if (!ready) {
    throw new Error(
      'Nenhuma chave de IA no .env. Preencha OPENAI_API_KEY, ANTHROPIC_API_KEY ou GEMINI_API_KEY.'
    )
  }
  return ready
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 120_000): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function unwrapJsonish(text: string): string {
  let clean = text?.trim() ?? ''
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }
  return clean || '{}'
}

async function callOpenAI(opts: {
  apiKey: string
  model: string
  system: string
  user: string
  json?: boolean
  maxTokens: number
}): Promise<string> {
  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
      max_tokens: opts.maxTokens,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  })
  const raw = await response.text()
  if (!response.ok) throw new Error(`OpenAI (${response.status}): ${raw.slice(0, 300)}`)
  const data = JSON.parse(raw)
  return data?.choices?.[0]?.message?.content ?? '{}'
}

async function callAnthropic(opts: {
  apiKey: string
  model: string
  system: string
  user: string
  json?: boolean
  maxTokens: number
}): Promise<string> {
  const system = opts.json
    ? `${opts.system}\n\nResponda APENAS com JSON válido, sem markdown.`
    : opts.system
  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      system,
      messages: [{ role: 'user', content: opts.user }],
    }),
  })
  const raw = await response.text()
  if (!response.ok) throw new Error(`Claude (${response.status}): ${raw.slice(0, 300)}`)
  const data = JSON.parse(raw)
  const text = (data?.content ?? []).map((part: any) => part?.text ?? '').join('\n')
  return text || '{}'
}

async function callGemini(opts: {
  apiKey: string
  model: string
  system: string
  user: string
  json?: boolean
  maxTokens: number
}): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: 'user', parts: [{ text: opts.user }] }],
      generationConfig: {
        maxOutputTokens: opts.maxTokens,
        ...(opts.json ? { responseMimeType: 'application/json' } : {}),
      },
    }),
  })
  const raw = await response.text()
  if (!response.ok) throw new Error(`Gemini (${response.status}): ${raw.slice(0, 300)}`)
  const data = JSON.parse(raw)
  const text = (data?.candidates?.[0]?.content?.parts ?? []).map((part: any) => part?.text ?? '').join('\n')
  return text || '{}'
}

export async function callLLM(opts: {
  provider?: string | null
  system: string
  user: string
  model?: string | null
  json?: boolean
  maxTokens?: number
  label?: string
}): Promise<string> {
  const provider = firstConfiguredProvider(opts.provider)
  const apiKey = getProviderApiKey(provider)
  const model = getProviderModel(provider, opts.model)
  const maxTokens = opts.maxTokens ?? 8000
  const label = opts.label ?? 'Agente'

  try {
    let text = ''
    if (provider === 'openai') {
      text = await callOpenAI({ apiKey, model, system: opts.system, user: opts.user, json: opts.json, maxTokens })
    } else if (provider === 'anthropic') {
      text = await callAnthropic({ apiKey, model, system: opts.system, user: opts.user, json: opts.json, maxTokens })
    } else {
      text = await callGemini({ apiKey, model, system: opts.system, user: opts.user, json: opts.json, maxTokens })
    }
    return opts.json ? unwrapJsonish(text) : text
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`${label}: tempo limite excedido (120s) ao consultar a IA.`)
    }
    const message = String(error?.message ?? error)
    throw new Error(`${label}: ${message}`)
  }
}

const EXTRACT_PROMPT =
  'Extraia TODO o texto deste documento PDF. Retorne apenas o texto extraído, sem comentários adicionais. Mantenha a estrutura e formatação do documento original o máximo possível. Se houver tabelas, preserve-as em formato legível.'

const CASE_METADATA_PROMPT = `Leia este documento jurídico brasileiro e extraia SOMENTE os campos abaixo.
Se um campo não estiver no documento, devolva string vazia. Não invente dados.
Responda apenas com JSON:
{
  "numeroProcesso": "número CNJ no formato NNNNNNN-DD.AAAA.J.TT.OOOO",
  "nomeCliente": "nome da parte autora/recorrente/impetrante/exequente/polo ativo",
  "classeProcessual": "classe processual (ex: Apelação, Mandado de Segurança, Execução Fiscal)"
}`

async function extractWithGemini(
  apiKey: string,
  model: string,
  base64: string,
  prompt = EXTRACT_PROMPT,
  maxTokens = 16000,
  json = false,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { inline_data: { mime_type: 'application/pdf', data: base64 } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: maxTokens,
        ...(json ? { responseMimeType: 'application/json' } : {}),
      },
    }),
  })
  const raw = await response.text()
  if (!response.ok) throw new Error(`Gemini extract (${response.status}): ${raw.slice(0, 300)}`)
  const data = JSON.parse(raw)
  return (data?.candidates?.[0]?.content?.parts ?? []).map((part: any) => part?.text ?? '').join('\n')
}

async function extractWithAnthropic(
  apiKey: string,
  model: string,
  base64: string,
  prompt = EXTRACT_PROMPT,
  maxTokens = 16000,
): Promise<string> {
  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  })
  const raw = await response.text()
  if (!response.ok) throw new Error(`Claude extract (${response.status}): ${raw.slice(0, 300)}`)
  const data = JSON.parse(raw)
  return (data?.content ?? []).map((part: any) => part?.text ?? '').join('\n')
}

async function extractWithOpenAI(
  apiKey: string,
  model: string,
  filename: string,
  base64: string,
  prompt = EXTRACT_PROMPT,
  maxTokens = 16000,
): Promise<string> {
  const response = await fetchWithTimeout('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_file', filename, file_data: `data:application/pdf;base64,${base64}` },
            { type: 'input_text', text: prompt },
          ],
        },
      ],
      max_output_tokens: maxTokens,
    }),
  })
  const raw = await response.text()
  if (!response.ok) throw new Error(`OpenAI extract (${response.status}): ${raw.slice(0, 300)}`)
  const data = JSON.parse(raw)
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text
  const chunks = (data?.output ?? []).flatMap((item: any) => item?.content ?? [])
  return chunks.map((part: any) => part?.text ?? '').join('\n')
}

export async function extractPdfText(opts: {
  base64: string
  filename: string
  provider?: string | null
}): Promise<string> {
  const order: LlmProvider[] = ['gemini', 'anthropic', 'openai']
  const preferred = opts.provider ? normalizeProvider(opts.provider) : firstConfiguredProvider()
  const sequence = [preferred, ...order.filter((id) => id !== preferred)]
  const errors: string[] = []

  for (const provider of sequence) {
    const apiKey = getProviderApiKey(provider)
    if (!apiKey) continue
    const model = getProviderModel(provider)
    try {
      if (provider === 'gemini') return await extractWithGemini(apiKey, model, opts.base64)
      if (provider === 'anthropic') return await extractWithAnthropic(apiKey, model, opts.base64)
      return await extractWithOpenAI(apiKey, model, opts.filename, opts.base64)
    } catch (error: any) {
      errors.push(`${provider}: ${String(error?.message ?? error)}`)
    }
  }

  throw new Error(errors[0] ?? 'Nenhuma chave de IA disponível para extrair o PDF.')
}

export type LlmCaseMetadata = {
  numeroProcesso?: string
  nomeCliente?: string
  classeProcessual?: string
}

function parseCaseMetadataJson(raw: string): LlmCaseMetadata {
  try {
    const data = JSON.parse(unwrapJsonish(raw))
    return {
      numeroProcesso: typeof data?.numeroProcesso === 'string' ? data.numeroProcesso.trim() : '',
      nomeCliente: typeof data?.nomeCliente === 'string' ? data.nomeCliente.trim() : '',
      classeProcessual: typeof data?.classeProcessual === 'string' ? data.classeProcessual.trim() : '',
    }
  } catch {
    return {}
  }
}

export async function inferCaseMetadataFromText(text: string): Promise<LlmCaseMetadata> {
  const raw = await callLLM({
    json: true,
    maxTokens: 400,
    label: 'Metadados do PDF',
    system: CASE_METADATA_PROMPT,
    user: text.slice(0, 12_000),
  })
  return parseCaseMetadataJson(raw)
}

export async function extractPdfCaseMetadata(opts: {
  base64: string
  filename: string
  provider?: string | null
}): Promise<LlmCaseMetadata> {
  const order: LlmProvider[] = ['gemini', 'anthropic', 'openai']
  const preferred = opts.provider ? normalizeProvider(opts.provider) : firstConfiguredProvider()
  const sequence = [preferred, ...order.filter((id) => id !== preferred)]
  const errors: string[] = []

  for (const provider of sequence) {
    const apiKey = getProviderApiKey(provider)
    if (!apiKey) continue
    const model = getProviderModel(provider)
    try {
      let text = ''
      if (provider === 'gemini') {
        text = await extractWithGemini(apiKey, model, opts.base64, CASE_METADATA_PROMPT, 600, true)
      } else if (provider === 'anthropic') {
        text = await extractWithAnthropic(apiKey, model, opts.base64, CASE_METADATA_PROMPT, 600)
      } else {
        text = await extractWithOpenAI(apiKey, model, opts.filename, opts.base64, CASE_METADATA_PROMPT, 600)
      }
      return parseCaseMetadataJson(text)
    } catch (error: any) {
      errors.push(`${provider}: ${String(error?.message ?? error)}`)
    }
  }

  throw new Error(errors[0] ?? 'Nenhuma chave de IA disponível para ler o PDF.')
}
