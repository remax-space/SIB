'use client'
import { fetchAnalysisStream } from '@/lib/analysis-stream'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/layouts/page-header'
import { PublicResult } from '@/components/public-result'
import { ConversationTable } from '@/components/conversation-table'
import { LegalResearch } from '@/components/legal-research'
import { LimparButton } from '@/components/limpar-button'
import { publicAnalysis, resultFields, resultText, type PublicResult as Result } from '@/lib/public-result'
import type { PublicEvidence as Evidence } from '@/lib/research/public'
import { useRouter } from 'next/navigation'

const labels = ['Documentos e fatos', 'Argumentos contrários', 'Perspectiva judicial', 'Suporte documental', 'Síntese', 'Revisão independente', 'Jurisprudência']
type Analysis = ReturnType<typeof publicAnalysis>
export function AnalysisResultClient({ caseId, analysisId }: { caseId: string; analysisId: string }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null), [error, setError] = useState('')
  const [retry, setRetry] = useState(0), [evidence, setEvidence] = useState<Evidence | null>(null)
  const router = useRouter()
  const [resuming, setResuming] = useState(false)
  async function resumeReading() {
    setResuming(true)
    try {
      const response = await fetchAnalysisStream('/api/analysis/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resumeAnalysisId: analysisId }) })
      if (!response.ok) throw new Error((await response.json()).error)
      setRetry(r => r + 1)
      await response.text()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Falha ao retomar leitura.') }
    finally { setResuming(false); setRetry(r => r + 1) }
  }
  useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout>
    async function load() {
      try {
        const res = await fetch(`/api/analysis/${analysisId}`); const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        if (stopped) return
        setAnalysis(data); setError('')
        if (data.status === 'EM_ANDAMENTO') timer = setTimeout(load, 3000)
      } catch { if (!stopped) setError('Não foi possível carregar o resultado. Tente novamente.') }
    }
    void load(); return () => { stopped = true; clearTimeout(timer) }
  }, [analysisId, retry])
  const results = resultFields.map((field, index) => ({ field, label: labels[index], result: analysis?.[field] as Result | null })).filter(item => item.result)
  const main = results.find(r => r.field === 'mestreResult') ?? results[0]
  const exportText = results.map(r => `${r.label}\n\n${resultText(r.result!)}`).join('\n\n────────\n\n')
  async function copy() { try { await navigator.clipboard.writeText(exportText); toast.success('Resultado copiado com fontes e ressalvas.') } catch { toast.error('Não foi possível copiar. Use Exportar resultado.') } }
  function download() {
    const url = URL.createObjectURL(new Blob([exportText], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'analise-basile.txt'; a.click(); URL.revokeObjectURL(url)
  }
  return <div className="space-y-6 max-w-4xl mx-auto">
    <PageHeader title="Resultado da análise" description={analysis?.case.title || undefined} actions={<Link href={`/casos/${caseId}`}><Button variant="outline">Voltar ao caso</Button></Link>} />
    {error && <div role="alert"><p>{error}</p><Button onClick={() => setRetry(r => r + 1)} variant="outline">Tentar novamente</Button></div>}
    {!analysis && !error && <p role="status">Carregando análise…</p>}
    {analysis && <>
      <p role="status" className="text-sm">{analysis.status === 'EM_ANDAMENTO' ? 'Análise em andamento. Os resultados disponíveis aparecem abaixo.' : analysis.status === 'ERRO' ? 'A análise foi interrompida. Os resultados disponíveis foram preservados.' : results.some(r => r.result!.state !== 'ready') ? 'Análise finalizada com pontos pendentes. Confira as ressalvas.' : 'Análise finalizada. Confira as fontes antes de usar o resultado.'}</p>
      {analysis.status !== 'CONCLUIDO' && <div className="space-y-2"><Button disabled={resuming} onClick={() => void resumeReading()}>{resuming ? 'Lendo páginas restantes…' : 'Retomar leitura dos documentos'}</Button><p className="text-xs text-muted-foreground">Mantenha esta página aberta para continuar automaticamente. Se a conexão cair, o progresso salvo será retomado.</p></div>}
      {analysis.documentProgress?.map(progress => <p key={progress.agent} className="text-sm">{labels[resultFields.indexOf(`${progress.agent}Result` as typeof resultFields[number])]}: {progress.processed}/{progress.total} páginas processadas.</p>)}
      {analysis.icpScore != null && <p className="text-sm">Índice de suporte documental: <strong>{Number(analysis.icpScore).toFixed(1)}/100</strong>. É uma estimativa sobre os documentos, não uma probabilidade de êxito.</p>}
      {results.length > 0 && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={copy}>Copiar resultado</Button><Button variant="outline" onClick={download}>Exportar resultado</Button></div>}
      {main ? <Card><CardHeader><CardTitle>{main.label}</CardTitle></CardHeader><CardContent><PublicResult result={main.result!} title={main.label} /></CardContent></Card> : <p>Ainda não há resultado disponível.</p>}
      {results.filter(r => r !== main).map(r => <details key={r.field} className="rounded-lg border p-4"><summary className="cursor-pointer font-medium focus-visible:outline focus-visible:outline-2">{r.label}{r.result!.state === 'partial' ? ' — parcial' : ''}</summary><div className="pt-5"><PublicResult result={r.result!} title={r.label} /></div></details>)}
      {analysis.status === 'CONCLUIDO' && <><ConversationTable analysisId={analysisId} initialTurns={analysis.conversation} evidence={evidence} /><details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">Consultar jurisprudência</summary><div className="pt-4"><LegalResearch analysisId={analysisId} onEvidence={setEvidence} /></div></details></>}
      <div className="flex flex-wrap gap-3"><Link href={`/casos/${caseId}/analise/nova`}><Button variant="outline">Iniciar outra análise</Button></Link><LimparButton label="Excluir análise" variant="destructive" confirmMessage="Excluir esta análise e sua conversa? Esta ação não pode ser desfeita." onClear={async () => { const res = await fetch(`/api/analysis/${analysisId}`, { method: 'DELETE' }); if (!res.ok) throw new Error('Não foi possível excluir.'); router.push(`/casos/${caseId}`) }} /></div>
    </>}
  </div>
}
