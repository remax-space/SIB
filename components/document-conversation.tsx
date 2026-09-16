'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Loader2, MessageSquare } from 'lucide-react'

type Answer = { content: string; sources?: { page: number; text: string }[] }
export function DocumentConversation({ id, filename, onRead }: { id: string; filename: string; onRead: (status: string, pages: number) => void }) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [turns, setTurns] = useState<{ question: string; answer: Answer }[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function send() {
    if (busy || !message.trim()) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/documents/${id}/conversation`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Falha ao consultar PDF.')
      setTurns((previous) => [...previous, { question: message, answer: data }]); setMessage('')
      if (data.readStatus) onRead(data.readStatus, data.pageCount)
    } catch (error) { setError(error instanceof Error ? error.message : 'Falha de conexão.') }
    finally { setBusy(false) }
  }
  return <>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)} aria-label={`Consultar movimentos de ${filename}`}><MessageSquare className="h-4 w-4 mr-2" />Consultar PDF</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Conversa com o documento</DialogTitle><DialogDescription className="break-all">{filename} · Localize movimentos e consulte a transcrição das páginas.</DialogDescription></DialogHeader>
      <div className="space-y-4" role="log" aria-live="polite">
        {!turns.length && <div className="rounded-xl bg-muted/50 p-5"><p className="text-sm mb-2 font-medium">Como usar</p><p className="text-sm text-muted-foreground">Digite o número do movimento, evento ou página que deseja localizar e transcrever no PDF.</p></div>}
        {turns.map((turn, index) => <div key={index} className="space-y-3"><p className="rounded-lg bg-primary/10 p-3 text-sm whitespace-pre-wrap">{turn.question}</p><p className="text-sm leading-relaxed">{turn.answer.content}</p>{turn.answer.sources?.map((source) => <details key={source.page} className="rounded-lg border p-3" open><summary className="cursor-pointer text-sm font-semibold text-primary">Página {source.page} do PDF · Texto extraído</summary><p className="whitespace-pre-wrap break-words text-sm leading-7 mt-3">{source.text}</p></details>)}</div>)}
      </div>
      <form className="space-y-3 border-t pt-4" onSubmit={(event) => { event.preventDefault(); void send() }}><label htmlFor={`question-${id}`} className="text-sm font-medium">Consulta ao PDF</label><Textarea id={`question-${id}`} placeholder="Informe o movimento, evento ou página que deseja consultar…" value={message} disabled={busy} maxLength={2000} onChange={(event) => setMessage(event.target.value)} />{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit" disabled={busy || !message.trim()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{busy ? 'Lendo o PDF…' : 'Localizar e transcrever'}</Button></form>
    </DialogContent></Dialog>
  </>
}
