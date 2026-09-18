'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type State = { configured: boolean; active: boolean; blockers: string[] }
export function LegawConnection() {
  const [state, setState] = useState<State | null>(null)
  const [authorized, setAuthorized] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    fetch('/api/research/config').then(async r => {
      if (r.status === 401 || r.status === 403) return
      if (!r.ok) throw new Error('Não foi possível carregar a conexão Legaw.')
      const data = await r.json()
      if (live) setState(data)
    }).catch(e => { if (live) setError(e.message) })
    return () => { live = false }
  }, [])
  async function connect(enabled: boolean) {
    setBusy(true); setError('')
    try {
      const r = await fetch('/api/research/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled, sharedUseAuthorized: authorized }) })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error)
      setState(data)
      window.dispatchEvent(new Event('legaw-connection-changed'))
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha na conexão.') }
    finally { setBusy(false) }
  }
  if (!state) return error ? <p role="alert">{error}</p> : null
  return <Card><CardHeader><CardTitle className="text-lg">Conexão MCP — Legaw</CardTitle></CardHeader><CardContent className="space-y-3">
    <p role="status">{state.active ? 'MCP conectado. Cada pesquisa exige confirmação.' : state.configured ? 'Chave configurada no servidor. Conexão desativada.' : 'Chave ainda não configurada no servidor.'}</p>
    <p className="text-sm">Crie sua chave na Legaw em Conexões → Chaves de integração. No servidor do SIB, configure <code>LEGAW_MCP_KEY</code> no arquivo <code>.env</code> ou no gerenciador de segredos da hospedagem e reinicie o serviço.</p>
    <p className="text-xs text-muted-foreground">A chave não é enviada ao navegador nem aos agentes. Conectar verifica o MCP e suas ferramentas, sem executar pesquisa. O histórico é compartilhado entre os usuários autenticados do SIB.</p>
    {!state.active && <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={authorized} onChange={e => setAuthorized(e.target.checked)} />Confirmo que minha conta Legaw autoriza este uso compartilhado e o armazenamento e reutilização dos resultados no SIB.</label>}
    {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
    <Button disabled={busy || (!state.active && (!state.configured || !authorized))} onClick={() => void connect(!state.active)}>{busy ? 'Verificando…' : state.active ? 'Desconectar Legaw' : 'Conectar Legaw'}</Button>
    <p className="text-xs">Para revogar a chave, use Conexões → Chaves de integração na Legaw. Desconectar no SIB bloqueia novas pesquisas e preserva o histórico.</p>
  </CardContent></Card>
}
