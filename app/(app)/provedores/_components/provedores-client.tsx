'use client'

import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/layouts/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { CheckCircle, XCircle, Loader2, Zap } from 'lucide-react'
import { PROVIDER_MODELS } from '@/lib/constants'
import { toast } from 'sonner'

export function ProvedoresClient() {
  const [providers, setProviders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({})

  useEffect(() => {
    fetch('/api/providers')
      .then((r) => r.json())
      .then((data) => {
        const arr = Array.isArray(data) ? data : []
        // Merge with defaults
        const merged = Object.entries(PROVIDER_MODELS ?? {}).map(([key, def]: [string, any]) => {
          const existing = arr.find((p: any) => p?.provider === key)
          return existing ?? { provider: key, apiKey: '', model: def?.model ?? '', enabled: false }
        })
        setProviders(merged)
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(provider: string, data: any) {
    try {
      const res = await fetch('/api/providers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, ...data }),
      })
      if (res.ok) {
        toast.success('Provedor atualizado')
      } else {
        toast.error('Erro ao salvar')
      }
    } catch (err: any) {
      console.error(err)
      toast.error('Erro ao salvar')
    }
  }

  async function handleTest(provider: string) {
    setTesting(provider)
    try {
      const prov = providers?.find((p: any) => p?.provider === provider)
      const res = await fetch('/api/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model: prov?.model ?? PROVIDER_MODELS?.[provider]?.model }),
      })
      const data = await res.json()
      setTestResults((prev) => ({ ...(prev ?? {}), [provider]: data }))
      if (data?.success) {
        toast.success('Conexão bem-sucedida!')
      } else {
        toast.error(`Falha: ${data?.error ?? 'Erro desconhecido'}`)
      }
    } catch (err: any) {
      console.error(err)
      toast.error('Erro no teste')
    } finally {
      setTesting(null)
    }
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        <PageHeader
          title="Provedores de IA"
          description="Configure os provedores de inteligência artificial para as análises do Método Basile"
        />
      </FadeIn>

      <div className="p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
        As chaves ficam no <span className="font-mono">.env</span>: <span className="font-mono">OPENAI_API_KEY</span>, <span className="font-mono">ANTHROPIC_API_KEY</span> e <span className="font-mono">GEMINI_API_KEY</span>. Reinicie o servidor depois de colar.
      </div>

      <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(providers ?? []).map((prov: any) => {
          const def = PROVIDER_MODELS?.[prov?.provider]
          const testResult = testResults?.[prov?.provider]
          return (
            <StaggerItem key={prov?.provider}>
              <Card variant="interactive">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span className="text-lg">{def?.icon ?? '🤖'}</span>
                    {def?.label ?? prov?.provider}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-[11px] text-muted-foreground">
                    {prov?.hasKey
                      ? `Chave lida de ${prov?.envVar ?? def?.envVar}`
                      : `Falta ${prov?.envVar ?? def?.envVar} no .env`}
                  </p>
                  <div className="space-y-1">
                    <Label className="text-xs">Modelo</Label>
                    <Input
                      value={prov?.model ?? ''}
                      onChange={(e: any) => {
                        setProviders((prev) =>
                          (prev ?? []).map((p: any) => p?.provider === prov?.provider ? { ...p, model: e?.target?.value ?? '' } : p)
                        )
                      }}
                      className="text-xs font-mono"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleTest(prov?.provider)}
                      disabled={testing === prov?.provider}
                    >
                      {testing === prov?.provider ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Zap className="w-3 h-3 mr-1" />
                      )}
                      Testar
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => handleSave(prov?.provider, { model: prov?.model, enabled: true })}
                    >
                      Salvar
                    </Button>
                  </div>

                  {testResult && (
                    <div className={`flex items-center gap-2 text-xs p-2 rounded ${testResult?.success ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                      {testResult?.success ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      <span className="truncate">{testResult?.message ?? (testResult?.success ? 'OK' : 'Falha')}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </StaggerItem>
          )
        })}
      </Stagger>
    </div>
  )
}
