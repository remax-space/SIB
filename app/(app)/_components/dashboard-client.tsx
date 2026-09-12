'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { FadeIn } from '@/components/ui/animate'
import { Upload, X, Play, AlertTriangle, Copy, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { AGENTS, DEFAULT_MISSION, LEGAL_CLASSES, SIB_VERSION } from '@/lib/constants'
import { formatAgentOutput } from '@/lib/format-agent-output'
import { putUploadedFile } from '@/lib/upload-file'
import { extractCnjFromText, type PdfCaseMetadataField } from '@/lib/pdf-case-metadata'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

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
  const [caseId, setCaseId] = useState('')
  const [clientName, setClientName] = useState('')
  const [legalClass, setLegalClass] = useState('ACAO_CONHECIMENTO')
  const [complement, setComplement] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfName, setPdfName] = useState('')

  const [caseStatus, setCaseStatus] = useState('PENDENTE')
  const [corpusStatus, setCorpusStatus] = useState('SEM ARQUIVO')
  const [clientStatus, setClientStatus] = useState('PENDENTE')

  const [isRunning, setIsRunning] = useState(false)
  const [agents, setAgents] = useState<Record<string, AgentResult>>(emptyAgents)
  const [analysisId, setAnalysisId] = useState<string | null>(null)
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null)
  const [pendencias, setPendencias] = useState<string[]>([])
  const [copiedAgent, setCopiedAgent] = useState<string | null>(null)
  const [readingPdf, setReadingPdf] = useState(false)
  const [metaModalOpen, setMetaModalOpen] = useState(false)
  const [metaMissing, setMetaMissing] = useState<PdfCaseMetadataField[]>([])
  const [manualCaseId, setManualCaseId] = useState('')
  const [manualClientName, setManualClientName] = useState('')
  const [manualLegalClass, setManualLegalClass] = useState('ACAO_CONHECIMENTO')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const legalClassTouchedRef = useRef(false)

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
    if (!caseId.trim()) pending.push('Processo / Case ID não informado')
    if (!pdfFile && corpusStatus === 'SEM ARQUIVO') pending.push('PDF / Corpus não adicionado')
    if (!clientName.trim()) pending.push('Nome do cliente não informado')
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
    const nextCaseId = current.caseId.trim() || found.caseId?.trim() || ''
    const nextClientName = current.clientName.trim() || found.clientName?.trim() || ''
    const nextLegalClass = found.legalClass?.trim() || ''

    if (nextCaseId) setCaseId(nextCaseId)
    if (nextClientName) {
      setClientName(nextClientName)
      setClientStatus(nextClientName)
    }
    if (nextLegalClass) {
      setLegalClass(nextLegalClass)
      legalClassTouchedRef.current = true
    }

    const missing: PdfCaseMetadataField[] = []
    if (!nextCaseId) missing.push('caseId')
    if (!nextClientName) missing.push('clientName')
    if (!nextLegalClass && !current.legalClassTouched) missing.push('legalClass')

    if (missing.length > 0) {
      setManualCaseId(nextCaseId)
      setManualClientName(nextClientName)
      setManualLegalClass(nextLegalClass || 'ACAO_CONHECIMENTO')
      setMetaMissing(missing)
      setMetaModalOpen(true)
    } else {
      toast.success('Dados do PDF preenchidos automaticamente.')
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setPdfFile(file)
    setPdfName(file.name)
    setCorpusStatus('LENDO PDF...')
    setReadingPdf(true)

    const fromName = extractCnjFromText(file.name)
    if (fromName && !caseId.trim()) setCaseId(fromName)

    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/documents/preview-metadata', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data?.error ?? 'Não foi possível ler o PDF.')
        applyExtractedMetadata({ caseId: fromName }, {
          caseId,
          clientName,
          legalClassTouched: legalClassTouchedRef.current,
        })
        setCorpusStatus(file.name)
        return
      }

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

  const handleConfirmManualMetadata = () => {
    if (metaMissing.includes('caseId') && !manualCaseId.trim()) {
      toast.error('Informe o número do processo.')
      return
    }
    if (metaMissing.includes('clientName') && !manualClientName.trim()) {
      toast.error('Informe o nome do cliente.')
      return
    }
    if (metaMissing.includes('legalClass') && !manualLegalClass.trim()) {
      toast.error('Informe a classe processual.')
      return
    }

    if (manualCaseId.trim()) setCaseId(manualCaseId.trim())
    if (manualClientName.trim()) {
      setClientName(manualClientName.trim())
      setClientStatus(manualClientName.trim())
    }
    if (manualLegalClass.trim()) {
      setLegalClass(manualLegalClass)
      legalClassTouchedRef.current = true
    }
    setMetaModalOpen(false)
    toast.success('Dados do processo confirmados.')
  }

  const handleClearFields = () => {
    setCaseId('')
    setClientName('')
    setLegalClass('ACAO_CONHECIMENTO')
    setComplement('')
    setPdfFile(null)
    setPdfName('')
    setCaseStatus('PENDENTE')
    setCorpusStatus('SEM ARQUIVO')
    setClientStatus('PENDENTE')
    setAgents(emptyAgents())
    setAnalysisId(null)
    setCreatedCaseId(null)
    setPendencias([])
    setIsRunning(false)
    setReadingPdf(false)
    setMetaModalOpen(false)
    setMetaMissing([])
    setManualCaseId('')
    setManualClientName('')
    setManualLegalClass('ACAO_CONHECIMENTO')
    legalClassTouchedRef.current = false
  }

  const handleClientKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && clientName.trim()) {
      setClientStatus(clientName.trim())
    }
  }

  const handleCopy = async (agent: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedAgent(agent)
      setTimeout(() => setCopiedAgent(null), 2000)
    } catch { /* ignore */ }
  }

  const handleExecutarRodada = async () => {
    const pending = checkPendencias()
    if (pending.length > 0) return
    if (!pdfFile) return

    const classDef = LEGAL_CLASSES.find((item) => item.value === legalClass)
    setIsRunning(true)
    setAgents(Object.fromEntries(
      AGENTS.map((agent) => [agent.key, { status: agent.key === 'basile' ? 'running' : 'waiting', content: '' }])
    ))

    try {
      setCaseStatus('CRIANDO...')
      const caseRes = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: caseId.trim(),
          title: caseId.trim(),
          clientName: clientName.trim(),
          classText: classDef?.label ?? 'Ação de Conhecimento (genérica)',
          primaryRole: classDef?.role ?? 'ACAO_CONHECIMENTO',
          status: 'ATIVO',
        }),
      })
      const caseData = await caseRes.json()
      if (!caseRes.ok) throw new Error(caseData?.error ?? 'Erro ao criar caso')
      setCaseStatus('ATIVO')
      setClientStatus(clientName.trim())
      setCreatedCaseId(caseData.id)

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
      const documentId = completeData.id
      setCorpusStatus(pdfFile.name + ' ✓')

      setCorpusStatus('EXTRAINDO TEXTO...')
      const extractRes = await fetch(`/api/documents/${documentId}/extract`, {
        method: 'POST',
      })
      if (!extractRes.ok) {
        setCorpusStatus(pdfFile.name + ' (texto não extraído)')
      } else {
        setCorpusStatus(pdfFile.name + ' ✓ (texto extraído)')
      }

      const mission = DEFAULT_MISSION + (complement.trim() ? '\n\nCOMPLEMENTO DO OPERADOR: ' + complement.trim() : '')

      const analysisRes = await fetch('/api/analysis/run', {
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
    } catch (err: any) {
      console.error('Execution error:', err)
      updateAgent('basile', (prev) =>
        prev.status === 'running' ? { status: 'error', content: err?.message ?? 'Erro' } : prev
      )
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
          <p className="text-xs text-muted-foreground mt-1 font-mono">{SIB_VERSION}</p>
        </div>
      </FadeIn>

      <Card className="border-border/50">
        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 items-start">
            <div>
              <label className="text-xs font-bold text-foreground tracking-wide mb-1.5 block">PROCESSO / CASE ID</label>
              <Input
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                placeholder="Ex: 5000001-01.2026.8.09.0000"
                className="font-mono text-sm bg-input border-border"
                disabled={isRunning || readingPdf}
              />
              <p className="text-xs mt-1 text-muted-foreground">
                CASO: <span className={caseStatus === 'ATIVO' ? 'text-success' : 'text-muted-foreground'}>{caseStatus}</span>
              </p>
            </div>
            <div>
              <label className="text-xs font-bold text-foreground tracking-wide mb-1.5 block">PDF / CORPUS AUTORIZADO</label>
              <Input
                value={pdfName}
                readOnly
                placeholder="Nenhum arquivo selecionado"
                className="text-sm bg-input border-border cursor-default"
              />
              <p className="text-xs mt-1 text-muted-foreground">
                CORPUS: <span className={corpusStatus === 'SEM ARQUIVO' || corpusStatus === 'LENDO PDF...' ? 'text-muted-foreground' : 'text-success'}>{corpusStatus}</span>
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
                {readingPdf ? 'LENDO PDF...' : 'ADICIONAR PDF'}
              </Button>
              <Button
                onClick={handleClearFields}
                disabled={isRunning || readingPdf}
                className="bg-nav text-nav-foreground hover:bg-nav-hover border border-nav-border font-bold text-xs tracking-wide"
              >
                <X className="w-3.5 h-3.5 mr-1.5" />
                LIMPAR CAMPOS
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div>
              <label className="text-xs font-bold text-foreground tracking-wide mb-1.5 block">
                NOME DO CLIENTE — ENTER PARA CADASTRAR
              </label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                onKeyDown={handleClientKeyDown}
                placeholder="Digite o nome do cliente e pressione Enter"
                className="text-sm bg-input border-border"
                disabled={isRunning || readingPdf}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-foreground tracking-wide mb-1.5 block">CLASSE PROCESSUAL</label>
              <select
                value={legalClass}
                onChange={(e) => {
                  legalClassTouchedRef.current = true
                  setLegalClass(e.target.value)
                }}
                disabled={isRunning || readingPdf}
                className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm"
              >
                {LEGAL_CLASSES.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
              <p className="text-xs mt-1 text-muted-foreground">
                CLIENTE/CAIXA: <span className={clientStatus === 'PENDENTE' ? 'text-muted-foreground' : 'text-success'}>{clientStatus}</span>
              </p>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-foreground tracking-wide mb-1.5 block">
              MISSÃO PADRÃO DO MÉTODO BASILE — FIXA
            </label>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
              <Textarea
                value={DEFAULT_MISSION}
                readOnly
                className="text-sm bg-input border-border min-h-[80px] resize-none"
              />
              <div className="flex items-center">
                <Button
                  onClick={handleExecutarRodada}
                  disabled={isRunning || readingPdf}
                  size="lg"
                  className="bg-nav text-nav-foreground hover:bg-nav-hover border border-nav-border font-bold text-sm tracking-wide h-full min-h-[80px] px-8"
                >
                  {isRunning ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />EXECUTANDO...</>
                  ) : (
                    <><Play className="w-4 h-4 mr-2" />EXECUTAR RODADA</>
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
            <div>
              <label className="text-xs font-bold text-foreground tracking-wide mb-1.5 block">
                COMPLEMENTO OPCIONAL DO OPERADOR
              </label>
              <Textarea
                value={complement}
                onChange={(e) => setComplement(e.target.value)}
                placeholder="Instruções adicionais para esta rodada..."
                className="text-sm bg-input border-border min-h-[60px]"
                disabled={isRunning}
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => checkPendencias()}
                className="bg-nav text-nav-foreground hover:bg-nav-hover border border-nav-border font-bold text-xs tracking-wide h-[60px] px-6"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                PENDÊNCIAS ACIMA
              </Button>
            </div>
          </div>

          {pendencias.length > 0 && (
            <div className="bg-nav/40 border border-nav-border rounded-lg p-3">
              <p className="text-xs font-bold text-nav-foreground mb-1">PENDÊNCIAS IDENTIFICADAS:</p>
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

      <div>
        <h2 className="text-sm font-bold text-foreground mb-3 tracking-wide">
          6. RESULTADOS DA RODADA — TRÍADE INDEPENDENTE
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {triad.map((agent) => (
            <AgentCard
              key={agent.key}
              title={agent.label}
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
            agent={agents[auditor.key]}
            onCopy={() => handleCopy(auditor.key, agents[auditor.key]?.content ?? '')}
            copied={copiedAgent === auditor.key}
          />
        </div>
      )}

      {mestre && (
        <div>
          <h2 className="text-sm font-bold text-foreground mb-3 tracking-wide">
            7. CONCLUSÃO DO MESTRE — AUDITORIA POSTERIOR À TRÍADE
          </h2>
          <Card className="border-primary/30">
            <div className="bg-primary/20 px-4 py-2">
              <h3 className="text-sm font-bold text-primary">MESTRE — SÍNTESE ESTRATÉGICA</h3>
            </div>
            <CardContent className="p-4">
              <AgentBody agent={agents[mestre.key]} />
              <div className="flex justify-end mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy('mestre', agents[mestre.key]?.content ?? '')}
                  disabled={!agents[mestre.key]?.content}
                  className="text-xs"
                >
                  {copiedAgent === 'mestre' ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                  COPIAR
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
            agent={agents[orientador.key]}
            onCopy={() => handleCopy(orientador.key, agents[orientador.key]?.content ?? '')}
            copied={copiedAgent === orientador.key}
          />
        </div>
      )}

      <Dialog open={metaModalOpen} onOpenChange={setMetaModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Completar dados do PDF</DialogTitle>
            <DialogDescription>
              Alguns dados não foram encontrados automaticamente. Informe manualmente para continuar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {metaMissing.includes('caseId') && (
              <div>
                <label className="text-xs font-bold text-foreground tracking-wide mb-1.5 block">
                  NÚMERO DO PROCESSO
                </label>
                <Input
                  value={manualCaseId}
                  onChange={(e) => setManualCaseId(e.target.value)}
                  placeholder="Ex: 5000001-01.2026.8.09.0000"
                  className="font-mono text-sm"
                  autoFocus
                />
              </div>
            )}
            {metaMissing.includes('clientName') && (
              <div>
                <label className="text-xs font-bold text-foreground tracking-wide mb-1.5 block">
                  NOME DO CLIENTE
                </label>
                <Input
                  value={manualClientName}
                  onChange={(e) => setManualClientName(e.target.value)}
                  placeholder="Nome da parte / cliente"
                  className="text-sm"
                  autoFocus={!metaMissing.includes('caseId')}
                />
              </div>
            )}
            {metaMissing.includes('legalClass') && (
              <div>
                <label className="text-xs font-bold text-foreground tracking-wide mb-1.5 block">
                  CLASSE PROCESSUAL
                </label>
                <select
                  value={manualLegalClass}
                  onChange={(e) => setManualLegalClass(e.target.value)}
                  className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm"
                >
                  {LEGAL_CLASSES.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMetaModalOpen(false)}>
              Depois
            </Button>
            <Button onClick={handleConfirmManualMetadata}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function AgentBody({ agent }: { agent?: AgentResult }) {
  const current = agent ?? { status: 'waiting' as const, content: '' }
  return (
    <>
      <p className={`text-xs font-medium mb-2 ${getAgentStatusColor(current.status)}`}>
        {current.status === 'running' && <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />}
        {getAgentStatusLabel(current.status)}
      </p>
      <div className="text-sm bg-input border border-border rounded-md min-h-[150px] max-h-[320px] overflow-y-auto p-3 whitespace-pre-wrap leading-relaxed">
        {current.content || <span className="text-muted-foreground"> </span>}
      </div>
    </>
  )
}

function AgentCard({ title, agent, onCopy, copied }: {
  title: string
  agent?: AgentResult
  onCopy: () => void
  copied: boolean
}) {
  return (
    <Card className="border-border/50">
      <div className="bg-surface-2 px-4 py-2">
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
      </div>
      <CardContent className="p-4">
        <AgentBody agent={agent} />
        <div className="flex justify-center mt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCopy}
            disabled={!agent?.content}
            className="text-xs"
          >
            {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
            COPIAR
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
