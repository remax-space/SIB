'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/layouts/page-header'
import { Compass, Loader2 } from 'lucide-react'
import { PublicResult } from '@/components/public-result'
import type { PublicResult as Result } from '@/lib/public-result'
import { LimparButton } from '@/components/limpar-button'

export function OrientacoesClient() {
  const [analyses, setAnalyses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((data) => {
        const list = (data?.recentAnalyses ?? []).filter((a: any) => a?.orientacoesResult)
        setAnalyses(list)
        setLoading(false)
      })
      .catch((e) => {
        console.error(e)
        setLoading(false)
      })
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="ORIENTADOR"
        description="Revisor Independente — controle autônomo de erro de análise jurídica sobre a conclusão do MESTRE"
        actions={
          <LimparButton
            confirmMessage="Deseja limpar a lista de revisões exibida?"
            onClear={() => setAnalyses([])}
          />
        }
      />

      {/* Revisões independentes recentes */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Compass className="w-4 h-4 text-primary" /> Revisões Independentes Recentes
        </h2>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando revisões...
          </div>
        )}

        {!loading && analyses.length === 0 && (
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">
                Ainda não há revisões independentes. Elas são geradas automaticamente ao final de cada análise completa —
                o Revisor Independente examina a conclusão do MESTRE em busca de erros de análise jurídica.
              </p>
            </CardContent>
          </Card>
        )}

        {!loading && analyses.map((a: any) => {
          const ori = a?.orientacoesResult as Result | null
          return (
            <Card key={a?.id} variant="interactive">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-sm">
                    {a?.case?.caseId ?? ''} • {a?.case?.title ?? 'Caso'}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {ori && <PublicResult result={ori} />}

                <Link
                  href={`/casos/${a?.caseId}/analise/${a?.id}`}
                  className="inline-block text-xs text-primary hover:underline"
                >
                  Ver análise completa →
                </Link>
              </CardContent>
            </Card>
          )
        })}
      </div>

    </div>
  )
}
