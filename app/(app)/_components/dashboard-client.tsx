'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { FadeIn } from '@/components/ui/animate'
import { Upload, X, Play, AlertTriangle, Copy, Check, Loader2 } from 'lucide-react'
import { SIB_VERSION } from '@/lib/constants'

const MISSION_DEFAULT = 'Investigue, audite e conclua este PDF pelo Método Basile: fatos, provas, cronologia, contradições, lacunas, tese, contratese, riscos e resistência judicial. Ao final, indique objetivamente a melhor conduta do operador, sem inventar dados e sem usar memória como prova.'

interface AgentResult {
  status: 'waiting' | 'running' | 'done' | 'error'
  content: string
  raw?: any
}

export function DashboardClient() {
  // Form state
  const [caseId, setCaseId] = useState('')
  const [clientName, setClientName] = useState('')
  const [complement, setComplement] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [pdfName, setPdfName] = useState('')
  
  // Case/corpus status
  const [caseStatus, setCaseStatus] = useState('PENDENTE')
  const [corpusStatus, setCorpusStatus] = useState('SEM ARQUIVO')
  const [clientStatus, setClientStatus] = useState('PENDENTE')
  
  // Analysis state
  const [isRunning, setIsRunning] = useState(false)
  const [basile, setBasile] = useState<AgentResult>({ status: 'waiting', content: '' })
  const [advocado, setAdvogado] = useState<AgentResult>({ status: 'waiting', content: '' })
  const [cabeca, setCabeca] = useState<AgentResult>({ status: 'waiting', content: '' })
  const [mestre, setMestre] = useState<AgentResult>({ status: 'waiting', content: '' })
  const [analysisId, setAnalysisId] = useState<string | null>(null)
  const [pendencias, setPendencias] = useState<string[]>([])
  
  // Copied state
  const [copiedAgent, setCopiedAgent] = useState<string | null>(null)
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  const checkPendencias = useCallback(() => {
    const p: string[] = []
    if (!caseId.trim()) p.push('Processo / Case ID não informado')
    if (!pdfFile && corpusStatus === 'SEM ARQUIVO') p.push('PDF / Corpus não adicionado')
    if (!clientName.trim()) p.push('Nome do cliente não informado')
    setPendencias(p)
    return p
  }, [caseId, pdfFile, corpusStatus, clientName])

  const handleAddPdf = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setPdfFile(file)
      setPdfName(file.name)
      setCorpusStatus(file.name)
    }
  }

  const handleClearFields = () => {
    setCaseId('')
    setClientName('')
    setComplement('')
    setPdfFile(null)
    setPdfName('')
    setCaseStatus('PENDENTE')
    setCorpusStatus('SEM ARQUIVO')
    setClientStatus('PENDENTE')
    setBasile({ status: 'waiting', content: '' })
    setAdvogado({ status: 'waiting', content: '' })
    setCabeca({ status: 'waiting', content: '' })
    setMestre({ status: 'waiting', content: '' })
    setAnalysisId(null)
    setPendencias([])
    setIsRunning(false)
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
    const p = checkPendencias()
    if (p.length > 0) return
    if (!pdfFile) return

    setIsRunning(true)
    setBasile({ status: 'running', content: '' })
    setAdvogado({ status: 'waiting', content: '' })
    setCabeca({ status: 'waiting', content: '' })
    setMestre({ status: 'waiting', content: '' })

    try {
      // 1. Create case
      setCaseStatus('CRIANDO...')
      const caseRes = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: caseId.trim(),
          title: caseId.trim(),
          clientName: clientName.trim(),
          classText: 'Ação de Conhecimento',
          primaryRole: 'ACAO_CONHECIMENTO',
          status: 'ATIVO',
        }),
      })
      const caseData = await caseRes.json()
      if (!caseRes.ok) throw new Error(caseData?.error ?? 'Erro ao criar caso')
      setCaseStatus('ATIVO')
      setClientStatus(clientName.trim())

      // 2. Upload PDF  
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

      // Upload file content
      if (uploadData.uploadUrl) {
        await fetch(uploadData.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': pdfFile.type || 'application/pdf' },
          body: pdfFile,
        })
      }

      // Complete upload
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

      // 3. Extract text
      setCorpusStatus('EXTRAINDO TEXTO...')
      const extractRes = await fetch(`/api/documents/${documentId}/extract`, {
        method: 'POST',
      })
      if (!extractRes.ok) {
        setCorpusStatus(pdfFile.name + ' (texto não extraído)')
      } else {
        setCorpusStatus(pdfFile.name + ' ✓ (texto extraído)')
      }

      // 4. Run analysis via SSE
      const mission = MISSION_DEFAULT + (complement.trim() ? '\n\nCOMPLEMENTO DO OPERADOR: ' + complement.trim() : '')
      
      const analysisRes = await fetch('/api/analysis/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: caseData.id,
          missionLiteral: mission,
          provider: 'openai',
          runMode: 'COMPLETA',
          documentIds: [documentId],
        }),
      })

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
              
              if (event.status === 'agent_start') {
                if (event.agent === 'basile') setBasile(prev => ({ ...prev, status: 'running' }))
                if (event.agent === 'advocado') setAdvogado(prev => ({ ...prev, status: 'running' }))
                if (event.agent === 'cabeca') setCabeca(prev => ({ ...prev, status: 'running' }))
                if (event.agent === 'mestre') setMestre(prev => ({ ...prev, status: 'running' }))
              }
              
              if (event.status === 'agent_complete') {
                // Fetch the latest analysis to get results
                if (newAnalysisId) {
                  const aRes = await fetch(`/api/analysis/${newAnalysisId}`)
                  const aData = await aRes.json()
                  
                  if (event.agent === 'basile' && aData.basileResult) {
                    setBasile({ status: 'done', content: formatAgentOutput(aData.basileResult), raw: aData.basileResult })
                  }
                  if (event.agent === 'advocado' && aData.advocadoResult) {
                    setAdvogado({ status: 'done', content: formatAgentOutput(aData.advocadoResult), raw: aData.advocadoResult })
                  }
                  if (event.agent === 'cabeca' && aData.cabecaResult) {
                    setCabeca({ status: 'done', content: formatAgentOutput(aData.cabecaResult), raw: aData.cabecaResult })
                  }
                  if (event.agent === 'mestre' && aData.mestreResult) {
                    setMestre({ status: 'done', content: formatAgentOutput(aData.mestreResult), raw: aData.mestreResult })
                  }
                }
              }
              
              if (event.status === 'error') {
                setBasile(prev => prev.status === 'running' ? { ...prev, status: 'error', content: event.message } : prev)
                setAdvogado(prev => prev.status === 'running' ? { ...prev, status: 'error', content: event.message } : prev)
                setCabeca(prev => prev.status === 'running' ? { ...prev, status: 'error', content: event.message } : prev)
                setMestre(prev => prev.status === 'running' ? { ...prev, status: 'error', content: event.message } : prev)
              }
            } catch { /* parse error, skip */ }
          }
        }
      }
    } catch (err: any) {
      console.error('Execution error:', err)
      setBasile(prev => prev.status === 'running' ? { status: 'error', content: err?.message ?? 'Erro' } : prev)
    } finally {
      setIsRunning(false)
    }
  }

  function formatAgentOutput(data: any): string {
    if (!data) return ''
    if (typeof data === 'string') return data
    if (data.raw_text) return data.raw_text
    try {
      return JSON.stringify(data, null, 2)
    } catch {
      return String(data)
    }
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
      case 'running': return 'text-cyan-400'
      case 'done': return 'text-emerald-400'
      case 'error': return 'text-red-400'
    }
  }

  return (
    <div className="space-y-6">
      <FadeIn>
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            SISTEMA INTELIGÊNCIA JURÍDICA BASILE
          </h1>
          <p className="text-sm text-cyan-400 mt-1">
            Fluxo direto: processo + PDF/corpus + missão → Dr. Basile → Advogado do Diabo → Cabeça do Juiz → MESTRE.
          </p>
        </div>
      </FadeIn>

      {/* Main Form Card */}
      <Card className="border-border/50">
        <CardContent className="p-5 space-y-4">
          {/* Row 1: Process ID + PDF + Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 items-start">
            <div>
              <label className="text-xs font-bold text-foreground tracking-wide mb-1.5 block">PROCESSO / CASE ID</label>
              <Input
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                placeholder="Ex: 5000001-01.2026.8.09.0000"
                className="font-mono text-sm bg-input border-border"
                disabled={isRunning}
              />
              <p className="text-xs mt-1 text-muted-foreground">
                CASO: <span className={caseStatus === 'ATIVO' ? 'text-emerald-400' : 'text-muted-foreground'}>{caseStatus}</span>
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
                CORPUS: <span className={corpusStatus === 'SEM ARQUIVO' ? 'text-muted-foreground' : 'text-emerald-400'}>{corpusStatus}</span>
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
                disabled={isRunning}
                className="bg-[#16304f] text-slate-100 hover:bg-[#1c3b60] border border-[#24456b] font-bold text-xs tracking-wide"
              >
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                ADICIONAR PDF
              </Button>
              <Button
                onClick={handleClearFields}
                disabled={isRunning}
                className="bg-[#16304f] text-slate-100 hover:bg-[#1c3b60] border border-[#24456b] font-bold text-xs tracking-wide"
              >
                <X className="w-3.5 h-3.5 mr-1.5" />
                LIMPAR CAMPOS
              </Button>
            </div>
          </div>

          {/* Row 2: Client Name */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div>
              <label className="text-xs font-bold text-foreground tracking-wide mb-1.5 block">
                NOME DO CLIENTE — ENTER PARA CADASTRAR /
              </label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                onKeyDown={handleClientKeyDown}
                placeholder="Digite o nome do cliente e pressione Enter"
                className="text-sm bg-input border-border"
                disabled={isRunning}
              />
            </div>
            <div className="flex items-end h-full pb-1">
              <p className="text-xs text-muted-foreground">
                CLIENTE/CAIXA: <span className={clientStatus === 'PENDENTE' ? 'text-muted-foreground' : 'text-emerald-400'}>{clientStatus}</span>
                {clientStatus === 'PENDENTE' && <span className="text-muted-foreground"> — após adicionar o PDF, informe o cliente e pressione ENTER.</span>}
              </p>
            </div>
          </div>

          {/* Row 3: Mission + Execute */}
          <div>
            <label className="text-xs font-bold text-foreground tracking-wide mb-1.5 block">
              MISSÃO PADRÃO DO MÉTODO BASILE — FIXA
            </label>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
              <Textarea
                value={MISSION_DEFAULT}
                readOnly
                className="text-sm bg-input border-border min-h-[80px] resize-none"
              />
              <div className="flex items-center">
                <Button
                  onClick={handleExecutarRodada}
                  disabled={isRunning}
                  size="lg"
                  className="bg-[#16304f] text-slate-100 hover:bg-[#1c3b60] border border-[#24456b] font-bold text-sm tracking-wide h-full min-h-[80px] px-8"
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

          {/* Row 4: Complement + Pendencias */}
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
                className="bg-[#16304f] text-slate-100 hover:bg-[#1c3b60] border border-[#24456b] font-bold text-xs tracking-wide h-[60px] px-6"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                PENDÊNCIAS ACIMA
              </Button>
            </div>
          </div>

          {/* Pendencias Alert */}
          {pendencias.length > 0 && (
            <div className="bg-[#16304f]/40 border border-[#24456b] rounded-lg p-3">
              <p className="text-xs font-bold text-slate-100 mb-1">PENDÊNCIAS IDENTIFICADAS:</p>
              <ul className="text-xs text-slate-300 space-y-0.5">
                {pendencias.map((p, i) => (
                  <li key={i}>• {p}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 6: Results - Three Independent Analyses */}
      <div>
        <h2 className="text-sm font-bold text-foreground mb-3 tracking-wide">
          6. RESULTADOS DA RODADA — TRÊS ANÁLISES INDEPENDENTES
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* DR. BASILE */}
          <AgentCard
            title="DR. BASILE"
            agent={basile}
            onCopy={() => handleCopy('basile', basile.content)}
            copied={copiedAgent === 'basile'}
          />
          {/* ADVOGADO DO DIABO */}
          <AgentCard
            title="ADVOGADO DO DIABO"
            agent={advocado}
            onCopy={() => handleCopy('advocado', advocado.content)}
            copied={copiedAgent === 'advocado'}
          />
          {/* CABEÇA DO JUIZ */}
          <AgentCard
            title="CABEÇA DO JUIZ"
            agent={cabeca}
            onCopy={() => handleCopy('cabeca', cabeca.content)}
            copied={copiedAgent === 'cabeca'}
          />
        </div>
      </div>

      {/* Section 7: MESTRE Conclusion */}
      <div>
        <h2 className="text-sm font-bold text-foreground mb-3 tracking-wide">
          7. CONCLUSÃO DO MESTRE — AUDITORIA POSTERIOR À TRÍADE
        </h2>
        <Card className="border-primary/30">
          <div className="bg-primary/20 px-4 py-2">
            <h3 className="text-sm font-bold text-primary">MESTRE — SÍNTESE ESTRATÉGICA</h3>
          </div>
          <CardContent className="p-4">
            <p className={`text-xs font-medium mb-2 ${getAgentStatusColor(mestre.status)}`}>
              {mestre.status === 'running' && <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />}
              {getAgentStatusLabel(mestre.status)}
            </p>
            <Textarea
              value={mestre.content}
              readOnly
              className="text-xs bg-input border-border min-h-[200px] font-mono resize-y"
              placeholder="Aguardando conclusão do MESTRE..."
            />
            <div className="flex justify-end mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy('mestre', mestre.content)}
                disabled={!mestre.content}
                className="text-xs"
              >
                {copiedAgent === 'mestre' ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                COPIAR
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function AgentCard({ title, agent, onCopy, copied }: {
  title: string
  agent: AgentResult
  onCopy: () => void
  copied: boolean
}) {
  const statusLabel = (() => {
    switch (agent.status) {
      case 'waiting': return 'AGUARDANDO RODADA'
      case 'running': return 'PROCESSANDO...'
      case 'done': return 'CONCLUÍDO'
      case 'error': return 'ERRO'
    }
  })()

  const statusColor = (() => {
    switch (agent.status) {
      case 'waiting': return 'text-muted-foreground'
      case 'running': return 'text-cyan-400'
      case 'done': return 'text-emerald-400'
      case 'error': return 'text-red-400'
    }
  })()

  return (
    <Card className="border-border/50">
      <div className="bg-[#1a3050] px-4 py-2">
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
      </div>
      <CardContent className="p-4">
        <p className={`text-xs font-medium mb-2 ${statusColor}`}>
          {agent.status === 'running' && <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />}
          {statusLabel}
        </p>
        <Textarea
          value={agent.content}
          readOnly
          className="text-xs bg-input border-border min-h-[150px] font-mono resize-y"
          placeholder=""
        />
        <div className="flex justify-center mt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCopy}
            disabled={!agent.content}
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
