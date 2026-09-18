'use client'

import { ConversationTable } from '@/components/conversation-table'
import type { Evidence } from '@/lib/research/contracts'

import { LegalResearch } from '@/components/legal-research'
import { LegawConnection } from '@/components/legaw-connection'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { PageHeader } from '@/components/layouts/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, KeyRound, Lock, CheckCircle2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { LimparButton } from '@/components/limpar-button'
import { JurisprudenciaResult } from '@/components/jurisprudencia-result'

const PROVIDERS = [
  { value: 'escavador', label: 'Escavador' },
  { value: 'jusbrasil', label: 'Jusbrasil' },
  { value: 'digesto', label: 'Digesto' },
  { value: 'codilo', label: 'Codilo' },
  { value: 'datajud', label: 'DataJud CNJ' },
  { value: 'outro', label: 'Outro provedor' },
]

export function JurisprudenciaClient() {
  const searchParams = useSearchParams()
  const [evidence, setEvidence] = useState<Evidence | null>(null)
  const [selectedAnalysis, setSelectedAnalysis] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [cfg, setCfg] = useState<any>(null)
  const [loadingCfg, setLoadingCfg] = useState(true)
  const [saving, setSaving] = useState(false)

  // form
  const [provider, setProvider] = useState('escavador')
  const [endpoint, setEndpoint] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [enabled, setEnabled] = useState(false)

  // consulta
  const [analyses, setAnalyses] = useState<any[]>([])
  const [selectedId, setSelectedId] = useState(() => searchParams.get('analysisId') ?? '')
  const [selectedCaseId, setSelectedCaseId] = useState('')
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    fetch('/api/jurisprudencia/config')
      .then(async (r) => {
        if (r.status === 403 || r.status === 401) { setIsAdmin(false); return null }
        setIsAdmin(true)
        return r.json()
      })
      .then((data) => {
        if (data) {
          setCfg(data)
          setProvider(data.provider || 'escavador')
          setEndpoint(data.endpoint || '')
          setEnabled(!!data.enabled)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingCfg(false))

    fetch('/api/stats')
      .then((r) => r.json())
      .then((data) => {
        const list = (data?.recentAnalyses ?? []).filter((a: any) => a?.status === 'CONCLUIDO')
        setAnalyses(list)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedId) return
    let active = true
    fetch('/api/analysis/' + selectedId).then(r => r.json()).then(a => { if (active) { setSelectedAnalysis(a); setSelectedCaseId(a.caseId ?? ''); setResult(a.jurisprudenciaResult ?? null) } }).catch(() => {})
    return () => { active = false }
  }, [selectedId])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/jurisprudencia/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, endpoint, enabled, ...(apiKey.trim() ? { apiKey } : {}) }),
      })
      if (res.ok) {
        const data = await res.json()
        setCfg(data)
        setApiKey('')
        toast.success('Configuração salva')
      } else {
        toast.error('Erro ao salvar configuração')
      }
    } catch {
      toast.error('Erro ao salvar configuração')
    } finally {
      setSaving(false)
    }
  }

  const connected = !!cfg?.hasKey && !!cfg?.enabled

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jurisprudência"
        description="Prepare, revise e confirme pesquisas jurídicas. Consulte o histórico e escolha as fontes para interpretação."
        actions={
          <LimparButton
            confirmMessage="Deseja limpar a consulta e o resultado exibidos?"
            onClear={() => { setSelectedId(''); setSelectedCaseId(''); setSelectedAnalysis(null); setEvidence(null); setResult(null) }}
          />
        }
      />

      <LegawConnection />
      {/* Status do gate */}
      <Card className={connected ? 'border-success/40' : 'border-warning/40'}>
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg shrink-0 ${connected ? 'bg-success/10' : 'bg-warning/10'}`}>
              {connected ? <CheckCircle2 className="w-5 h-5 text-success" /> : <Lock className="w-5 h-5 text-warning" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                {connected ? 'Provedor legado de jurisprudência conectado' : 'Aguardando provedor legado de jurisprudência'}
              </h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {connected
                  ? 'A configuração legada está disponível para consultas explícitas. Ela é separada da integração Legaw e não dispara pesquisas automaticamente.'
                  : 'A arquitetura está pronta. Provedores legados (Escavador, Jusbrasil, Digesto, Codilo etc.) exigem configuração administrativa; cada consulta passa pela preparação e confirmação explícita. A Legaw usa a conexão MCP administrada no painel acima.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuração (somente admin) */}
      {!loadingCfg && isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2"><KeyRound className="w-4 h-4 text-primary" /> Conexão da Base de Jurisprudência (Administrador)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Provedor contratado</Label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="w-full h-10 rounded-md bg-background border border-border px-3 text-sm"
                >
                  {PROVIDERS.map((p) => (<option key={p.value} value={p.value}>{p.label}</option>))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Endpoint / Base URL da API (opcional)</Label>
                <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://api.provedor.com/v1/jurisprudencia" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Chave de API {cfg?.hasKey && <span className="text-success">(uma chave já está cadastrada; o valor não é exibido)</span>}</Label>
              <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={cfg?.hasKey ? 'Deixe em branco para manter a chave atual' : 'Cole aqui a chave da API contratada'} />
            </div>
            <div className="flex items-center gap-2">
              <input id="enabled" type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-4 h-4 accent-primary" />
              <Label htmlFor="enabled" className="text-xs cursor-pointer">Ativar pesquisa de jurisprudência real</Label>
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Salvar configuração
            </Button>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Informe o endpoint HTTPS oficial do provedor contratado. O servidor envia a consulta com autenticação e só analisa o texto retornado pela base. Sem chave, endpoint e ativação, o sistema não inventa precedentes.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Consulta jurisprudencial sobre uma análise */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Search className="w-4 h-4 text-primary" /> Consultar Jurisprudência de uma Análise</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Análise concluída (preparação e histórico compartilhados)</Label>
            <select
              value={selectedId}
              onChange={(e) => {
                const id = e.target.value
                setSelectedId(id)
                setEvidence(null); setSelectedAnalysis(null); setResult(null)
                const a = analyses.find((x: any) => x?.id === id)
                setSelectedCaseId(a?.caseId ?? '')
              }}
              className="w-full h-10 rounded-md bg-background border border-border px-3 text-sm"
            >
              <option value="">Selecione uma análise concluída...</option>
              {analyses.map((a: any) => (
                <option key={a?.id} value={a?.id}>{(a?.case?.caseId ?? '')} — {(a?.case?.title ?? 'Caso')}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {selectedId && <LegalResearch key={`research-${selectedId}`} analysisId={selectedId} onEvidence={setEvidence} />}
      {selectedAnalysis?.status === 'CONCLUIDO' && <ConversationTable key={`conversation-${selectedId}`} analysisId={selectedId} initialTurns={selectedAnalysis.conversation ?? []} evidence={evidence} />}
      {/* Resultado */}
      {result && (
        <JurisprudenciaResult
          result={result}
          caseHref={selectedCaseId && selectedId ? `/casos/${selectedCaseId}/analise/${selectedId}` : undefined}
        />
      )}
    </div>
  )
}
