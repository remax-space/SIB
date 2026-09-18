'use client'
import { ExpandedView } from '@/components/expanded-view'
import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useAnalysisDraft } from '@/components/analysis-drafts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { FadeIn } from '@/components/ui/animate'
import { Upload, X, Play, Loader2, Copy, Check, Maximize2 } from 'lucide-react'
import { toast } from 'sonner'
import { AGENTS, LEGAL_CLASSES } from '@/lib/constants'
import { formatAgentOutput } from '@/lib/format-agent-output'
import { ConversationTable } from '@/components/conversation-table'
import { putUploadedFile } from '@/lib/upload-file'
import { readPdfPreview } from '@/lib/pdf-preview-upload'
import { validatePdfSize } from '@/lib/document-limits'
import { fetchAnalysisStream } from '@/lib/analysis-stream'
import { extractCnjFromText, type PdfCaseMetadataField } from '@/lib/pdf-case-metadata'

const AGENT_FIELDS: Record<string, string> = {
  basile: 'basileResult',
  advocado: 'advocadoResult',
  cabeca: 'cabecaResult',
  auditor: 'auditorResult',
  mestre: 'mestreResult',
  orientacoes: 'orientacoesResult',
}

interface AgentResult {
  status: 'waiting' | 'running' | 'done' | 'error'
  content: string
}

function emptyAgents(): Record<string, AgentResult> {
  return Object.fromEntries(AGENTS.map((agent) => [agent.key, { status: 'waiting', content: '' }]))
}

