'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export type ProcessSummary = {
  id: string
  caseId?: string
  title?: string
  clientName?: string
  _count?: { documents?: number; analyses?: number }
  documents?: unknown[]
  analyses?: unknown[]
  deletionStatus?: string
}

export type CaseDeleteResult = {
  id: string
  status: 'deleted' | 'already_absent' | 'blocked' | 'failed'
  message?: string
  retryable?: boolean
}

function countFor(process: ProcessSummary, kind: 'documents' | 'analyses') {
  const count = process._count?.[kind]
  if (typeof count === 'number') return count
  return Array.isArray(process[kind]) ? process[kind]!.length : 0
}

export function DeleteCaseDialog({
  processes,
  open,
  onOpenChange,
  onResult,
}: {
  processes: ProcessSummary[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onResult?: (result: { completedIds: string[]; remainingIds: string[]; results: CaseDeleteResult[] }) => void
}) {
  const [processing, setProcessing] = useState(false)
  const isBulk = processes.length > 1
  const totals = useMemo(() => ({
    documents: processes.reduce((total, item) => total + countFor(item, 'documents'), 0),
    analyses: processes.reduce((total, item) => total + countFor(item, 'analyses'), 0),
  }), [processes])

  async function confirmDeletion(event: React.MouseEvent) {
    event.preventDefault()
    if (processing || processes.length === 0) return
    setProcessing(true)
    try {
      const response = isBulk
        ? await fetch('/api/cases/bulk-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: processes.map(process => process.id) }),
          })
        : await fetch(`/api/cases/${processes[0]!.id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error ?? 'Não foi possível excluir o processo')

      const results: CaseDeleteResult[] = isBulk
        ? (Array.isArray(data.results) ? data.results : [])
        : [{ id: processes[0]!.id, status: data.status === 'already_absent' ? 'already_absent' : 'deleted' }]
      const completedIds = results.filter(item => item.status === 'deleted' || item.status === 'already_absent').map(item => item.id)
      const remainingIds = results.filter(item => item.status === 'blocked' || item.status === 'failed').map(item => item.id)
      onResult?.({ completedIds, remainingIds, results })

      const summary = data.summary ?? {
        deleted: results.filter(item => item.status === 'deleted').length,
        alreadyAbsent: results.filter(item => item.status === 'already_absent').length,
        blocked: results.filter(item => item.status === 'blocked').length,
        failed: results.filter(item => item.status === 'failed').length,
      }
      if (summary.failed || summary.blocked) {
        toast.error(`${summary.deleted + summary.alreadyAbsent} concluído(s); ${summary.failed + summary.blocked} pendente(s). Você pode tentar novamente.`)
      } else if (summary.alreadyAbsent) {
        toast.success(`${summary.deleted} processo(s) excluído(s); ${summary.alreadyAbsent} já não estava(m) disponível(is).`)
      } else {
        toast.success(`${summary.deleted} processo(s) excluído(s) definitivamente.`)
      }
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível concluir a exclusão')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={value => { if (!processing) onOpenChange(value) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isBulk ? 'Excluir processos selecionados' : 'Excluir processo'}</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação é definitiva e não pode ser desfeita. Serão removidos o processo, os documentos e arquivos originais, textos extraídos, análises, resultados e registros vinculados.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="font-medium text-destructive">{isBulk ? `${processes.length} processos serão excluídos` : 'O processo será excluído definitivamente'}</p>
            <p className="mt-1 text-muted-foreground">Documentos: {totals.documents} · Análises: {totals.analyses}</p>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-3" aria-label="Processos selecionados">
            {processes.map(process => (
              <div key={process.id} className="min-w-0">
                <p className="truncate font-mono text-xs text-primary">{process.caseId ?? process.id}</p>
                <p className="truncate text-xs text-muted-foreground">{process.title || 'Sem título'}{process.clientName ? ` · ${process.clientName}` : ''}</p>
              </div>
            ))}
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={processing}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmDeletion}
            disabled={processing}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {processing ? 'Excluindo…' : isBulk ? 'Excluir processos' : 'Excluir processo'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
