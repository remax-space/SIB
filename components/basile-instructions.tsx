'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

type Settings = { content: string; version: string; canEdit: boolean }
export function BasileInstructions() {
  const [saved, setSaved] = useState<Settings | null>(null), [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [restore, setRestore] = useState(false)
  const dirty = !!saved && draft !== saved.content
  async function load() {
    setBusy(true); setError('')
    try { const res = await fetch('/api/settings/basile'); const data = await res.json(); if (!res.ok) throw new Error(data.error); setSaved(data); setDraft(data.content) }
    catch { setError('Não foi possível carregar. Tente novamente.') } finally { setBusy(false) }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [])
  useEffect(() => { const prevent = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }; window.addEventListener('beforeunload', prevent); return () => window.removeEventListener('beforeunload', prevent) }, [dirty])
  async function save(reset = false) {
    if (!saved) return
    setBusy(true); setError(''); setNotice('')
    try {
      const res = await fetch('/api/settings/basile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: saved.version, ...(reset ? { restore: true } : { content: draft }) }) })
      const data = await res.json(); if (!res.ok) throw new Error(data.error)
      setSaved(data); setDraft(data.content); setNotice(reset ? 'Padrão restaurado para novas análises.' : 'Instruções salvas para novas análises.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar. Tente novamente.') } finally { setBusy(false) }
  }
  return <Card><CardHeader><CardTitle>Método Basile</CardTitle></CardHeader><CardContent className="space-y-4">
    <p className="text-sm text-muted-foreground">Estas instruções orientam novas análises de todos os usuários desta instalação.</p>
    {saved ? <><label htmlFor="basile-instructions" className="block text-sm font-medium">Instruções padrão</label>
      <Textarea id="basile-instructions" value={draft} onChange={e => setDraft(e.target.value)} readOnly={!saved.canEdit} disabled={busy} rows={9} maxLength={12000} aria-describedby="basile-help" aria-invalid={!!error} />
      <p id="basile-help" className="text-xs text-muted-foreground">20 a 12.000 caracteres. Resultados anteriores permanecem inalterados.</p>
      <p role="status" className="text-sm">{dirty ? 'Alterações não salvas' : notice}</p>
      {saved.canEdit ? <div className="flex flex-wrap gap-2"><Button onClick={() => save()} disabled={busy || !dirty || draft.trim().length < 20}>Salvar</Button><Button variant="outline" disabled={busy || !dirty} onClick={() => { setDraft(saved.content); setError('') }}>Cancelar alterações</Button><Button variant="ghost" disabled={busy} onClick={() => setRestore(true)}>Restaurar padrão</Button></div> : <p className="text-sm">Somente administradores podem alterar estas instruções.</p>}
    </> : <Button variant="outline" disabled={busy} onClick={load}>{busy ? 'Carregando…' : 'Tentar novamente'}</Button>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <AlertDialog open={restore} onOpenChange={setRestore}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Restaurar as instruções padrão?</AlertDialogTitle><AlertDialogDescription>O texto personalizado e as alterações não salvas serão substituídos. Apenas novas análises usarão o padrão original.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Manter texto</AlertDialogCancel><AlertDialogAction onClick={() => save(true)}>Restaurar padrão</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </CardContent></Card>
}
