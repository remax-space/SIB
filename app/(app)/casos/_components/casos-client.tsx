'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/layouts/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FadeIn, Stagger, StaggerItem } from '@/components/ui/animate'
import { Plus, Search, Briefcase, FileText, Brain } from 'lucide-react'
import { CASE_STATUSES } from '@/lib/constants'

export function CasosClient() {
  const [cases, setCases] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const params = new URLSearchParams()
    if (filterStatus) params.set('status', filterStatus)
    fetch(`/api/cases?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => setCases(Array.isArray(data) ? data : []))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false))
  }, [filterStatus])

  const filtered = (cases ?? []).filter((c: any) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      c?.caseId?.toLowerCase()?.includes(q) ||
      c?.title?.toLowerCase()?.includes(q) ||
      c?.clientName?.toLowerCase()?.includes(q)
    )
  })

  return (
    <div className="space-y-6">
      <FadeIn>
        <PageHeader
          title="Casos"
          description="Gerencie seus casos jurídicos e processos"
          actions={
            <Link href="/casos/novo">
              <Button size="sm"><Plus className="w-4 h-4 mr-1" />Novo Caso</Button>
            </Link>
          }
        />
      </FadeIn>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número, título ou cliente..."
            value={search}
            onChange={(e: any) => setSearch(e?.target?.value ?? '')}
            className="pl-10"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e: any) => setFilterStatus(e?.target?.value ?? '')}
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground"
        >
          <option value="">Todos os status</option>
          {CASE_STATUSES?.map((s: any) => (
            <option key={s?.value} value={s?.value}>{s?.label}</option>
          )) ?? []}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando casos...</p>
      ) : filtered?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Briefcase className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">Nenhum caso encontrado.</p>
            <Link href="/casos/novo">
              <Button size="sm" className="mt-4"><Plus className="w-4 h-4 mr-1" />Criar Primeiro Caso</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Stagger className="space-y-3">
          {filtered.map((c: any) => {
            const statusDef = CASE_STATUSES?.find((s: any) => s?.value === c?.status);
            return (
              <StaggerItem key={c?.id}>
                <Link href={`/casos/${c?.id}`}>
                  <Card variant="interactive" className="hover:border-primary/30">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs text-primary">{c?.caseId}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${statusDef?.color ?? ''}`}>
                              {statusDef?.label ?? c?.status}
                            </span>
                          </div>
                          <h3 className="font-medium truncate">{c?.title}</h3>
                          <p className="text-sm text-muted-foreground">{c?.clientName} • {c?.classText}</p>
                        </div>
                        <div className="flex gap-4 text-xs text-muted-foreground shrink-0">
                          <div className="flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5" />
                            {c?._count?.documents ?? 0}
                          </div>
                          <div className="flex items-center gap-1">
                            <Brain className="w-3.5 h-3.5" />
                            {c?._count?.analyses ?? 0}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </StaggerItem>
            )
          })}
        </Stagger>
      )}
    </div>
  )
}
