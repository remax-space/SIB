'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/layouts/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { FadeIn } from '@/components/ui/animate'
import { DeleteCaseDialog, type ProcessSummary } from '@/components/case-delete-dialog'
import { Plus, Search, Briefcase, FileText, Brain, FolderOpen, Trash2, List, Users, RotateCw } from 'lucide-react'
import { CASE_STATUSES } from '@/lib/constants'

type Process = ProcessSummary & { status?: string; classText?: string }

function ProcessRow({ process, selected, onSelect, onDelete }: { process: Process; selected: boolean; onSelect: (checked: boolean) => void; onDelete: () => void }) {
  const statusDef = CASE_STATUSES?.find((status: any) => status?.value === process.status)
  const deleting = process.deletionStatus === 'EM_ANDAMENTO'
  return (
    <Card className="hover:border-primary/30">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Checkbox checked={selected} onCheckedChange={value => onSelect(value === true)} disabled={deleting} aria-label={`Selecionar processo ${process.caseId ?? process.id}`} className="mt-1" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/casos/${process.id}`} className="font-mono text-xs text-primary hover:underline">{process.caseId ?? process.id}</Link>
              {deleting ? <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning-foreground">Exclusão pendente</span> : process.deletionStatus === 'FALHA_LIMPEZA' ? <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">Falha na exclusão — tente novamente</span> : <span className={`rounded-full px-2 py-0.5 text-xs ${statusDef?.color ?? ''}`}>{statusDef?.label ?? process.status}</span>}
            </div>
            <h3 className="mt-1 truncate font-medium">{process.title || 'Sem título'}</h3>
            <p className="truncate text-sm text-muted-foreground">{process.clientName || 'Sem cliente'}{process.classText ? ` · ${process.classText}` : ''}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex"><span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" />{process._count?.documents ?? 0}</span><span className="flex items-center gap-1"><Brain className="h-3.5 w-3.5" />{process._count?.analyses ?? 0}</span></div>
            <Button variant="ghost" size="icon-sm" onClick={onDelete} disabled={deleting} aria-label={`Excluir processo ${process.caseId ?? process.id}`} title="Excluir processo"><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        </div>
        <div className="mt-2 flex gap-3 text-xs text-muted-foreground sm:hidden"><span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" />{process._count?.documents ?? 0} documentos</span><span className="flex items-center gap-1"><Brain className="h-3.5 w-3.5" />{process._count?.analyses ?? 0} análises</span></div>
      </CardContent>
    </Card>
  )
}

export function CasosClient() {
  const searchParams = useSearchParams()
  const [processes, setProcesses] = useState<Process[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')
  const [grouped, setGrouped] = useState(() => searchParams.get('view') === 'grouped')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [dialogProcesses, setDialogProcesses] = useState<Process[]>([])
  const requestNumber = useRef(0)

  const loadProcesses = useCallback(async () => {
    const requestId = ++requestNumber.current
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams(); if (filterStatus) params.set('status', filterStatus)
      const response = await fetch(`/api/cases?${params.toString()}`, { cache: 'no-store' })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error ?? 'Não foi possível carregar os processos')
      if (requestId !== requestNumber.current) return
      setProcesses(Array.isArray(data) ? data : [])
    } catch (reason) {
      if (requestId === requestNumber.current) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os processos')
    } finally { if (requestId === requestNumber.current) setLoading(false) }
  }, [filterStatus])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadProcesses() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadProcesses])

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) return processes
    return processes.filter(process => [process.caseId, process.title, process.clientName].some(value => String(value ?? '').toLocaleLowerCase().includes(query)))
  }, [processes, search])
  const visibleIds = filtered.map(process => process.id)
  const selectedVisible = visibleIds.filter(id => selectedIds.has(id))
  const allVisibleSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length
  const someVisibleSelected = selectedVisible.length > 0 && !allVisibleSelected
  const selectedProcesses = processes.filter(process => selectedIds.has(process.id))
  const groupedProcesses = useMemo(() => {
    const result = new Map<string, Process[]>()
    for (const process of filtered) { const key = process.clientName?.trim() || 'Sem cliente'; result.set(key, [...(result.get(key) ?? []), process]) }
    return [...result.entries()].sort(([left], [right]) => left.localeCompare(right, 'pt-BR'))
  }, [filtered])

  function setSelected(id: string, checked: boolean) { setSelectedIds(current => { const next = new Set(current); if (checked) next.add(id); else next.delete(id); return next }) }
  function selectVisible(checked: boolean) { setSelectedIds(current => { const next = new Set(current); visibleIds.forEach(id => { if (checked) next.add(id); else next.delete(id) }); return next }) }
  function handleDeleteResult(result: { completedIds: string[]; remainingIds: string[] }) { setProcesses(current => current.filter(process => !result.completedIds.includes(process.id))); setSelectedIds(new Set(result.remainingIds)); void loadProcesses() }

  return (
    <div className="space-y-6">
      <FadeIn><PageHeader title="Processos" description="Gerencie processos, documentos, análises e agrupamentos por cliente" actions={<Link href="/casos/novo"><Button size="sm"><Plus className="mr-1 h-4 w-4" />Novo processo</Button></Link>} /></FadeIn>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] max-w-sm flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Buscar por número, título ou cliente…" value={search} onChange={event => { setSearch(event.target.value); setSelectedIds(new Set()) }} className="pl-10" /></div>
        <select value={filterStatus} onChange={event => { setFilterStatus(event.target.value); setSelectedIds(new Set()) }} aria-label="Filtrar por status" className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"><option value="">Todos os status</option>{CASE_STATUSES?.map((status: any) => <option key={status.value} value={status.value}>{status.label}</option>)}</select>
        <div className="flex rounded-lg border border-border p-1" aria-label="Visualização"><Button type="button" size="sm" variant={!grouped ? 'secondary' : 'ghost'} onClick={() => setGrouped(false)} aria-pressed={!grouped}><List className="h-4 w-4" />Lista</Button><Button type="button" size="sm" variant={grouped ? 'secondary' : 'ghost'} onClick={() => setGrouped(true)} aria-pressed={grouped}><Users className="h-4 w-4" />Por cliente</Button></div>
      </div>
      {selectedIds.size > 0 && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3" role="region" aria-label="Ações da seleção"><span className="text-sm font-medium">{selectedIds.size} selecionado(s)</span><Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Limpar seleção</Button><Button size="sm" variant="destructive" onClick={() => setDialogProcesses(selectedProcesses)}><Trash2 className="h-4 w-4" />Excluir selecionados</Button></div>}
      {loading ? <p className="text-sm text-muted-foreground">Carregando processos…</p> : error ? <Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center"><p className="text-destructive">{error}</p><Button variant="outline" onClick={() => void loadProcesses()}><RotateCw className="h-4 w-4" />Tentar novamente</Button></CardContent></Card> : filtered.length === 0 ? <Card><CardContent className="py-12 text-center"><Briefcase className="mx-auto mb-3 h-12 w-12 text-muted-foreground" /><p className="text-muted-foreground">{search ? 'Nenhum processo corresponde à busca.' : 'Nenhum processo encontrado.'}</p><Link href="/casos/novo"><Button size="sm" className="mt-4"><Plus className="mr-1 h-4 w-4" />Criar primeiro processo</Button></Link></CardContent></Card> : (
        <div className="space-y-3"><div className="flex items-center gap-2 px-1 text-xs text-muted-foreground"><Checkbox checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false} onCheckedChange={value => selectVisible(value === true)} aria-label="Selecionar todos os processos exibidos" /><span>Selecionar todos os processos exibidos ({filtered.length})</span></div>{!grouped ? filtered.map(process => <ProcessRow key={process.id} process={process} selected={selectedIds.has(process.id)} onSelect={checked => setSelected(process.id, checked)} onDelete={() => setDialogProcesses([process])} />) : groupedProcesses.map(([client, clientProcesses]) => <Card key={client}><div className="flex items-center gap-2 border-b border-border/60 bg-primary/10 px-4 py-3"><FolderOpen className="h-4 w-4 text-primary" /><h3 className="text-sm font-bold text-primary">{client}</h3><span className="ml-auto text-xs text-muted-foreground">{clientProcesses.length} processo(s)</span></div><CardContent className="space-y-2 p-3">{clientProcesses.map(process => <ProcessRow key={process.id} process={process} selected={selectedIds.has(process.id)} onSelect={checked => setSelected(process.id, checked)} onDelete={() => setDialogProcesses([process])} />)}</CardContent></Card>)}</div>
      )}
      <DeleteCaseDialog processes={dialogProcesses} open={dialogProcesses.length > 0} onOpenChange={open => { if (!open) setDialogProcesses([]) }} onResult={result => { handleDeleteResult(result); setDialogProcesses([]) }} />
    </div>
  )
}
