'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/layouts/page-header'
import { Archive, FolderOpen, ArrowRight } from 'lucide-react'

export function CaixasClient() {
  const [cases, setCases] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/cases')
      .then(r => r.json())
      .then(data => setCases(data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const grouped = cases.reduce((acc: Record<string, any[]>, c: any) => {
    const key = c.clientName || 'Sem Cliente'
    if (!acc[key]) acc[key] = []
    acc[key].push(c)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <PageHeader
        title="Caixas Processuais"
        description="Processos agrupados por cliente/caixa"
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : Object.keys(grouped).length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Archive className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhuma caixa processual encontrada.</p>
            <p className="text-sm text-muted-foreground mt-1">Cadastre processos pela página principal.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([client, clientCases]) => (
            <Card key={client}>
              <div className="bg-primary/10 px-4 py-2 flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-primary">{client}</h3>
                <span className="text-[10px] text-muted-foreground ml-auto">{(clientCases as any[]).length} processo(s)</span>
              </div>
              <CardContent className="p-3">
                <div className="space-y-1">
                  {(clientCases as any[]).map((c: any) => (
                    <Link key={c.id} href={`/casos/${c.id}`} className="flex items-center justify-between p-2 rounded hover:bg-accent/50 transition-colors group">
                      <div>
                        <p className="text-xs font-mono text-primary group-hover:underline">{c.caseId}</p>
                        <p className="text-[10px] text-muted-foreground">{c.classText}</p>
                      </div>
                      <ArrowRight className="w-3 h-3 text-muted-foreground group-hover:text-foreground" />
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
