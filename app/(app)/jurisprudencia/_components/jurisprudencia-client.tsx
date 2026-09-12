'use client'

import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/layouts/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Scale, Loader2, KeyRound, Lock, CheckCircle2, Search } from 'lucide-react'
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
  const [selectedId, setSelectedId] = useState('')
  const [selectedCaseId, setSelectedCaseId] = useState('')
  const [queryText, setQueryText] = useState('')
  const [consulting, setConsulting] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [waitingKey, setWaitingKey] = useState(false)

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
        const list = (data?.recentAnalyses ?? []).filter((a: any) => a?.mestreResult)
        setAnalyses(list)
      })
      .catch(() => {})
  }, [])

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

  async function handleConsult() {
    if (!selectedId) { toast.error('Selecione uma análise'); return }
    setConsulting(true)
    setResult(null)
    setWaitingKey(false)
    try {
      const res = await fetch('/api/jurisprudencia/consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId: selectedId, query: queryText }),
      })
      const data = await res.json()
      if (data?.status === 'aguardando_chave') {
        setWaitingKey(true)
      } else if (data?.status === 'ok') {
        setResult(data.jurisprudenciaResult)
        toast.success('Consulta jurisprudencial concluída')
      } else {
        toast.error(data?.error || 'Erro na consulta')
      }
    } catch {
      toast.error('Erro na consulta')
    } finally {
      setConsulting(false)
    }
  }

  const connected = !!cfg?.hasKey && !!cfg?.enabled

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jurisprudência"
        description="Agente autônomo que aplica jurisprudência REAL ao caso, em diálogo com o MESTRE, o CRIADOR e o ORIENTADOR. Nunca inventa precedentes."
        actions={
          <LimparButton
            confirmMessage="Deseja limpar a consulta e o resultado exibidos?"
            onClear={() => { setSelectedId(''); setSelectedCaseId(''); setQueryText(''); setResult(null); setWaitingKey(false) }}
          />
        }
      />

      {/* Status do gate */}
      <Card className={connected ? 'border-success/40' : 'border-warning/40'}>
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg shrink-0 ${connected ? 'bg-success/10' : 'bg-warning/10'}`}>
              {connected ? <CheckCircle2 className="w-5 h-5 text-success" /> : <Lock className="w-5 h-5 text-warning" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                {connected ? 'Base de jurisprudência conectada' : 'Aguardando chave da base de jurisprudência'}
              </h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {connected
                  ? 'A pesquisa de precedentes reais está ativa. O agente só usa resultados retornados pela base contratada.'
                  : 'A arquitetura está pronta. A busca por precedentes reais depende de uma API contratada (Escavador, Jusbrasil, Digesto, Codilo etc.). Assim que a chave for cadastrada por um administrador, o agente passa a pesquisar automaticamente. Enquanto isso, o sistema NUNCA inventa jurisprudência.'}
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
              <Label className="text-xs">Chave de API {cfg?.hasKey && <span className="text-success">(uma chave já está cadastrada: {cfg.keyMasked})</span>}</Label>
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
            <Label className="text-xs">Análise (usa MESTRE + ORIENTADOR + corpus do CRIADOR)</Label>
            <select
              value={selectedId}
              onChange={(e) => {
                const id = e.target.value
                setSelectedId(id)
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
          <div className="space-y-1.5">
            <Label className="text-xs">Termos de pesquisa (opcional — se vazio, usa classe/objetivo/missão)</Label>
            <Input value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="Ex.: prescrição intercorrente execução fiscal" />
          </div>
          <Button onClick={handleConsult} disabled={consulting || !selectedId}>
            {consulting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Scale className="w-4 h-4 mr-2" />} Consultar jurisprudência
          </Button>

          {waitingKey && (
            <div className="p-4 rounded-lg bg-warning/10 border border-warning/30">
              <p className="text-sm text-warning">
                A base de jurisprudência ainda não foi conectada. Cadastre a chave da API contratada (acima, acesso administrador) para ativar a pesquisa de precedentes reais. O sistema não inventa jurisprudência.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

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
