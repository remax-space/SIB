export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-helpers'
import { getProviderModel, listEnvProviders } from '@/lib/llm'

export async function GET() {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate
  try {
    const stored = await prisma.providerConfig.findMany()
    const fromEnv = listEnvProviders()
    return NextResponse.json(
      fromEnv.map((item) => {
        const row = stored.find((p) => p.provider === item.provider)
        return {
          ...item,
          model: row?.model?.trim() || item.model,
          apiKey: item.hasKey ? '•••• via .env' : '',
        }
      })
    )
  } catch (error: any) {
    console.error('Providers GET error:', error)
    return NextResponse.json({ error: 'Erro ao buscar provedores' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate
  try {
    const body = await request.json()
    const { provider, model, enabled } = body ?? {}

    if (!provider) {
      return NextResponse.json({ error: 'Provider obrigatório' }, { status: 400 })
    }

    const updated = await prisma.providerConfig.upsert({
      where: { provider },
      update: {
        ...(model !== undefined ? { model } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
      },
      create: {
        provider,
        apiKey: '',
        model: model ?? getProviderModel(provider),
        enabled: enabled ?? true,
      },
    })

    return NextResponse.json({
      ...updated,
      apiKey: '',
      hasKey: listEnvProviders().find((p) => p.provider === provider)?.hasKey ?? false,
    })
  } catch (error: any) {
    console.error('Providers PUT error:', error)
    return NextResponse.json({ error: 'Erro ao atualizar provedor' }, { status: 500 })
  }
}
