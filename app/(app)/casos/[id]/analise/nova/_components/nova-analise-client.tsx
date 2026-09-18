'use client'
import { fetchAnalysisStream } from '@/lib/analysis-stream'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAnalysisDraft } from '@/components/analysis-drafts'
import { PageHeader } from '@/components/layouts/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { FadeIn } from '@/components/ui/animate'
import { ArrowLeft, Play, Loader2, AlertCircle } from 'lucide-react'
import { PROVIDER_MODELS } from '@/lib/constants'
import { toast } from 'sonner'
import { LimparButton } from '@/components/limpar-button'

export function NovaAnaliseClient({ caseId }: { caseId: string }) {
  const router = useRouter()
  const [caseData, setCaseData] = useState<any>(null)
  const [mission, setMission] = useAnalysisDraft(`${caseId}:mission`, '')
  const [product, setProduct] = useAnalysisDraft(`${caseId}:product`, '')
  const [provider, setProvider] = useAnalysisDraft(`${caseId}:provider`, 'openai')
  const [runMode, setRunMode] = useAnalysisDraft(`${caseId}:runMode`, 'COMPLETA')
  const [selectedDocs, setSelectedDocs] = useAnalysisDraft<string[] | null>(`${caseId}:documents`, null)
  const [running, setRunning] = useState(false)
  const [currentLabel, setCurrentLabel] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/cases/${caseId}`)
      .then((r) => r.json())
      .then((data) => {
        setCaseData(data)
        // Auto-select docs with extracted text
        const docsWithText = (data?.documents ?? [])?.map((d: any) => d?.id) ?? []
        setSelectedDocs(previous => previous ?? docsWithText)
      })
      .catch((e) => console.error(e))
  }, [caseId, setSelectedDocs])

  function toggleDoc(docId: string) {
    setSelectedDocs((prev) => {
      const arr = prev ?? []
      return arr.includes(docId) ? arr.filter((id: string) => id !== docId) : [...arr, docId]
    })
  }

  async function handleRun() {
    if ((selectedDocs?.length ?? 0) === 0) {
      toast.error('Selecione ao menos um documento')
      return
    }

    setRunning(true)
    setError('')
    setCurrentLabel('Iniciando análise...')

    try {
      const res = await fetchAnalysisStream('/api/analysis/run', {
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
        setError((await res.json().catch(() => ({}))).error || 'Não foi possível iniciar. Confira os documentos e tente novamente.')
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
                setCurrentLabel(friendlyProgressLabel(data?.agent))
              } else if (data?.status === 'document_progress') {
                setCurrentLabel(`${friendlyProgressLabel(data.agent)} — ${data.processed}/${data.total} páginas`)
              } else if (data?.status === 'agent_complete') {
                setCurrentLabel(friendlyProgressLabel(data?.agent))
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
      setError('A conexão foi interrompida. Consulte o histórico do caso antes de tentar novamente.');
    } catch (err: any) {
      console.error(err)
      setError(String(err?.message ?? 'Erro na análise'))
    } finally {
      setRunning(false)
    }
  }

  const docs = caseData?.documents ?? []
  const docsWithText = docs

  return (
    <div className="space-y-6 max-w-3xl">
      <FadeIn>
        <PageHeader
          title="Nova Análise"
          description={`Método Basile para ${caseData?.title ?? 'caso'}`}
          actions={
            <>
              <LimparButton
                confirmMessage="Deseja limpar o objetivo, o resultado desejado e a seleção?"
                onClear={() => { setMission(''); setProduct(''); setSelectedDocs([]); setCurrentLabel(''); setError('') }}
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
        <CardHeader><CardTitle className="text-sm">Objetivo da análise</CardTitle></CardHeader>
        <CardContent>
          <Label htmlFor="analysis-mission">O que você precisa descobrir? (opcional)</Label>
          <Textarea id="analysis-mission" maxLength={6000}
            value={mission}
            onChange={(e: any) => setMission(e?.target?.value ?? '')}
            rows={4}
            placeholder="Ex.: conferir a origem do pagamento e os próximos passos."
          />
          <div className="mt-3">
            <Label htmlFor="analysis-product">Resultado desejado (opcional)</Label>
            <Textarea id="analysis-product"
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
            <p className="text-sm text-muted-foreground">Envie um PDF na página do caso para começar.</p>
          ) : docsWithText?.length === 0 ? (
            <p className="text-sm text-muted-foreground">Envie um PDF na página do caso para começar.</p>
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
                      {d?.pageCount ? `${d.pageCount} páginas` : 'PDF disponível'}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <details className="rounded-lg border p-4"><summary className="cursor-pointer text-sm font-medium">Opções avançadas</summary>
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="analysis-provider">Provedor de IA</Label>
              <select id="analysis-provider"
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
              <Label htmlFor="analysis-mode">Tipo de análise</Label>
              <select id="analysis-mode"
                value={runMode}
                onChange={(e: any) => setRunMode(e?.target?.value ?? 'COMPLETA')}
                className="w-full bg-card border border-input rounded-lg px-3 py-2 text-sm text-foreground"
              >
                <option value="COMPLETA">Análise completa</option>
                <option value="SOMENTE_BASILE">Leitura inicial dos documentos</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      </details>
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
            <><Play className="w-5 h-5 mr-2" />Iniciar análise</>
          )}
        </Button>

        {running && (
          <Card>
            <CardContent className="p-4" role="status" aria-live="polite">
              <div className="flex items-center gap-3">
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
                <span className="text-sm text-primary">{currentLabel || 'Analisando os documentos…'}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {error && (
          <Card className="border-destructive">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
              <p role="alert" className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function friendlyProgressLabel(agent: unknown) {
  const labels: Record<string, string> = {
    basile: 'Lendo e organizando os documentos…',
    advocado: 'Verificando pontos de atenção…',
    cabeca: 'Avaliando possíveis decisões…',
    auditor: 'Conferindo o suporte documental…',
    mestre: 'Preparando a síntese…',
    orientacoes: 'Revisando a conclusão…',
  }
  return labels[String(agent)] ?? 'Analisando os documentos…'
}
