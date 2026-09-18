'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/layouts/page-header'
import { ConversationTable } from '@/components/conversation-table'

export function CaseConversationClient({ caseId }: { caseId: string }) {
  const [caseData, setCaseData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    fetch(`/api/cases/${caseId}`)
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'Caso não encontrado.'); return data })
      .then(setCaseData)
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o processo.'))
      .finally(() => setLoading(false))
  }, [caseId])
  const analysis = useMemo(() => {
    const concluded = (caseData?.analyses ?? []).filter((item: any) => item?.status === 'CONCLUIDO')
    return concluded.find((item: any) => Array.isArray(item?.conversation) && item.conversation.length > 0) ?? concluded[0] ?? null
  }, [caseData])
  if (loading) return <p className="text-muted-foreground">Carregando conversa do processo...</p>
  if (error || !caseData) return <p className="text-destructive">{error || 'Caso não encontrado.'}</p>
  return <div className="space-y-6"><PageHeader title="Conversa do processo" description={`${caseData.caseId} • ${caseData.title ?? ''} • ${caseData.clientName ?? ''}`} actions={<Link href={`/casos/${caseId}`}><Button variant="ghost" size="sm"><ArrowLeft className="mr-1 h-4 w-4" />Voltar ao processo</Button></Link>} />
    {analysis ? <><Card className="border-primary/20"><CardContent className="p-4 flex items-start gap-3"><MessageSquare className="mt-0.5 h-5 w-5 text-primary" /><div><p className="text-sm font-medium">Mesa contextualizada</p><p className="mt-1 text-sm text-muted-foreground">Histórico da análise selecionada. As respostas consideram o processo, os documentos e as conclusões já registradas.</p></div></CardContent></Card><ConversationTable key={analysis.id} analysisId={analysis.id} initialTurns={analysis.conversation ?? []} /></> : <Card><CardContent className="p-8 text-center"><MessageSquare className="mx-auto mb-3 h-10 w-10 text-muted-foreground" /><p className="font-medium">Ainda não há uma análise concluída para este processo.</p><p className="mt-1 text-sm text-muted-foreground">Conclua uma análise para liberar a conversa com as IAs e preservar o histórico.</p><Link href={`/casos/${caseId}/analise/nova`}><Button className="mt-4">Iniciar análise</Button></Link></CardContent></Card>}
  </div>
}
