export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { callLLM, getProviderApiKey, getProviderEnvVar, getProviderModel, normalizeProvider } from '@/lib/llm'

export async function POST(request: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate
  try {
    const body = await request.json()
    const provider = normalizeProvider(body?.provider)
    if (!getProviderApiKey(provider)) {
      return NextResponse.json({
        success: false,
        error: `Falta ${getProviderEnvVar(provider)} no .env`,
      })
    }

    const model = getProviderModel(provider, body?.model)
    const message = await callLLM({
      provider,
      model,
      system: 'Você é um teste de conexão. Responda só com a frase pedida.',
      user: 'Responda apenas: "Conexão estabelecida com sucesso."',
      json: false,
      maxTokens: 50,
      label: provider,
    })

    return NextResponse.json({ success: true, message })
  } catch (error: any) {
    console.error('Provider test error:', error)
    return NextResponse.json({ success: false, error: String(error?.message ?? error) })
  }
}
