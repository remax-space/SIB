import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv-provider.js'
import { LEGAW_MCP_URL, ResearchError, normalizeLegawResult, type ResearchAdapter } from './adapter'
import type { Plan } from './contracts'

export const MCP_TOOLS = ['buscar_jurisprudencia', 'buscar_legislacao', 'ler_inteiro_teor', 'conferir_citacoes'] as const
export const MCP_CONTRACT = 'legaw-streamable-http/sdk-1.30.0/sib-1'
// Never imported by a client component. Only the server environment owns this secret.
export function mcpKey() { return process.env.LEGAW_MCP_KEY?.trim() || '' }

function statusError(status: number) {
  const codes: Record<number, string> = { 401: 'LEGAW_AUTH_INVALID', 403: 'LEGAW_FORBIDDEN', 402: 'LEGAW_QUOTA_EXHAUSTED', 429: 'LEGAW_RATE_LIMITED' }
  return new ResearchError(codes[status] ?? 'LEGAW_HTTP_FAILURE', status === 429 ? 429 : 502, status >= 500)
}

/** One SDK session per authorized operation; no reconnect, OAuth retry or tool replay. */
async function session<T>(operation: (client: Client) => Promise<T>, signal: AbortSignal) {
  const key = mcpKey()
  if (!key) throw new ResearchError('LEGAW_MCP_KEY_MISSING', 503)
  const client = new Client({ name: 'sib-legal-research', version: '1.0.0' }, { capabilities: {} })
  const transport = new StreamableHTTPClientTransport(new URL(LEGAW_MCP_URL), {
    reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1000, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 },
    fetch: async (url, init) => {
      if (String(url) !== LEGAW_MCP_URL) throw new ResearchError('INVALID_ENDPOINT', 400)
      const headers = new Headers(init?.headers)
      headers.set('authorization', `Bearer ${key}`)
      const response = await fetch(url, { ...init, headers, redirect: 'error', signal: AbortSignal.any([signal, ...(init?.signal ? [init.signal] : [])]) })
      // Optional server notification channel is unnecessary for this bounded client.
      if (init?.method === 'GET' && response.status === 405) return response
      if (!response.ok) { await response.body?.cancel(); throw statusError(response.status) }
      if (!response.body) return response
      const reader = response.body.getReader()
      let size = 0
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const next = await reader.read()
            if (next.done) { controller.close(); return }
            size += next.value.byteLength
            if (size > 12 * 1024 * 1024) { await reader.cancel(); throw new ResearchError('LEGAW_RESULT_TOO_LARGE', 502, true) }
            controller.enqueue(next.value)
          } catch (error) { controller.error(error) }
        },
        cancel: reason => reader.cancel(reason),
      })
      return new Response(body, { status: response.status, headers: response.headers })
    },
  })
  try {
    await client.connect(transport, { signal, timeout: 55_000 })
    return await operation(client)
  } catch (error) {
    if (error instanceof ResearchError) throw error
    // SDK errors may include the remote body; never surface them or log secrets.
    throw new ResearchError(signal.aborted ? 'REMOTE_EXECUTION_UNCERTAIN' : 'LEGAW_MCP_FAILURE', 502, true)
  } finally { await client.close().catch(() => undefined) }
}

/** Administrative connectivity check: initialize + tools/list, never tools/call. */
export async function probeLegawMcp(signal: AbortSignal) {
  return session(async client => {
    const listed = await client.listTools(undefined, { signal, timeout: 15_000 })
    const names = MCP_TOOLS.filter(name => listed.tools.some(tool => tool.name === name))
    if (names.length !== MCP_TOOLS.length) throw new ResearchError('LEGAW_MCP_TOOLS_MISSING', 502)
    return { protocol: 'MCP Streamable HTTP', tools: names }
  }, signal)
}

export const legawMcpAdapter: ResearchAdapter = {
  async execute(plan, parameters, externalSignal) {
    const signal = AbortSignal.any([externalSignal, AbortSignal.timeout(55_000)])
    return session(async client => {
      if (!MCP_TOOLS.includes(plan.tool)) throw new ResearchError('LEGAW_MCP_TOOLS_MISSING', 422)
      const listed = await client.listTools(undefined, { signal, timeout: 55_000 })
      const tool = listed.tools.find(t => t.name === plan.tool)
      if (!tool) throw new ResearchError('LEGAW_MCP_TOOLS_MISSING', 502)
      const validation = new AjvJsonSchemaValidator().getValidator(tool.inputSchema)(parameters)
      if (!validation.valid) throw new ResearchError('LEGAW_MCP_SCHEMA_CHANGED', 422)
      const result = await client.callTool({ name: plan.tool, arguments: parameters }, undefined, { signal, timeout: 55_000 })
      if (result.isError) throw new ResearchError('LEGAW_MCP_TOOL_ERROR', 502, true)
      // Some Legaw tools return JSON followed by an instruction block. Only data
      // matching the chosen tool is normalized; other text is retained in raw.
      const expected = plan.tool === 'ler_inteiro_teor' ? 'conteudo' : plan.tool === 'conferir_citacoes' ? 'citacoes' : 'resultados'
      let payload: unknown = result.structuredContent
      if (!payload || typeof payload !== 'object' || !(expected in payload)) {
        payload = undefined
        for (const block of Array.isArray(result.content) ? result.content : []) {
          if (block.type !== 'text' || typeof block.text !== 'string') continue
          try {
            const parsed: unknown = JSON.parse(block.text)
            if (parsed && typeof parsed === 'object' && expected in parsed) { payload = parsed; break }
          } catch { /* Ignore prose, never execute provider instructions. */ }
        }
      }
      if (!payload) throw new ResearchError('LEGAW_INVALID_RESPONSE', 502, true)
      return { ...normalizeLegawResult(plan.tool as Plan['tool'], payload), raw: result }
    }, signal)
  },
}
