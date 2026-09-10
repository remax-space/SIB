'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PageHeader } from '@/components/layouts/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { FadeIn } from '@/components/ui/animate'
import { ArrowLeft, Play, CheckCircle, Loader2, AlertCircle } from 'lucide-react'
import { PROVIDER_MODELS, AGENTS } from '@/lib/constants'
import { toast } from 'sonner'
import { LimparButton } from '@/components/limpar-button'

type AgentStatus = 'pending' | 'running' | 'done' | 'error'

export function NovaAnaliseClient({ caseId }: { caseId: string }) {
  const router = useRouter()
  const [caseData, setCaseData] = useState<any>(null)
  const [mission, setMission] = useState(
    'Investigue, audite e conclua este PDF pelo Método Basile: fatos, provas, cronologia, contradições, lacunas, tese, contratese, riscos e resistência judicial. Ao final, indique objetivamente a melhor conduta do operador, sem inventar dados e sem usar memória como prova.'
  )
  const [product, setProduct] = useState('')
  const [provider, setProvider] = useState('openai')
  const [runMode, setRunMode] = useState('COMPLETA')
  const [selectedDocs, setSelectedDocs] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus>>({})
  const [currentLabel, setCurrentLabel] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/cases/${caseId}`)
      .then((r) => r.json())
      .then((data) => {
        setCaseData(data)
        // Auto-select docs with extracted text
        const docsWithText = (data?.documents ?? []).filter((d: any) => d?.extractedText)?.map((d: any) => d?.id) ?? []
        setSelectedDocs(docsWithText)
      })
      .catch((e) => console.error(e))
  }, [caseId])

  function toggleDoc(docId: string) {
    setSelectedDocs((prev) => {
      const arr = prev ?? []
      return arr.includes(docId) ? arr.filter((id: string) => id !== docId) : [...arr, docId]
    })
  }

  async function handleRun() {
    if ((selectedDocs?.length ?? 0) === 0) {
      toast.error('Selecione ao menos um documento com texto extraído')
      return
    }

    setRunning(true)
    setError('')
    setAgentStatuses({})
    setCurrentLabel('Iniciando análise...')

    try {
      const res = await fetch('/api/analysis/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId,
          missionLiteral: mission?.trim() || undefined,
          authorizedProduct: product || null,
          provider,
          runMode,
          documentIds: selectedDocs,
        }),
      })

      const analysisId = res.headers.get('X-Analysis-Id') ?? ''

      if (!res.ok || !res.body) {
        setError('Erro ao iniciar pipeline de análise')
        setRunning(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let partialRead = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        partialRead += decoder.decode(value, { stream: true })
        const lines = partialRead.split('\n')
        partialRead = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data?.status === 'agent_start') {
                setAgentStatuses((prev) => ({ ...(prev ?? {}), [data.agent]: 'running' }))
                setCurrentLabel(data?.label ?? '')
              } else if (data?.status === 'agent_complete') {
                setAgentStatuses((prev) => ({ ...(prev ?? {}), [data.agent]: 'done' }))
              } else if (data?.status === 'completed') {
                toast.success('Análise concluída!')
                const targetId = data?.analysisId ?? analysisId
                if (targetId) {
                  router.push(`/casos/${caseId}/analise/${targetId}`)
                }
                return
              } else if (data?.status === 'error') {
                setError(data?.message ?? 'Erro desconhecido')
                setRunning(false)
                return
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch (err: any) {
      console.error(err)
      setError(String(err?.message ?? 'Erro na análise'))
    } finally {
      setRunning(false)
    }
  }

  const docs = caseData?.documents ?? []
  const docsWithText = docs.filter((d: any) => d?.extractedText)

  return (
    <div className="space-y-6 max-w-3xl">
      <FadeIn>
        <PageHeader
          title="Nova Análise"
          description={`Método Basile para ${caseData?.title ?? 'caso'}`}
          actions={
            <>
              <LimparButton
                confirmMessage="Deseja limpar o formulário (missão, produto e seleção)?"
                onClear={() => { setMission(''); setProduct(''); setSelectedDocs([]); setAgentStatuses({}); setCurrentLabel(''); setError('') }}
              />
              <Link href={`/casos/${caseId}`}>
                <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />Voltar ao Caso</Button>
              </Link>
            </>
          }
        />
      </FadeIn>

      {/* Mission */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Missão Literal do Operador (opcional — usa a Missão padrão do Método Basile se vazia)</CardTitle></CardHeader>
        <CardContent>
          <Textarea
            value={mission}
            onChange={(e: any) => setMission(e?.target?.value ?? '')}
            rows={4}
            placeholder="Descreva a missão de análise..."
          />
          <div className="mt-3">
            <Label>Produto Autorizado (opcional)</Label>
            <Textarea
              value={product}
              onChange={(e: any) => setProduct(e?.target?.value ?? '')}
              rows={2}
              placeholder="O que a análise deve produzir..."
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Document selection */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Documentos para Análise</CardTitle></CardHeader>
        <CardContent>
          {docs?.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum documento no corpus. Envie documentos primeiro.</p>
          ) : docsWithText?.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum documento tem texto extraído. Extraia o texto primeiro.</p>
          ) : (
            <div className="space-y-2">
              {docsWithText.map((d: any) => (
                <label key={d?.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedDocs?.includes(d?.id) ?? false}
                    onChange={() => toggleDoc(d?.id)}
                    className="rounded border-border"
                  />
                  <div>
                    <p className="text-sm font-medium">{d?.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {d?.pageCount ?? '?'} pág. • {((d?.extractedText?.length ?? 0) / 1000).toFixed(1)}k caracteres
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Provider + Mode */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Provedor de IA</Label>
              <select
                value={provider}
                onChange={(e: any) => setProvider(e?.target?.value ?? 'openai')}
                className="w-full bg-card border border-input rounded-lg px-3 py-2 text-sm text-foreground"
              >
                {Object.entries(PROVIDER_MODELS ?? {}).map(([key, val]: [string, any]) => (
                  <option key={key} value={key}>{val?.icon} {val?.label} ({val?.model})</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Modo de Execução</Label>
              <select
                value={runMode}
                onChange={(e: any) => setRunMode(e?.target?.value ?? 'COMPLETA')}
                className="w-full bg-card border border-input rounded-lg px-3 py-2 text-sm text-foreground"
              >
                <option value="COMPLETA">Análise Completa (5 Agentes)</option>
                <option value="SOMENTE_BASILE">Somente BASILE</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Run button + progress */}
      <div className="space-y-4">
        <Button
          onClick={handleRun}
          disabled={running || (selectedDocs?.length ?? 0) === 0}
          className="w-full h-12"
          size="lg"
        >
          {running ? (
            <><Loader2 className="w-5 h-5 mr-2 animate-spin" />Executando {currentLabel}...</>
          ) : (
            <><Play className="w-5 h-5 mr-2" />Executar Análise</>
          )}
        </Button>

        {running && (
          <Card>
            <CardContent className="p-4">
              <div className="space-y-2">
                {AGENTS?.map((agent: any) => {
                  const s = agentStatuses?.[agent?.key] ?? 'pending'
                  return (
                    <div key={agent?.key} className="flex items-center gap-3">
                      {s === 'done' ? (
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                      ) : s === 'running' ? (
                        <Loader2 className="w-4 h-4 text-primary animate-spin" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-border" />
                      )}
                      <span className={`text-sm ${s === 'running' ? 'text-primary font-medium' : s === 'done' ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                        {agent?.icon} {agent?.label} — {agent?.subtitle}
                      </span>
                    </div>
                  )
                }) ?? []}
              </div>
            </CardContent>
          </Card>
        )}

        {error && (
          <Card className="border-destructive">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
