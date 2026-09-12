'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/layouts/page-header'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Database, Search, ExternalLink, Info, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type DatajudHit = {
  numeroProcesso?: string
  tribunal?: string
  classe?: { nome?: string }
  assuntos?: Array<{ nome?: string }>
  orgaoJulgador?: { nome?: string }
  dataAjuizamento?: string
  grau?: string
  movimentos?: Array<{ dataHora?: string; nome?: string }>
}

export function DatajudClient() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [waitingKey, setWaitingKey] = useState(false)
  const [result, setResult] = useState<{ consulta?: { raw: string; alias: string }; total?: number; processos?: DatajudHit[] } | null>(null)

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    setWaitingKey(false)
    setResult(null)
    try {
      const res = await fetch('/api/datajud/consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero: query.trim() }),
      })
      const data = await res.json()
      if (data?.status === 'aguardando_chave') {
        setWaitingKey(true)
        return
      }
      if (!res.ok) {
        toast.error(data?.error || 'Erro na consulta DataJud')
        return
      }
      setResult(data)
      if ((data?.processos?.length ?? 0) === 0) {
        toast.message('Nenhum processo público encontrado para este número.')
      }
    } catch {
      toast.error('Erro na consulta DataJud')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="DATAJUD CNJ"
        description="Consulta autenticada à API pública da Base Nacional de Dados do Poder Judiciário"
      />

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-info shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-foreground">Consulta ao DataJud — Base Nacional de Dados do Poder Judiciário</p>
              <p className="text-xs text-muted-foreground mt-1">
                Informe o número único do processo. A consulta é feita no servidor, com a chave DATAJUD_API_KEY, e devolve apenas dados públicos do tribunal correspondente.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Número do processo (ex: 5000001-01.2026.8.09.0000)"
                className="pl-10 font-mono"
                disabled={loading}
              />
            </div>
            <Button onClick={handleSearch} disabled={loading} className="font-bold text-xs tracking-wide">
              {loading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Database className="w-4 h-4 mr-1.5" />}
              CONSULTAR
            </Button>
          </div>

          {waitingKey && (
            <div className="p-4 rounded-lg bg-warning/10 border border-warning/30">
              <p className="text-sm text-warning">
                A chave da API pública do DataJud ainda não está no ambiente do servidor. Cadastre DATAJUD_API_KEY e reinicie o app.
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ExternalLink className="w-3 h-3" />
            <a href="https://datajud-wiki.cnj.jus.br/" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
              Documentação oficial DataJud CNJ
            </a>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Resultado {result.consulta?.raw ? `• ${result.consulta.raw}` : ''} {result.consulta?.alias ? `• ${result.consulta.alias.toUpperCase()}` : ''}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(result.processos?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum registro público encontrado.</p>
            ) : (
              result.processos?.map((processo, index) => (
                <div key={`${processo.numeroProcesso ?? index}`} className="p-3 rounded-lg bg-muted/40 space-y-2">
                  <p className="text-sm font-medium font-mono">{processo.numeroProcesso ?? 'Processo sem número'}</p>
                  <p className="text-xs text-muted-foreground">
                    {processo.tribunal ?? 'Tribunal não informado'} • {processo.grau ?? 'grau n/d'} • {processo.classe?.nome ?? 'classe n/d'}
                  </p>
                  {processo.orgaoJulgador?.nome && (
                    <p className="text-xs">Órgão: {processo.orgaoJulgador.nome}</p>
                  )}
                  {processo.dataAjuizamento && (
                    <p className="text-xs text-muted-foreground">Ajuizamento: {processo.dataAjuizamento}</p>
                  )}
                  {(processo.assuntos?.length ?? 0) > 0 && (
                    <p className="text-xs">Assuntos: {processo.assuntos?.map((item) => item.nome).filter(Boolean).join('; ')}</p>
                  )}
                  {(processo.movimentos?.length ?? 0) > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium">Últimas movimentações</p>
                      {(processo.movimentos ?? []).slice(-5).reverse().map((movimento, movimentoIndex) => (
                        <p key={movimentoIndex} className="text-[11px] text-muted-foreground">
                          {movimento.dataHora ?? '—'} — {movimento.nome ?? 'Movimento'}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
