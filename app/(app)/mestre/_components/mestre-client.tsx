'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ExpandedView } from '@/components/expanded-view'
import { PublicResult } from '@/components/public-result'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/layouts/page-header'
import { Button } from '@/components/ui/button'
import { getIcpClass, getIcpLabel } from '@/lib/constants'
import { ArrowRight, Brain } from 'lucide-react'
import { LimparButton } from '@/components/limpar-button'

export function MestreClient() {
  const [analyses, setAnalyses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.json())
      .then(data => setAnalyses(data?.recentAnalyses ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sínteses das análises"
        description="Consulte conclusões, ressalvas e próximos passos das análises."
        actions={
          <LimparButton
            confirmMessage="Deseja limpar a lista exibida nesta janela?"
            onClear={() => setAnalyses([])}
          />
        }
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando análises...</p>
      ) : analyses.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Brain className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhuma análise com conclusão do MESTRE ainda.</p>
            <p className="text-sm text-muted-foreground mt-1">Inicie uma análise para consultar as conclusões aqui.</p>
            <Link href="/">
              <Button className="mt-4" size="sm">Iniciar análise</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {analyses.map((a: any) => (
            <Card key={a.id} variant="interactive">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-mono text-primary">{a.case?.title || 'Análise dos documentos'}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Caso: {a.case?.caseId ?? '—'}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    {a.mestreResult && <ExpandedView title="Síntese"><PublicResult result={a.mestreResult} expanded /></ExpandedView>}
                    {a.icpScore != null && (
                      <div className="text-right">
                        <p className={`text-lg font-bold font-mono ${getIcpClass(a.icpScore)}`}>{Number(a.icpScore).toFixed(1)}</p>
                        <p className="text-[10px] text-muted-foreground">{getIcpLabel(a.icpScore)}</p>
                      </div>
                    )}
                    <Link href={`/casos/${a.caseId}/analise/${a.id}`}>
                      <Button variant="ghost" size="sm"><ArrowRight className="w-4 h-4" /></Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
