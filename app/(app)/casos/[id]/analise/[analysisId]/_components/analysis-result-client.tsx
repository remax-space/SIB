'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LimparButton } from '@/components/limpar-button'
import { PageHeader } from '@/components/layouts/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FadeIn, SlideIn } from '@/components/ui/animate'
import { ArrowLeft, Download, Loader2, AlertTriangle } from 'lucide-react'
import { ANALYSIS_STATUSES, AGENTS, getIcpClass, getIcpLabel } from '@/lib/constants'

export function AnalysisResultClient({ caseId, analysisId }: { caseId: string; analysisId: string }) {
  const router = useRouter()
  const [analysis, setAnalysis] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  async function handleLimparAnalise() {
    try {
      const res = await fetch(`/api/analysis/${analysisId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Análise limpa')
        router.push(`/casos/${caseId}`)
      } else {
        toast.error('Erro ao limpar a análise')
      }
    } catch {
      toast.error('Erro ao limpar a análise')
    }
  }

  useEffect(() => {
    let interval: any = null

    function fetchAnalysis() {
      fetch(`/api/analysis/${analysisId}`)
        .then((r) => r.json())
        .then((data) => {
          setAnalysis(data)
          setLoading(false)
          if (data?.status === 'EM_ANDAMENTO') {
            if (!interval) {
              interval = setInterval(fetchAnalysis, 3000)
            }
          } else {
            if (interval) clearInterval(interval)
          }
        })
        .catch((e) => {
          console.error(e)
          setLoading(false)
        })
    }

    fetchAnalysis()
    return () => { if (interval) clearInterval(interval) }
  }, [analysisId])

  function exportJSON() {
    if (!analysis) return
    const blob = new Blob([JSON.stringify(analysis, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${analysis?.jobId ?? 'analise'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <p className="text-muted-foreground">Carregando análise...</p>
  if (!analysis || analysis?.error) return <p className="text-destructive">Análise não encontrada.</p>

  const statusDef = ANALYSIS_STATUSES?.find((s: any) => s?.value === analysis?.status)
  const basile = analysis?.basileResult ?? {}
  const advocado = analysis?.advocadoResult ?? {}
  const cabeca = analysis?.cabecaResult ?? {}
  const auditor = analysis?.auditorResult ?? {}
  const mestre = analysis?.mestreResult ?? {}
  const orientacoes = analysis?.orientacoesResult ?? {}
  const icp = auditor?.icp_basile ?? {}

  const gravColor = (g: string) =>
    g === 'CRITICA' ? 'bg-red-600/25 text-red-300'
    : g === 'ALTA' ? 'bg-red-500/20 text-red-400'
    : g === 'MEDIA' ? 'bg-yellow-500/20 text-yellow-400'
    : 'bg-blue-500/20 text-blue-400'

  const concordColor = (c: string) =>
    c === 'CONCORDA_TOTALMENTE' ? 'text-emerald-400'
    : c === 'CONCORDA_COM_RESSALVAS' ? 'text-yellow-400'
    : c === 'DISCORDA_PARCIALMENTE' ? 'text-orange-400'
    : 'text-red-400'

  return (
    <div className="space-y-6">
      <FadeIn>
        <PageHeader
          title={analysis?.jobId ?? 'Análise'}
          description={`${analysis?.case?.caseId ?? ''} • ${analysis?.case?.title ?? ''} • ${analysis?.provider}`}
          actions={
            <div className="flex gap-2">
              <Link href={`/casos/${caseId}`}>
                <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />Voltar</Button>
              </Link>
              {analysis?.status === 'CONCLUIDO' && (
                <Button size="sm" variant="outline" onClick={exportJSON}>
                  <Download className="w-4 h-4 mr-1" />Exportar JSON
                </Button>
              )}
              <LimparButton
                label="Limpar"
                variant="destructive"
                confirmMessage="Deseja limpar (excluir) esta análise? Esta ação não pode ser desfeita."
                successMessage="Análise limpa"
                onClear={handleLimparAnalise}
              />
            </div>
          }
        />
      </FadeIn>

      {/* Status + ICP header */}
      <div className="flex flex-wrap items-center gap-4">
        <span className={`text-xs px-3 py-1.5 rounded-full ${statusDef?.color ?? ''}`}>
          {statusDef?.label ?? analysis?.status}
        </span>
        {analysis?.status === 'EM_ANDAMENTO' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Agente atual: {analysis?.currentAgent ?? '...'}
          </div>
        )}
        {analysis?.icpScore != null && (
          <div className="flex items-center gap-2">
            <span className={`text-3xl font-bold font-mono ${getIcpClass(analysis.icpScore)}`}>
              {Number(analysis.icpScore).toFixed(1)}
            </span>
            <div>
              <p className={`text-sm font-medium ${getIcpClass(analysis.icpScore)}`}>ICP Basile</p>
              <p className="text-xs text-muted-foreground">{getIcpLabel(analysis.icpScore)}</p>
            </div>
          </div>
        )}
      </div>

      {analysis?.errorDetail && (
        <Card className="border-destructive">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Erro na análise</p>
              <p className="text-xs text-muted-foreground mt-1">{analysis.errorDetail}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Agent Results Tabs */}
      {analysis?.status !== 'PENDENTE' && (
        <Tabs defaultValue="basile" className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1">
            {AGENTS?.map((agent: any) => (
              <TabsTrigger key={agent?.key} value={agent?.key} className="text-xs">
                {agent?.icon} {agent?.label}
              </TabsTrigger>
            )) ?? []}
          </TabsList>

          {/* BASILE */}
          <TabsContent value="basile">
            <SlideIn from="bottom">
              <div className="space-y-4">
                {basile?.missao_registrada && (
                  <Card><CardHeader><CardTitle className="text-sm">📋 Missão Registrada</CardTitle></CardHeader>
                    <CardContent><p className="text-sm">{basile.missao_registrada}</p></CardContent>
                  </Card>
                )}
                {basile?.linha_estado_processual && (
                  <Card><CardHeader><CardTitle className="text-sm">📍 Linha de Estado Processual</CardTitle></CardHeader>
                    <CardContent><p className="text-sm">{basile.linha_estado_processual}</p></CardContent>
                  </Card>
                )}
                {(basile?.cronologia?.length ?? 0) > 0 && (
                  <Card><CardHeader><CardTitle className="text-sm">📅 Cronologia</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {(basile.cronologia ?? []).map((item: any, i: number) => (
                          <div key={i} className="flex gap-3 text-sm">
                            <span className="font-mono text-xs text-primary shrink-0 w-24">{item?.data ?? '—'}</span>
                            <span>{item?.evento ?? '—'}</span>
                            <span className="text-muted-foreground text-xs">({item?.fonte ?? ''})</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {(basile?.fatos_provas?.length ?? 0) > 0 && (
                  <Card><CardHeader><CardTitle className="text-sm">📚 Fatos e Provas</CardTitle></CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-2 px-2 text-muted-foreground">Item</th>
                              <th className="text-left py-2 px-2 text-muted-foreground">Categoria</th>
                              <th className="text-left py-2 px-2 text-muted-foreground">Evidência</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(basile.fatos_provas ?? []).map((f: any, i: number) => (
                              <tr key={i} className="border-b border-border/50">
                                <td className="py-2 px-2">{f?.item ?? '—'}</td>
                                <td className="py-2 px-2"><span className="px-1.5 py-0.5 rounded bg-muted text-[10px]">{f?.classificacao_epistemica ?? f?.categoria ?? '—'}</span></td>
                                <td className="py-2 px-2 text-muted-foreground">{f?.evidencia ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {(basile?.contradicoes?.length ?? 0) > 0 && (
                  <Card><CardHeader><CardTitle className="text-sm">⚠️ Contradições Documentadas</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {(basile.contradicoes ?? []).map((c: any, i: number) => (
                          <div key={i} className="p-3 bg-muted/50 rounded-lg">
                            <p className="text-sm">{c?.descricao ?? '—'}</p>
                            <p className="text-xs text-muted-foreground mt-1">Fonte A: {c?.fonte_a ?? '—'} | Fonte B: {c?.fonte_b ?? '—'} | Impacto: {c?.impacto ?? '—'}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {(basile?.lacunas_probatorias?.length ?? 0) > 0 && (
                  <Card><CardHeader><CardTitle className="text-sm">🔍 Lacunas Probatórias</CardTitle></CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-2 px-2 text-muted-foreground">Fato</th>
                              <th className="text-left py-2 px-2 text-muted-foreground">Grau Atual</th>
                              <th className="text-left py-2 px-2 text-muted-foreground">Prova Ausente</th>
                              <th className="text-left py-2 px-2 text-muted-foreground">Risco</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(basile.lacunas_probatorias ?? []).map((l: any, i: number) => (
                              <tr key={i} className="border-b border-border/50">
                                <td className="py-2 px-2">{l?.fato ?? '—'}</td>
                                <td className="py-2 px-2">{l?.grau_atual ?? '—'}</td>
                                <td className="py-2 px-2">{l?.prova_ausente ?? '—'}</td>
                                <td className="py-2 px-2 text-destructive">{l?.risco ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}
                {basile?.tese_principal && (
                  <Card className="border-primary/30">
                    <CardHeader><CardTitle className="text-sm">🎯 Tese Principal</CardTitle></CardHeader>
                    <CardContent><p className="text-sm">{basile.tese_principal}</p></CardContent>
                  </Card>
                )}
              </div>
            </SlideIn>
          </TabsContent>

          {/* ADVOGADO DO DIABO */}
          <TabsContent value="advocado">
            <SlideIn from="bottom">
              <div className="space-y-4">
                {(advocado?.contra_argumentos?.length ?? 0) > 0 && (
                  <Card><CardHeader><CardTitle className="text-sm">⚔️ Contra-Argumentos</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {(advocado.contra_argumentos ?? []).map((ca: any, i: number) => (
                          <div key={i} className="p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${ca?.gravidade === 'ALTA' ? 'bg-red-500/20 text-red-400' : ca?.gravidade === 'MEDIA' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                {ca?.gravidade ?? 'N/A'}
                              </span>
                              <span className="text-xs text-muted-foreground">Ataca: {ca?.tese_atacada ?? '—'}</span>
                            </div>
                            <p className="text-sm">{ca?.argumento ?? '—'}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {advocado?.tese_contraparte && (
                  <Card><CardHeader><CardTitle className="text-sm">🗣️ Tese da Contraparte</CardTitle></CardHeader>
                    <CardContent><p className="text-sm">{advocado.tese_contraparte}</p></CardContent>
                  </Card>
                )}
                {(advocado?.pontos_frageis?.length ?? 0) > 0 && (
                  <Card><CardHeader><CardTitle className="text-sm">🚨 Pontos Frágeis</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {(advocado.pontos_frageis ?? []).map((p: any, i: number) => (
                          <div key={i} className="p-3 bg-muted/50 rounded-lg">
                            <p className="text-sm font-medium">{p?.ponto ?? '—'}</p>
                            <p className="text-xs text-muted-foreground mt-1">Risco: {p?.risco ?? '—'} | Mitigação: {p?.mitigacao ?? '—'}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </SlideIn>
          </TabsContent>

          {/* CABEÇA DO JUIZ */}
          <TabsContent value="cabeca">
            <SlideIn from="bottom">
              <div className="space-y-4">
                {cabeca?.probabilidade_acolhimento && (
                  <Card><CardHeader><CardTitle className="text-sm">⚖️ Probabilidade de Acolhimento</CardTitle></CardHeader>
                    <CardContent>
                      <span className={`text-lg font-bold ${cabeca.probabilidade_acolhimento === 'ALTA' ? 'text-emerald-400' : cabeca.probabilidade_acolhimento === 'MEDIA' ? 'text-yellow-400' : cabeca.probabilidade_acolhimento === 'BAIXA' ? 'text-red-400' : 'text-muted-foreground'}`}>
                        {cabeca.probabilidade_acolhimento}
                      </span>
                    </CardContent>
                  </Card>
                )}
                {cabeca?.fundamento_decisao_provavel && (
                  <Card><CardHeader><CardTitle className="text-sm">📋 Fundamento da Decisão Provável</CardTitle></CardHeader>
                    <CardContent><p className="text-sm">{cabeca.fundamento_decisao_provavel}</p></CardContent>
                  </Card>
                )}
                {(cabeca?.riscos_judiciais?.length ?? 0) > 0 && (
                  <Card><CardHeader><CardTitle className="text-sm">⚠️ Riscos Judiciais</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {(cabeca.riscos_judiciais ?? []).map((r: any, i: number) => (
                          <div key={i} className="p-3 bg-muted/50 rounded-lg">
                            <p className="text-sm">{r?.risco ?? '—'}</p>
                            <p className="text-xs text-muted-foreground mt-1">Prob.: {r?.probabilidade ?? '—'} | Impacto: {r?.impacto ?? '—'}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {cabeca?.recomendacao_judicial && (
                  <Card className="border-primary/30"><CardHeader><CardTitle className="text-sm">💡 Recomendação Judicial</CardTitle></CardHeader>
                    <CardContent><p className="text-sm">{cabeca.recomendacao_judicial}</p></CardContent>
                  </Card>
                )}
              </div>
            </SlideIn>
          </TabsContent>

          {/* AUDITOR */}
          <TabsContent value="auditor">
            <SlideIn from="bottom">
              <div className="space-y-4">
                {/* ICP Score Breakdown */}
                {icp?.total != null && (
                  <Card className="border-primary/30 gold-glow">
                    <CardHeader><CardTitle className="text-sm">🏆 Índice de Confiabilidade Probatória (ICP Basile)</CardTitle></CardHeader>
                    <CardContent>
                      <div className="text-center mb-4">
                        <span className={`text-5xl font-bold font-mono ${getIcpClass(icp.total)}`}>{Number(icp.total).toFixed(1)}</span>
                        <p className={`text-sm mt-1 ${getIcpClass(icp.total)}`}>{icp?.faixa ?? getIcpLabel(icp.total)}</p>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {[
                          { key: 'autenticidade', label: 'Autenticidade', max: 25 },
                          { key: 'completude', label: 'Completude', max: 20 },
                          { key: 'corroboracao', label: 'Corroboração', max: 20 },
                          { key: 'coerencia_cronologica', label: 'Coerência Cronológica', max: 15 },
                          { key: 'contraditorio', label: 'Contraditório', max: 10 },
                          { key: 'validade_formal', label: 'Validade Formal', max: 10 },
                        ].map((dim: any) => {
                          const score = icp?.[dim?.key]?.score ?? 0
                          const pct = dim?.max > 0 ? (score / dim.max) * 100 : 0
                          return (
                            <div key={dim?.key} className="p-3 bg-muted/50 rounded-lg">
                              <p className="text-xs text-muted-foreground">{dim?.label}</p>
                              <p className="text-lg font-bold font-mono">{score}<span className="text-xs text-muted-foreground">/{dim?.max}</span></p>
                              <div className="w-full h-1.5 bg-muted rounded-full mt-1">
                                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(pct, 100)}%` }} />
                              </div>
                              {icp?.[dim?.key]?.justificativa && (
                                <p className="text-[10px] text-muted-foreground mt-1">{icp[dim.key].justificativa}</p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {(auditor?.classificacao_epistemica?.length ?? 0) > 0 && (
                  <Card><CardHeader><CardTitle className="text-sm">📊 Classificação Epistêmica</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {(auditor.classificacao_epistemica ?? []).map((c: any, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-sm">
                            <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] shrink-0 mt-0.5">{c?.categoria ?? '—'}</span>
                            <span>{c?.item ?? '—'}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </SlideIn>
          </TabsContent>

          {/* MESTRE */}
          <TabsContent value="mestre">
            <SlideIn from="bottom">
              <div className="space-y-4">
                {mestre?.sintese_executiva && (
                  <Card className="border-primary/30"><CardHeader><CardTitle className="text-sm">🎯 Síntese Executiva</CardTitle></CardHeader>
                    <CardContent><p className="text-sm">{mestre.sintese_executiva}</p></CardContent>
                  </Card>
                )}
                {mestre?.decisao_necessaria && (
                  <Card><CardHeader><CardTitle className="text-sm">🚨 Decisão Necessária do Operador</CardTitle></CardHeader>
                    <CardContent><p className="text-sm font-medium">{mestre.decisao_necessaria}</p></CardContent>
                  </Card>
                )}
                {mestre?.objetivo_processual && (
                  <Card><CardHeader><CardTitle className="text-sm">Objetivo Processual Recomendado</CardTitle></CardHeader>
                    <CardContent><p className="text-sm">{mestre.objetivo_processual}</p></CardContent>
                  </Card>
                )}
                {(mestre?.medidas_prioritarias?.length ?? 0) > 0 && (
                  <Card><CardHeader><CardTitle className="text-sm">📝 Medidas Prioritárias</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {(mestre.medidas_prioritarias ?? []).map((m: any, i: number) => (
                          <div key={i} className="flex gap-3 p-3 bg-muted/50 rounded-lg">
                            <span className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">{m?.ordem ?? i + 1}</span>
                            <div>
                              <p className="text-sm">{m?.medida ?? '—'}</p>
                              <p className="text-xs text-muted-foreground">Prazo: {m?.prazo ?? '—'} | Resp.: {m?.responsavel ?? '—'}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {mestre?.prazo_critico && (
                  <Card><CardHeader><CardTitle className="text-sm">⏰ Prazo Crítico</CardTitle></CardHeader>
                    <CardContent><p className="text-sm font-medium text-destructive">{mestre.prazo_critico}</p></CardContent>
                  </Card>
                )}
                {(mestre?.alternativas_juridicas?.length ?? 0) > 0 && (
                  <Card><CardHeader><CardTitle className="text-sm">🔀 Alternativas Jurídicas</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {(mestre.alternativas_juridicas ?? []).map((a: any, i: number) => (
                          <div key={i} className="p-3 bg-muted/50 rounded-lg">
                            <p className="text-sm font-medium">{a?.alternativa ?? '—'}</p>
                            <p className="text-xs text-muted-foreground mt-1">Vantagem: {a?.vantagem ?? '—'}</p>
                            <p className="text-xs text-muted-foreground">Desvantagem: {a?.desvantagem ?? '—'}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {mestre?.proximo_movimento && (
                  <Card className="border-primary/30"><CardHeader><CardTitle className="text-sm">➡️ Próximo Movimento</CardTitle></CardHeader>
                    <CardContent><p className="text-sm font-medium">{mestre.proximo_movimento}</p></CardContent>
                  </Card>
                )}
              </div>
            </SlideIn>
          </TabsContent>

          {/* ORIENTAÇÕES — Revisor Independente */}
          <TabsContent value="orientacoes">
            <SlideIn from="bottom">
              <div className="space-y-4">
                <Card className="border-primary/30">
                  <CardHeader><CardTitle className="text-sm">🧭 Orientador — Revisor Independente de Erro de Análise Jurídica</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground">Agente autônomo que revisa criticamente a conclusão do MESTRE em busca de qualquer erro de análise jurídica.</p>
                    {orientacoes?.concordancia_com_mestre && (
                      <p className="text-sm mt-2">Posição sobre o MESTRE: <span className={`font-bold ${concordColor(orientacoes.concordancia_com_mestre)}`}>{String(orientacoes.concordancia_com_mestre).replace(/_/g, ' ')}</span></p>
                    )}
                  </CardContent>
                </Card>
                {orientacoes?.parecer_geral && (
                  <Card><CardHeader><CardTitle className="text-sm">📝 Parecer Geral Independente</CardTitle></CardHeader>
                    <CardContent><p className="text-sm">{orientacoes.parecer_geral}</p></CardContent>
                  </Card>
                )}
                {(orientacoes?.erros_de_analise?.length ?? 0) > 0 && (
                  <Card className="border-destructive/40"><CardHeader><CardTitle className="text-sm">🚨 Erros de Análise Jurídica Detectados</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {(orientacoes.erros_de_analise ?? []).map((e: any, i: number) => (
                          <div key={i} className="p-3 bg-muted/50 rounded-lg">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${gravColor(e?.gravidade)}`}>{e?.gravidade ?? 'N/A'}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">{e?.tipo ?? '—'}</span>
                              {e?.onde && <span className="text-xs text-muted-foreground">Onde: {e.onde}</span>}
                            </div>
                            <p className="text-sm">{e?.descricao ?? '—'}</p>
                            {e?.correcao && <p className="text-xs text-emerald-400 mt-1">Correção: {e.correcao}</p>}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {(orientacoes?.alertas_criticos?.length ?? 0) > 0 && (
                  <Card className="border-destructive/40"><CardHeader><CardTitle className="text-sm">⚠️ Alertas Críticos</CardTitle></CardHeader>
                    <CardContent>
                      <ul className="space-y-1 list-disc list-inside">
                        {(orientacoes.alertas_criticos ?? []).filter(Boolean).map((a: string, i: number) => (
                          <li key={i} className="text-sm text-destructive">{a}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
                {(orientacoes?.validacoes?.length ?? 0) > 0 && (
                  <Card><CardHeader><CardTitle className="text-sm">✅ Validações</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {(orientacoes.validacoes ?? []).map((v: any, i: number) => (
                          <div key={i} className="p-3 bg-muted/50 rounded-lg">
                            <p className="text-sm font-medium">{v?.ponto ?? '—'}</p>
                            {v?.por_que_esta_correto && <p className="text-xs text-muted-foreground mt-1">{v.por_que_esta_correto}</p>}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {(orientacoes?.melhorias?.length ?? 0) > 0 && (
                  <Card><CardHeader><CardTitle className="text-sm">💡 Melhorias Sugeridas</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {(orientacoes.melhorias ?? []).map((m: any, i: number) => (
                          <div key={i} className="p-3 bg-muted/50 rounded-lg">
                            <p className="text-sm">{m?.sugestao ?? '—'}</p>
                            {m?.beneficio && <p className="text-xs text-muted-foreground mt-1">Benefício: {m.beneficio}</p>}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
                {orientacoes?.recomendacao_final && (
                  <Card className="border-primary/30"><CardHeader><CardTitle className="text-sm">🧭 Recomendação Final Independente</CardTitle></CardHeader>
                    <CardContent><p className="text-sm font-medium">{orientacoes.recomendacao_final}</p></CardContent>
                  </Card>
                )}
                {analysis?.status === 'CONCLUIDO' && !orientacoes?.parecer_geral && (orientacoes?.erros_de_analise?.length ?? 0) === 0 && (
                  <p className="text-sm text-muted-foreground">O revisor independente não retornou conteúdo estruturado para esta análise.</p>
                )}
              </div>
            </SlideIn>
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
