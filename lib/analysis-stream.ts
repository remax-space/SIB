/** One UI stream spans durable, bounded server requests. Closing the browser
 * stops automatic continuation; saved pages can be resumed from the result. */
export async function fetchAnalysisStream(input: string, init: RequestInit): Promise<Response> {
  const abort = new AbortController()
  const first = await fetch(input, { ...init, signal: abort.signal })
  if (!first.ok || !first.body) return first
  const id = first.headers.get('X-Analysis-Id')
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let response = first
      try {
        while (true) {
          const reader = response.body!.getReader()
          const decoder = new TextDecoder()
          let buffer = '', continuation = false
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            controller.enqueue(value)
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n'); buffer = lines.pop() ?? ''
            for (const line of lines) if (line.startsWith('data: ')) {
              const event = JSON.parse(line.slice(6))
              if (event.status === 'continuation') continuation = true
            }
          }
          if (!continuation || !id) break
          response = await fetch(input, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resumeAnalysisId: id }), signal: abort.signal })
          if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Leitura interrompida. Retome no resultado da análise.')
        }
        controller.close()
      } catch (error) { if (!abort.signal.aborted) controller.error(error) }
    },
    cancel() { abort.abort() },
  })
  return new Response(stream, { status: first.status, headers: first.headers })
}
