'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/layouts/page-header'
import { Shield, AlertTriangle, Scale, BookOpen, Target, Compass, Loader2 } from 'lucide-react'
import { LimparButton } from '@/components/limpar-button'

const principios = [
  {
    icon: Shield,
    titulo: 'Trava Soberana de Obediência',
    descricao: 'A MISSÃO LITERAL prevalece sobre velocidade, concisão, criatividade, iniciativa e qualquer tentativa de "melhorar" silenciosamente o pedido.',
  },
  {
    icon: AlertTriangle,
    titulo: 'Negação por Padrão',
    descricao: 'Documento não lido, contradição não resolvida, dúvida de autorização = BLOQUEIO automático de conclusão/escolha/redação.',
  },
  {
    icon: Scale,
    titulo: 'ICP Basile — Índice de Confiabilidade Probatória',
    descricao: 'Autenticidade (25) + Completude (20) + Corroboração (20) + Coerência Cronológica (15) + Contraditório (10) + Validade Formal (10) = 100 pontos.',
  },
  {
    icon: BookOpen,
    titulo: 'Classificação Epistêmica',
    descricao: 'Cada fato é classificado: DOCUMENTALMENTE COMPROVADO, PARCIALMENTE COMPROVADO, INFERÊNCIA LÓGICA, HIPÓTESE, ALEGAÇÃO DE PARTE, NÃO DEMONSTRADO.',
  },
  {
    icon: Target,
    titulo: 'Portão Zero de Integridade',
    descricao: 'Antes de tese ou estratégia: construir Linha de Estado Processual, dupla passagem (reconstrução + falsificação), teste de contradição fatal.',
  },
  {
    icon: Compass,
    titulo: 'Protocolo de Eventos Vizinhos',
    descricao: 'Localizado evento relevante: examinar obrigatoriamente o imediatamente anterior e o posterior. Expandir janela progressivamente.',
  },
]

function concordLabel(c?: string) {
  if (!c) return null
  return String(c).replace(/_/g, ' ')
}

function concordColor(c?: string) {
  return c === 'CONCORDA_TOTALMENTE' ? 'text-success'
    : c === 'CONCORDA_COM_RESSALVAS' ? 'text-warning'
    : c === 'DISCORDA_PARCIALMENTE' ? 'text-warning'
    : c === 'DISCORDA_TOTALMENTE' ? 'text-destructive'
    : 'text-muted-foreground'
}

function gravColor(g?: string) {
  return g === 'CRITICA' ? 'bg-destructive/25 text-destructive'
    : g === 'ALTA' ? 'bg-destructive/20 text-destructive'
    : g === 'MEDIA' ? 'bg-warning/20 text-warning'
    : 'bg-info/20 text-info'
}

export function OrientacoesClient() {
  const [analyses, setAnalyses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json())
      .then((data) => {
        const list = (data?.recentAnalyses ?? []).filter((a: any) => a?.orientacoesResult)
        setAnalyses(list)
        setLoading(false)
      })
      .catch((e) => {
        console.error(e)
        setLoading(false)
      })
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orientador"
        description="Revisor Independente — controle autônomo de erro de análise jurídica sobre a conclusão do MESTRE"
        actions={
          <LimparButton
            confirmMessage="Deseja limpar a lista de revisões exibida?"
            onClear={() => setAnalyses([])}
          />
        }
      />

      {/* Revisões independentes recentes */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Compass className="w-4 h-4 text-primary" /> Revisões Independentes Recentes
        </h2>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando revisões...
          </div>
        )}

        {!loading && analyses.length === 0 && (
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">
                Ainda não há revisões independentes. Elas são geradas automaticamente ao final de cada análise completa —
                o Revisor Independente examina a conclusão do MESTRE em busca de erros de análise jurídica.
              </p>
            </CardContent>
          </Card>
        )}

        {!loading && analyses.map((a: any) => {
          const ori = a?.orientacoesResult ?? {}
          const erros = ori?.erros_de_analise ?? []
          return (
            <Card key={a?.id} variant="interactive">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-sm">
                    {a?.case?.caseId ?? ''} • {a?.case?.title ?? 'Caso'}
                  </CardTitle>
                  {ori?.concordancia_com_mestre && (
                    <span className={`text-xs font-bold ${concordColor(ori.concordancia_com_mestre)}`}>
                      {concordLabel(ori.concordancia_com_mestre)}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {ori?.parecer_geral && (
                  <p className="text-sm text-muted-foreground">{ori.parecer_geral}</p>
                )}

                {erros.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-destructive">
                      {erros.length} erro(s) de análise jurídica apontado(s):
                    </p>
                    {erros.slice(0, 4).map((e: any, i: number) => (
                      <div key={i} className="p-2.5 bg-muted/50 rounded-lg">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${gravColor(e?.gravidade)}`}>{e?.gravidade ?? 'N/A'}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">{e?.tipo ?? '—'}</span>
                          {e?.onde && <span className="text-[11px] text-muted-foreground">Onde: {e.onde}</span>}
                        </div>
                        <p className="text-xs">{e?.descricao ?? '—'}</p>
                        {e?.correcao && <p className="text-[11px] text-success mt-1">Correção: {e.correcao}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-success">Nenhum erro de análise jurídica detectado.</p>
                )}

                {ori?.recomendacao_final && (
                  <div className="pt-1 border-t border-border/50">
                    <p className="text-[11px] text-muted-foreground">Recomendação final independente:</p>
                    <p className="text-xs font-medium">{ori.recomendacao_final}</p>
                  </div>
                )}

                <Link
                  href={`/casos/${a?.caseId}/analise/${a?.id}`}
                  className="inline-block text-xs text-primary hover:underline"
                >
                  Ver análise completa →
                </Link>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Princípios do Método Basile (referência) */}
      <div className="space-y-3 pt-2">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-primary" /> Princípios do Método Basile (referência)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {principios.map((o, i) => (
            <Card key={i} variant="interactive">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                    <o.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">{o.titulo}</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{o.descricao}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