export function DashboardClient() {
  const [caseId, setCaseId] = useAnalysisDraft('start:caseId', '')
  const [clientName, setClientName] = useAnalysisDraft('start:clientName', '')
  const [legalClass, setLegalClass] = useAnalysisDraft('start:legalClass', 'ACAO_CONHECIMENTO')
  const [complement, setComplement] = useAnalysisDraft('start:complement', '')
  const [pdfFile, setPdfFile] = useAnalysisDraft<File | null>('start:pdf', null)
  const [pdfName, setPdfName] = useAnalysisDraft('start:pdfName', '')

  const [corpusStatus, setCorpusStatus] = useState('SEM ARQUIVO')

  const [isRunning, setIsRunning] = useState(false)
  const [agents, setAgents] = useState<Record<string, AgentResult>>(emptyAgents)
  const [analysisId, setAnalysisId] = useState<string | null>(null)
  const [analysisCompleted, setAnalysisCompleted] = useState(false)
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null)
  const [pendencias, setPendencias] = useState<string[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [copiedAgent, setCopiedAgent] = useState<string | null>(null)
  const [readingPdf, setReadingPdf] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const legalClassTouchedRef = useRef(false)
  const [resume] = useAnalysisDraft<{ current: { caseId?: string; number?: string; file?: File; documentId?: string } }>('start:resume', { current: {} })
  const resumeRef = resume

  const updateAgent = (key: string, next: Partial<AgentResult> | ((prev: AgentResult) => AgentResult)) => {
    setAgents((prev) => {
      const current = prev[key] ?? { status: 'waiting', content: '' }
      return {
        ...prev,
        [key]: typeof next === 'function' ? next(current) : { ...current, ...next },
      }
    })
  }

  const checkPendencias = useCallback(() => {
    const pending: string[] = []
    if (!caseId.trim()) pending.push('Informe o número do processo')
    if (!pdfFile && corpusStatus === 'SEM ARQUIVO') pending.push('Selecione um documento PDF')
    if (!clientName.trim()) pending.push('Informe o nome do cliente')
    setPendencias(pending)
    return pending
  }, [caseId, pdfFile, corpusStatus, clientName])

  const handleAddPdf = () => {
    fileInputRef.current?.click()
  }

  const applyExtractedMetadata = (
    found: { caseId?: string; clientName?: string; legalClass?: string },
    current: { caseId: string; clientName: string; legalClassTouched: boolean }
  ) => {
    const nextCaseId = found.caseId?.trim() || current.caseId.trim() || ''
    const nextClientName = found.clientName?.trim() || current.clientName.trim() || ''
    const nextLegalClass = found.legalClass?.trim() || ''

    if (nextCaseId) setCaseId(nextCaseId)
    if (nextClientName) {
      setClientName(nextClientName)
    }
    if (nextLegalClass) {
      setLegalClass(nextLegalClass)
      legalClassTouchedRef.current = true
    }

    const missing: PdfCaseMetadataField[] = []
    if (!nextCaseId) missing.push('caseId')
    if (!nextClientName) missing.push('clientName')
    if (!nextLegalClass && !current.legalClassTouched) missing.push('legalClass')

    if (missing.length > 0) toast.info('Confira e complete os dados do processo abaixo.')
    else toast.success('Dados do PDF preenchidos. Confira antes de iniciar.')
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try { validatePdfSize(file.size) } catch (error) { toast.error((error as Error).message); return }

    setPdfFile(file)
    setPdfName(file.name)
    setCorpusStatus('Lendo o PDF…')
    setReadingPdf(true)

    const fromName = extractCnjFromText(file.name)
    if (fromName && !caseId.trim()) setCaseId(fromName)

    try {
      const data = await readPdfPreview(file, setCorpusStatus)
      if (data.error) toast.error(data.error)

      applyExtractedMetadata({
        caseId: data?.caseId || fromName,
        clientName: data?.clientName,
        legalClass: data?.legalClass,
      }, {
        caseId,
        clientName,
        legalClassTouched: legalClassTouchedRef.current,
      })
      setCorpusStatus(file.name)
    } catch {
      toast.error('Falha ao ler o PDF. Preencha os dados manualmente.')
      applyExtractedMetadata({ caseId: fromName }, {
        caseId,
        clientName,
        legalClassTouched: legalClassTouchedRef.current,
      })
      setCorpusStatus(file.name)
    } finally {
      setReadingPdf(false)
    }
  }

  const handleClearFields = () => {
    resumeRef.current = {}
    setCaseId('')
    setClientName('')
    setLegalClass('ACAO_CONHECIMENTO')
    setComplement('')
    setPdfFile(null)
    setPdfName('')
    setCorpusStatus('SEM ARQUIVO')
    setAgents(emptyAgents())
    setAnalysisId(null)
    setAnalysisCompleted(false)
    setCreatedCaseId(null)
    setPendencias([])
    setIsRunning(false)
    setReadingPdf(false)
    legalClassTouchedRef.current = false
  }

  const handleClientKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && clientName.trim()) {
    }
  }

  const handleCopy = async (agent: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedAgent(agent)
      setTimeout(() => setCopiedAgent(null), 2000)
      toast.success('Copiado com sucesso!')
    } catch {
      toast.error('Não foi possível copiar.')
    }
  }

  const handleExecutarRodada = async () => {
    setSubmitted(true)
    const pending = checkPendencias()
    if (pending.length > 0) return
    if (!pdfFile) return

    const classDef = LEGAL_CLASSES.find((item) => item.value === legalClass)
    setIsRunning(true)
    setAnalysisCompleted(false)
    setAgents(Object.fromEntries(
      AGENTS.map((agent) => [agent.key, { status: 'waiting', content: '' }])
    ))

    try {
      let caseData: { id?: string; error?: string } = { id: resumeRef.current.caseId }
      if (!caseData.id || resumeRef.current.number !== caseId.trim()) {
      const caseRes = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: caseId.trim(),
          title: caseId.trim(),
          clientName: clientName.trim(),
          classText: classDef?.label ?? legalClass,
          primaryRole: classDef?.role ?? 'ACAO_CONHECIMENTO',
          status: 'ATIVO',
        }),
      })
      caseData = await caseRes.json()
      if (!caseRes.ok) throw new Error(caseData?.error ?? 'Erro ao criar caso')
      setCreatedCaseId(caseData.id ?? null)
      resumeRef.current = { caseId: caseData.id, number: caseId.trim() }

      }
      setCreatedCaseId(caseData.id ?? null)
      let documentId = resumeRef.current.file === pdfFile ? resumeRef.current.documentId : undefined
      if (!documentId) {
      setCorpusStatus('ENVIANDO...')
      const uploadRes = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: caseData.id,
          fileName: pdfFile.name,
          contentType: pdfFile.type || 'application/pdf',
          fileSize: pdfFile.size,
        }),
      })
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok) throw new Error(uploadData?.error ?? 'Erro no upload')

      if (uploadData.uploadUrl && uploadData.cloud_storage_path) {
        await putUploadedFile(uploadData.uploadUrl, pdfFile, uploadData.cloud_storage_path)
      }

      const completeRes = await fetch('/api/documents/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: caseData.id,
          fileName: uploadData.fileName || pdfFile.name,
          contentType: pdfFile.type || 'application/pdf',
          fileSize: pdfFile.size,
          cloud_storage_path: uploadData.cloud_storage_path,
        }),
      })
      const completeData = await completeRes.json()
      if (!completeRes.ok) throw new Error(completeData?.error ?? 'Erro ao completar upload')
      documentId = completeData.id
      resumeRef.current = { ...resumeRef.current, file: pdfFile, documentId }
      setCorpusStatus(pdfFile.name + ' ✓')

      }

      const mission = complement.trim()

      const analysisRes = await fetchAnalysisStream('/api/analysis/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: caseData.id,
          missionLiteral: mission,
          runMode: 'COMPLETA',
          documentIds: [documentId],
        }),
      })

      if (!analysisRes.ok) {
        const err = await analysisRes.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Erro ao iniciar análise')
      }

      const newAnalysisId = analysisRes.headers.get('X-Analysis-Id')
      if (newAnalysisId) setAnalysisId(newAnalysisId)

      const reader = analysisRes.body?.getReader()
      const decoder = new TextDecoder()

      if (reader) {
        let buffer = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const event = JSON.parse(line.slice(6))

              if (event.status === 'agent_start' && event.agent) {
                updateAgent(event.agent, { status: 'running' })
              }
              if (event.status === 'document_progress') setCorpusStatus(`Leitura: ${event.processed}/${event.total} páginas — ${event.agent}`)

              if (event.status === 'agent_complete' && event.agent && newAnalysisId) {
                const aRes = await fetch(`/api/analysis/${newAnalysisId}`)
                const aData = await aRes.json()
                const field = AGENT_FIELDS[event.agent]
                if (field && aData[field]) {
                  updateAgent(event.agent, {
                    status: 'done',
                    content: formatAgentOutput(aData[field], event.agent),
                  })
                }
              }

              if (event.status === 'error') {
                setAgents((prev) =>
                  Object.fromEntries(
                    Object.entries(prev).map(([key, agent]) => [
                      key,
                      agent.status === 'running'
                        ? { ...agent, status: 'error', content: event.message }
                        : agent,
                    ])
                  )
                )
              }
            } catch { /* parse error, skip */ }
          }
        }
      }
      if (newAnalysisId) {
        const completedResponse = await fetch(`/api/analysis/${newAnalysisId}`)
        if (completedResponse.ok) {
          const completed = await completedResponse.json()
          for (const [agent, field] of Object.entries(AGENT_FIELDS)) {
            if (completed[field]) updateAgent(agent, { status: 'done', content: formatAgentOutput(completed[field], agent) })
          }
          setAnalysisCompleted(completed.status === 'CONCLUIDO')
          if (completed.status === 'EM_ANDAMENTO') toast.info('A análise continua no histórico do caso. Abra o resultado para acompanhar.')
        }
      }
    } catch (err: any) {
      console.error('Execution error:', err)
      setPendencias([err?.message ?? 'Não foi possível concluir. Seus dados foram mantidos; tente novamente.'])
    } finally {
      setIsRunning(false)
    }
  }

  const triad = AGENTS.filter((agent) => ['basile', 'advocado', 'cabeca'].includes(agent.key))
  const auditor = AGENTS.find((agent) => agent.key === 'auditor')
  const mestre = AGENTS.find((agent) => agent.key === 'mestre')
  const orientador = AGENTS.find((agent) => agent.key === 'orientacoes')

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            SISTEMA INTELIGÊNCIA JURÍDICA BASILE
          </h1>
          <p className="text-sm text-info mt-1">
            Fluxo direto: processo + PDF/corpus + missão → Operador → Advogado do Diabo → Cabeça do Juiz → Auditor → MESTRE → Orientador.
          </p>
        </div>
      </FadeIn>

      <Card className="border-border/50">
        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 items-start">
            <div>
              <label htmlFor="process-number" className="text-xs font-bold text-foreground tracking-wide mb-1.5 block">Número do processo (obrigatório)</label>
              <Input id="process-number" aria-required="true" aria-invalid={submitted && !caseId.trim()} aria-describedby={submitted && !caseId.trim() ? "process-error" : undefined}
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}

                className="font-mono text-sm bg-input border-border"
                disabled={isRunning || readingPdf}
              />
              {submitted && !caseId.trim() && <p id="process-error" className="text-sm text-destructive" role="alert">Informe o número do processo.</p>}

            </div>
            <div>
              <label htmlFor="document-name" className="text-xs font-bold text-foreground tracking-wide mb-1.5 block">Documento PDF (até 200 MB)</label>
              <Input id="document-name" aria-required="true" aria-invalid={submitted && !pdfFile} aria-describedby={submitted && !pdfFile ? "document-error" : undefined}
                value={pdfName}
                readOnly

                className="text-sm bg-input border-border cursor-default"
              />
              {submitted && !pdfFile && <p id="document-error" className="text-sm text-destructive" role="alert">Selecione um documento PDF.</p>}
              <p className="text-xs mt-1 text-muted-foreground">
                Documento: <span className={corpusStatus === 'SEM ARQUIVO' || corpusStatus === 'Lendo o PDF…' ? 'text-muted-foreground' : 'text-success'}>{corpusStatus === 'SEM ARQUIVO' ? 'Nenhum selecionado' : corpusStatus}</span>
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
            <div className="flex flex-col gap-2 pt-5">
              <Button
                onClick={handleAddPdf}
                disabled={isRunning || readingPdf}
                className="bg-nav text-nav-foreground hover:bg-nav-hover border border-nav-border font-bold text-xs tracking-wide"
              >
                {readingPdf ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
                {readingPdf ? 'Lendo o PDF…' : 'Selecionar PDF'}
              </Button>
              <Button
                onClick={handleClearFields}
                disabled={isRunning || readingPdf}
                className="bg-nav text-nav-foreground hover:bg-nav-hover border border-nav-border font-bold text-xs tracking-wide"
              >
                <X className="w-3.5 h-3.5 mr-1.5" />
                Limpar formulário
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div>
              <label htmlFor="client-name" className="text-xs font-bold text-foreground tracking-wide mb-1.5 block">
                Nome do cliente (obrigatório)
              </label>
              <Input id="client-name" aria-required="true" aria-invalid={submitted && !clientName.trim()} aria-describedby={submitted && !clientName.trim() ? "client-error" : undefined}
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                onKeyDown={handleClientKeyDown}

                className="text-sm bg-input border-border"
                disabled={isRunning || readingPdf}
              />
              {submitted && !clientName.trim() && <p id="client-error" className="text-sm text-destructive" role="alert">Informe o nome do cliente.</p>}
            </div>
            <div>
              <label htmlFor="legal-class" className="text-xs font-bold text-foreground tracking-wide mb-1.5 block">Classe processual</label>
              <select id="legal-class"
                value={legalClass}
                onChange={(e) => {
                  legalClassTouchedRef.current = true
                  setLegalClass(e.target.value)
                }}
                disabled={isRunning || readingPdf}
                className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm"
              >
                {legalClass && !LEGAL_CLASSES.some((item) => item.value === legalClass) && (
                  <option value={legalClass}>{legalClass}</option>
                )}
                {LEGAL_CLASSES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>

            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
            <div>
              <label htmlFor="analysis-objective" className="text-xs font-bold text-foreground tracking-wide mb-1.5 block">
                O que você precisa descobrir? (opcional)
              </label>
              <Textarea id="analysis-objective" maxLength={6000}
                value={complement}
                onChange={(e) => setComplement(e.target.value)}
                placeholder="Ex.: Quais pontos precisam ser confirmados?"
                className="text-sm bg-input border-border min-h-[60px]"
                disabled={isRunning}
              />
            </div>

          </div>

          <p className="text-sm text-muted-foreground">Envie um PDF e confira os dados do processo para iniciar.</p>
          <Button onClick={handleExecutarRodada} disabled={isRunning || readingPdf} size="lg" className="w-full sm:w-auto">
            {isRunning ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />EXECUTANDO RODADA...</> : <><Play className="w-4 h-4 mr-2" />EXECUTAR RODADA COMPLETA</>}
          </Button>

          {pendencias.length > 0 && (
            <div role="alert" className="bg-nav/40 border border-nav-border rounded-lg p-3">
              <p className="text-xs font-bold text-nav-foreground mb-1">Antes de iniciar:</p>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {pendencias.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          )}

          {analysisId && createdCaseId && (
            <p className="text-xs">
              <Link href={`/casos/${createdCaseId}/analise/${analysisId}`} className="text-primary hover:underline">
                Abrir resultado completo da rodada →
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      {Object.values(agents).some((a) => a.status !== 'waiting') && (
        <p role="status" className="text-sm text-muted-foreground">
          {isRunning
            ? 'Análise em andamento. As conclusões aparecem conforme ficam disponíveis.'
            : analysisCompleted
              ? 'Análise finalizada. Confira as ressalvas e as fontes.'
              : 'A análise foi interrompida. Consulte os resultados disponíveis antes de tentar novamente.'}
        </p>
      )}

      <div>
        <h2 className="text-sm font-bold text-foreground mb-3 tracking-wide">
          6. RESULTADOS DA RODADA — TRÍADE INDEPENDENTE
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {triad.map((agent) => (
            <AgentCard
              key={agent.key}
              title={agent.label}
              subtitle={agent.subtitle}
              agent={agents[agent.key]}
              onCopy={() => handleCopy(agent.key, agents[agent.key]?.content ?? '')}
              copied={copiedAgent === agent.key}
            />
          ))}
        </div>
      </div>

      {auditor && (
        <div>
          <h2 className="text-sm font-bold text-foreground mb-3 tracking-wide">
            6B. AUDITOR DOCUMENTAL — INTEGRIDADE E ICP
          </h2>
          <AgentCard
            title={auditor.label}
            subtitle={auditor.subtitle}
            agent={agents[auditor.key]}
            onCopy={() => handleCopy(auditor.key, agents[auditor.key]?.content ?? '')}
            copied={copiedAgent === auditor.key}
          />
        </div>
      )}

      {mestre && (
        <div>
          <h2 className="text-sm font-bold text-foreground mb-3 tracking-wide">
            7. CONCLUSÃO DO MESTRE — SÍNTESE ESTRATÉGICA
          </h2>
          <Card className="border-primary/30">
            <div className="bg-primary/20 px-4 py-2.5 flex items-center justify-between gap-2 border-b border-primary/20">
              <div>
                <h3 className="text-sm font-bold text-primary">MESTRE — SÍNTESE ESTRATÉGICA</h3>
                <p className="text-xs text-muted-foreground">Auditoria posterior e síntese unificada</p>
              </div>
              {agents[mestre.key]?.content ? (
                <ExpandedView
                  title="MESTRE — SÍNTESE ESTRATÉGICA"
                  label="Tela maior"
                  description="Visualização ampliada da síntese do Mestre."
                >
                  <AgentBody agent={agents[mestre.key]} expanded />
                </ExpandedView>
              ) : (
                <Button variant="outline" size="sm" disabled className="text-xs opacity-60">
                  <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
                  Tela maior
                </Button>
              )}
            </div>
            <CardContent className="p-4">
              <AgentBody agent={agents[mestre.key]} />
              <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-border/20">
                {agents[mestre.key]?.content ? (
                  <ExpandedView
                    title="MESTRE — SÍNTESE ESTRATÉGICA"
                    label="Ver em tela maior"
                    description="Visualização ampliada da síntese do Mestre."
                  >
                    <AgentBody agent={agents[mestre.key]} expanded />
                  </ExpandedView>
                ) : (
                  <Button variant="outline" size="sm" disabled className="text-xs opacity-60">
                    <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
                    Ver em tela maior
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy('mestre', agents[mestre.key]?.content ?? '')}
                  disabled={!agents[mestre.key]?.content}
                  className="text-xs"
                >
                  {copiedAgent === 'mestre' ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                  {copiedAgent === 'mestre' ? 'Copiado' : 'COPIAR'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {orientador && (
        <div>
          <h2 className="text-sm font-bold text-foreground mb-3 tracking-wide">
            8. ORIENTADOR — REVISOR INDEPENDENTE
          </h2>
          <AgentCard
            title={orientador.label}
            subtitle={orientador.subtitle}
            agent={agents[orientador.key]}
            onCopy={() => handleCopy(orientador.key, agents[orientador.key]?.content ?? '')}
            copied={copiedAgent === orientador.key}
          />
        </div>
      )}

      {analysisCompleted && analysisId && <ConversationTable key={analysisId} analysisId={analysisId} />}
    </div>
  )
}

function getAgentStatusLabel(status: AgentResult['status']): string {
  switch (status) {
    case 'waiting': return 'AGUARDANDO RODADA'
    case 'running': return 'PROCESSANDO...'
    case 'done': return 'CONCLUÍDO'
    case 'error': return 'ERRO'
  }
}

function getAgentStatusColor(status: AgentResult['status']): string {
  switch (status) {
    case 'waiting': return 'text-muted-foreground'
    case 'running': return 'text-info'
    case 'done': return 'text-success'
    case 'error': return 'text-destructive'
  }
}

function AgentBody({ agent, expanded = false }: { agent?: AgentResult; expanded?: boolean }) {
  const current = agent ?? { status: 'waiting' as const, content: '' }
  return (
    <>
      <p className={`text-xs font-medium mb-2 ${getAgentStatusColor(current.status)}`}>
        {current.status === 'running' && <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />}
        {getAgentStatusLabel(current.status)}
      </p>
      <div
        className={`text-sm bg-input border border-border rounded-md min-h-[150px] p-3 whitespace-pre-wrap leading-relaxed ${
          expanded ? 'min-h-[400px]' : 'max-h-[320px] overflow-y-auto'
        }`}
      >
        {current.content || <span className="text-muted-foreground"> </span>}
      </div>
    </>
  )
}

function AgentCard({
  title,
  subtitle,
  agent,
  onCopy,
  copied,
}: {
  title: string
  subtitle?: string
  agent?: AgentResult
  onCopy: () => void
  copied: boolean
}) {
  const displayTitle = subtitle ? `${title} — ${subtitle}` : title
  return (
    <Card className="border-border/50 flex flex-col h-full">
      <div className="bg-surface-2 px-4 py-2.5 flex items-center justify-between gap-2 border-b border-border/40">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-foreground truncate" title={title}>{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        </div>
        {agent?.content ? (
          <ExpandedView
            title={displayTitle}
            label="Tela maior"
            description={`Visualização completa e ampliada de ${displayTitle}.`}
          >
            <AgentBody agent={agent} expanded />
          </ExpandedView>
        ) : (
          <Button variant="outline" size="sm" disabled className="text-xs opacity-60">
            <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
            Tela maior
          </Button>
        )}
      </div>
      <CardContent className="p-4 flex-1 flex flex-col justify-between">
        <AgentBody agent={agent} />
        <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-border/20">
          {agent?.content ? (
            <ExpandedView
              title={displayTitle}
              label="Ver em tela maior"
              description={`Visualização completa e ampliada de ${displayTitle}.`}
            >
              <AgentBody agent={agent} expanded />
            </ExpandedView>
          ) : (
            <Button variant="outline" size="sm" disabled className="text-xs opacity-60">
              <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
              Ver em tela maior
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onCopy}
            disabled={!agent?.content}
            className="text-xs"
          >
            {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
            {copied ? 'Copiado' : 'COPIAR'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
