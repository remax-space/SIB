'use client'

import { useState } from 'react'
import { MessageSquare, Send, Loader2, Download, Feather } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

type Turn = { id: string; agent: string; message: string; content: string; createdAt: string }
const participants = [
  { id: 'mestre', label: 'Mestre', detail: 'Estratégia e decisões' },
  { id: 'orientador', label: 'Orientador', detail: 'Revisão crítica' },
  { id: 'jurisprudencia', label: 'Jurisprudência', detail: 'Precedentes da base conectada' },
  { id: 'peca', label: 'Elaborar peça', detail: 'Minuta a partir das deliberações' },
]

export function ConversationTable({ analysisId, initialTurns = [] }: { analysisId: string; initialTurns?: Turn[] }) {
  const [turns, setTurns] = useState<Turn[]>(initialTurns)
  const [agent, setAgent] = useState('mestre')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  function download(text: string, filename: string) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url)
  }
  async function send() {
    if (busy || !message.trim()) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/analysis/${analysisId}/conversation`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent, message, revision: turns.length }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Não foi possível enviar.')
      setTurns(data.conversation); setMessage('')
    } catch (error) { setError(error instanceof Error ? error.message : 'Falha de conexão.') }
    finally { setBusy(false) }
  }
  return (
    <Card className="border-primary/25 overflow-hidden" id="mesa-de-conversacao">
      <CardHeader className="bg-primary/5 border-b border-border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg"><MessageSquare className="h-5 w-5 text-primary" />Mesa de conversação</CardTitle>
          {turns.length > 0 && <Button variant="outline" size="sm" onClick={() => download(turns.map((turn) => `OPERADOR\n${turn.message}\n\n${participants.find((p) => p.id === turn.agent)?.label}\n${turn.content}`).join('\n\n────────\n\n'), 'mesa-de-conversacao.txt')}><Download className="mr-2 h-4 w-4" />Exportar conversa</Button>}
        </div>
        <p className="text-sm text-muted-foreground">Análise concluída. Você conduz a discussão, chama os especialistas e define a peça a elaborar.</p>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2" aria-label="Participante da mesa">
          {participants.map((participant) => <button key={participant.id} type="button" disabled={busy} aria-pressed={agent === participant.id} onClick={() => setAgent(participant.id)} className={`rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${agent === participant.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}><span className="block text-sm font-semibold">{participant.label}</span><span className="block mt-1 text-xs text-muted-foreground">{participant.detail}</span></button>)}
        </div>
        <div className="space-y-4 max-h-[620px] overflow-y-auto" role="log" aria-label="Histórico da mesa" aria-live="polite">
          {turns.length === 0 && <div className="rounded-xl border border-dashed p-6 text-center"><MessageSquare className="mx-auto mb-3 h-7 w-7 text-primary/60" /><p className="text-sm font-medium">Da conclusão à decisão do operador</p><p className="mt-1 text-sm text-muted-foreground">Selecione um participante e faça sua primeira pergunta. O histórico fica salvo nesta análise.</p></div>}
          {turns.map((turn) => <div key={turn.id} className="space-y-3"><div className="ml-4 rounded-xl bg-primary/10 p-4"><p className="text-xs font-semibold text-primary mb-2">OPERADOR</p><p className="text-sm whitespace-pre-wrap break-words">{turn.message}</p></div><div className="rounded-xl border p-4"><div className="flex items-center justify-between gap-2 mb-3"><p className="text-xs font-semibold uppercase">{participants.find((p) => p.id === turn.agent)?.label}</p>{turn.agent === 'peca' && <Button size="sm" variant="ghost" onClick={() => download(turn.content, `minuta-${turn.id}.txt`)}><Download className="h-4 w-4 mr-2" />Baixar minuta</Button>}</div><p className="text-sm leading-7 whitespace-pre-wrap break-words">{turn.content}</p></div></div>)}
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void send() }} className="space-y-3 border-t pt-4">
          <label htmlFor="mesa-message" className="block text-sm font-medium">{agent === 'peca' ? 'Instruções para a peça' : `Chamar ${participants.find((p) => p.id === agent)?.label}`}</label>
          <Textarea id="mesa-message" value={message} onChange={(event) => setMessage(event.target.value)} disabled={busy} maxLength={6000} rows={4} placeholder={agent === 'peca' ? 'Indique a peça, a parte representada, os pedidos e as decisões que devem orientar a minuta…' : 'Pergunte, confronte uma conclusão ou solicite uma revisão…'} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{busy ? 'Preparando a resposta. Aguarde…' : 'Somente o participante escolhido será chamado.'}</p><Button type="submit" disabled={busy || !message.trim()}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : agent === 'peca' ? <Feather className="h-4 w-4 mr-2" /> : <Send className="h-4 w-4 mr-2" />}{agent === 'peca' ? 'Elaborar minuta' : 'Chamar participante'}</Button></div>
        </form>
      </CardContent>
    </Card>
  )
}
