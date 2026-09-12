export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { rateLimit } from '@/lib/rate-limit'
import { datajudApiKey, parseCnj } from '@/lib/datajud'
import { fetchWithTimeout } from '@/lib/safe-url'

const DATAJUD_BASE = 'https://api-publica.datajud.cnj.jus.br'

export async function POST(request: NextRequest) {
  const gate = await requireAuth()
  if (gate instanceof NextResponse) return gate

  const rlKey = (gate.user as { id?: string } | undefined)?.id ?? 'anon'
  const rl = rateLimit(`datajud:${rlKey}`, 20, 60_000)
  if (!rl.ok) {
    return NextResponse.json({ error: `Muitas consultas em sequência. Aguarde ${rl.retryAfter}s.` }, { status: 429 })
  }

  const apiKey = datajudApiKey()
  if (!apiKey) {
    return NextResponse.json({
      status: 'aguardando_chave',
      message: 'Cadastre DATAJUD_API_KEY no ambiente do servidor para consultar a API pública do CNJ.',
    })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const parsed = parseCnj(String(body?.numero ?? ''))
    if (!parsed) {
      return NextResponse.json({ error: 'Informe um número de processo no padrão CNJ (20 dígitos).' }, { status: 400 })
    }

    const response = await fetchWithTimeout(
      `${DATAJUD_BASE}/api_publica_${parsed.alias}/_search`,
      {
        method: 'POST',
        headers: {
          Authorization: `APIKey ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          query: { match: { numeroProcesso: parsed.digits } },
          size: 5,
        }),
      },
      20_000
    )

    if (!response.ok) {
      return NextResponse.json(
        { error: `DataJud recusou a consulta (HTTP ${response.status}).` },
        { status: 502 }
      )
    }

    const payload = await response.json()
    const hits = Array.isArray(payload?.hits?.hits) ? payload.hits.hits : []
    const processos = hits.map((hit: { _source?: Record<string, unknown> }) => hit?._source ?? {})

    return NextResponse.json({
      status: 'ok',
      consulta: parsed,
      total: payload?.hits?.total?.value ?? processos.length,
      processos,
    })
  } catch (error) {
    console.error('DataJud consult error:', error)
    return NextResponse.json({ error: 'Erro ao consultar o DataJud' }, { status: 500 })
  }
}
