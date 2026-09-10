'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/layouts/page-header'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Database, Search, ExternalLink, Info } from 'lucide-react'

export function DatajudClient() {
  const [query, setQuery] = useState('')

  const handleSearch = () => {
    if (!query.trim()) return
    window.open('https://datajud-wiki.cnj.jus.br/', '_blank')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="DATAJUD CNJ"
        description="Integração com o banco de dados do Conselho Nacional de Justiça"
      />

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-info shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-foreground">Consulta ao DataJud — Base Nacional de Dados do Poder Judiciário</p>
              <p className="text-xs text-muted-foreground mt-1">
                Pesquise processos, movimentações e dados públicos dos tribunais brasileiros.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Número do processo (ex: 5000001-01.2026.8.09.0000)"
                className="pl-10 font-mono"
              />
            </div>
            <Button onClick={handleSearch} className="font-bold text-xs tracking-wide">
              <Database className="w-4 h-4 mr-1.5" />
              CONSULTAR
            </Button>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ExternalLink className="w-3 h-3" />
            <a href="https://datajud-wiki.cnj.jus.br/" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
              Acessar DataJud CNJ diretamente
            </a>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h3 className="text-sm font-bold text-foreground mb-3">APIs Disponíveis</h3>
          <div className="space-y-2">
            {[
              { nome: 'Processos', desc: 'Consulta de processos por número unificado', status: 'Disponível' },
              { nome: 'Movimentações', desc: 'Histórico de movimentações processuais', status: 'Disponível' },
              { nome: 'Partes', desc: 'Informações das partes do processo', status: 'Disponível' },
              { nome: 'Documentos', desc: 'Acesso a documentos públicos', status: 'Restrito' },
            ].map((api, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded bg-muted/30">
                <div>
                  <p className="text-xs font-medium">{api.nome}</p>
                  <p className="text-[10px] text-muted-foreground">{api.desc}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${api.status === 'Disponível' ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>
                  {api.status}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
