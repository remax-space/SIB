'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SafeDate } from '@/components/safe-format'
import { safeSourceUrl, type Evidence, type Plan, type Research, type Result } from '@/lib/research/contracts'

type PublicResearch = Omit<Research, 'approvalHash' | 'budgetKeys'> & { cacheExpired?: boolean }
type Context = { caseId: string; cutoffDate: string | null; suggestion: string; completed: boolean; canReconcile: boolean; history: PublicResearch[]; limitations: string[]; availability: { available: boolean; legacyAvailable: boolean; blockers: string[] } }
type Prepared = { research: PublicResearch; approvalToken: string; available: boolean; reusable: { id: string; stale: boolean } | null; maxCalls: number; warnings: string[]; blockers: string[] }
const states: Record<string, string> = { awaiting_confirmation: 'Aguardando confirmação', running: 'Consultando', success: 'Concluído', empty: 'Sem resultados', partial: 'Parcial', error: 'Falha', timeout: 'Tempo esgotado', cancelled: 'Cancelamento confirmado antes do envio', remote_uncertain: 'Execução remota incerta' }
function stateLabel(research: Pick<Research, 'state' | 'cancelRequestedAt'>) { return research.cancelRequestedAt && research.state === 'running' ? 'Cancelamento solicitado' : states[research.state] }
async function api(action: string, data: unknown) {
  const response = await fetch('/api/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, data }) })
  const value = await response.json()
  if (!response.ok) throw new Error(value.error ?? 'Falha na pesquisa')
  return value
}

export function LegalResearch({ analysisId, initialQuery = '', onEvidence }: { analysisId: string; initialQuery?: string; onEvidence?: (evidence: Evidence) => void }) {
  const router = useRouter()
  const [context, setContext] = useState<Context | null>(null)
  const [opened, setOpened] = useState(false)
  const [provider, setProvider] = useState<Plan['provider']>('legaw')
  const [tool, setTool] = useState<Plan['tool']>('buscar_jurisprudencia')
  const [objective, setObjective] = useState(''), [query, setQuery] = useState(initialQuery.slice(0, 2000)), [facts, setFacts] = useState(''), [thesis, setThesis] = useState('')
  const [courts, setCourts] = useState(''), [startDate, setStartDate] = useState(''), [endDate, setEndDate] = useState(''), [limit, setLimit] = useState(10)
  const [tribunal, setTribunal] = useState(''), [processNumber, setProcessNumber] = useState(''), [page, setPage] = useState(1), [judgmentDate, setJudgmentDate] = useState(''), [relator, setRelator] = useState(''), [citationText, setCitationText] = useState('')
  const [stance, setStance] = useState<Plan['stance']>('ambos'), [requiredTerms, setRequiredTerms] = useState(''), [exclusions, setExclusions] = useState('')
  const [allowAfter, setAllowAfter] = useState(false), [refresh, setRefresh] = useState(false), [acknowledgeStale, setAcknowledgeStale] = useState(false)
  const [prepared, setPrepared] = useState<Prepared | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [loaded, setLoaded] = useState<{ research: PublicResearch; result: Result | null } | null>(null)
  const [selected, setSelected] = useState<string[]>([]), [evidence, setEvidence] = useState<Evidence | null>(null)
  async function reload() {
    const response = await fetch(`/api/research?analysisId=${encodeURIComponent(analysisId)}`)
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    setContext(data)
    return data as Context
  }
  useEffect(() => {
    const changed = () => { setPrepared(null); void reload().catch(() => setError('Atualize a página para conferir a conexão.')) }
    window.addEventListener('legaw-connection-changed', changed)
    return () => window.removeEventListener('legaw-connection-changed', changed)
    // The listener follows the analysis represented by this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisId])
  useEffect(() => { let active = true; fetch(`/api/research?analysisId=${encodeURIComponent(analysisId)}`).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (active) { setContext(d); setObjective(d.suggestion); setEndDate(d.cutoffDate?.slice(0, 10) ?? '') } }).catch(e => { if (active) setError(e.message) }); return () => { active = false } }, [analysisId])
  async function act(fn: () => Promise<void>) { setBusy(true); setError(''); setNotice(''); try { await fn() } catch (e) { setError(e instanceof Error ? e.message : 'Falha de conexão. Consulte o histórico antes de repetir.') } finally { setBusy(false) } }
  async function view(id: string) {
    const response = await fetch(`/api/research?analysisId=${encodeURIComponent(analysisId)}&id=${encodeURIComponent(id)}`)
    const data = await response.json(); if (!response.ok) throw new Error(data.error)
    setLoaded(data); setSelected([])
  }
  function plan(): Plan {
    return { caseId: context!.caseId, analysisId, provider, tool: provider === 'legacy' ? 'buscar_jurisprudencia' : tool, objective, query: (tool === 'ler_inteiro_teor' || tool === 'conferir_citacoes') ? '' : query, facts, thesis, courts: provider === 'legaw' && tool === 'buscar_jurisprudencia' ? courts.split(',').map(x => x.trim().toUpperCase()).filter(Boolean) : [], ...(provider === 'legaw' && tool === 'buscar_jurisprudencia' && startDate ? { startDate } : {}), ...(provider === 'legaw' && tool === 'buscar_jurisprudencia' && endDate ? { endDate } : {}), ...(provider === 'legaw' && tool === 'ler_inteiro_teor' ? { tribunal: tribunal.trim().toUpperCase(), processNumber: processNumber.trim(), page, ...(judgmentDate ? { judgmentDate } : {}), ...(relator ? { relator } : {}) } : {}), ...(provider === 'legaw' && tool === 'conferir_citacoes' ? { citationText } : {}), page: tool === 'ler_inteiro_teor' ? page : 1, limit: provider === 'legacy' ? 10 : limit, stance, requiredTerms, exclusions, allowAfterCutoff: allowAfter, refresh }
  }
  const sendsQueryContext = provider === 'legacy' || tool === 'buscar_jurisprudencia' || tool === 'buscar_legislacao'
  async function reprocess() {
    if (!evidence) return
    await act(async () => {
      const sourceResponse = await fetch(`/api/analysis/${analysisId}`), original = await sourceResponse.json()
      if (!sourceResponse.ok) throw new Error(original.error)
      const response = await fetch('/api/analysis/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseId: context!.caseId, documentIds: original.documentIds, missionLiteral: original.missionLiteral, authorizedProduct: original.authorizedProduct, provider: original.provider, runMode: original.runMode, evidenceId: evidence.id }) })
      if (!response.ok) throw new Error((await response.json()).error)
      const id = response.headers.get('X-Analysis-Id')
      if (!id) throw new Error('Análise sem identificador; consulte o caso.')
      // Drain the SSE stream so navigating does not abort the server's processing.
      await response.text()
      router.push(`/casos/${context!.caseId}/analise/${id}`)
    })
  }
  return <Card id="pesquisa-juridica" className="border-primary/30">
    <CardHeader><CardTitle className="text-lg">Pesquisa jurídica — {provider === 'legaw' ? 'Legaw' : 'provedor legado'}</CardTitle><p className="text-sm text-muted-foreground">O contexto do processo e o histórico são incluídos automaticamente. Os campos abaixo são complementos opcionais para refinar a busca.</p></CardHeader>
    <CardContent className="space-y-4">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {!context ? error ? <Button variant="outline" disabled={busy} onClick={() => void act(async () => { const data = await reload(); setObjective(data.suggestion); setEndDate(data.cutoffDate?.slice(0, 10) ?? '') })}>Tentar carregar histórico novamente</Button> : <p>Carregando histórico…</p> : <>
        {provider === 'legaw' && !context.availability.available && <details className="rounded border p-3 text-sm"><summary>Integração Legaw indisponível — pendências de ativação</summary><ul className="list-disc pl-5 mt-2">{context.availability.blockers.map(b => <li key={b}>{b}</li>)}</ul></details>}
        {provider === 'legacy' && !context.availability.legacyAvailable && <p role="status" className="rounded border p-3 text-sm">O provedor legado não está configurado. O histórico continua disponível, mas a confirmação não fará uma nova chamada.</p>}
        {context.limitations.map(l => <p key={l} className="text-xs text-muted-foreground">{l}</p>)}
        <p className="text-xs">Corte temporal: {context.cutoffDate?.slice(0, 10) ?? 'não definido'}. Fontes posteriores ou sem data exigem escolha explícita.</p>
        <Button disabled={busy || !context.completed} onClick={() => setOpened(!opened)}>{opened ? 'Fechar preparação' : 'Preparar pesquisa'}</Button>
        {opened && <form className="space-y-4" onChange={() => setPrepared(null)} onSubmit={e => { e.preventDefault(); void act(async () => setPrepared(await api('prepare', plan()))) }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">Base<select className="block w-full border rounded p-2 bg-background" value={provider} onChange={e => { const next = e.target.value as Plan['provider']; setProvider(next); setLimit(10); if (next === 'legacy') setTool('buscar_jurisprudencia') }}><option value="legaw">Legaw</option><option value="legacy">Provedor legado (configuração atual)</option></select></label>
            {provider === 'legaw' && <label className="text-sm">Tipo de fonte<select className="block w-full border rounded p-2 bg-background" value={tool} onChange={e => { setTool(e.target.value as Plan['tool']); setLimit(e.target.value === 'buscar_legislacao' ? 5 : 10) }}><option value="buscar_jurisprudencia">Jurisprudência</option><option value="buscar_legislacao">Legislação federal</option><option value="ler_inteiro_teor">Inteiro teor de acórdão</option><option value="conferir_citacoes">Conferência de citações</option></select></label>}
          </div>
          <label className="block text-sm">Objetivo adicional (opcional)<Input maxLength={1000} value={objective} onChange={e => setObjective(e.target.value)} /></label>
          {(tool === 'buscar_jurisprudencia' || tool === 'buscar_legislacao') && <label className="block text-sm">Pergunta adicional (opcional)<Textarea maxLength={2000} value={query} onChange={e => setQuery(e.target.value)} /></label>}
          <label className="block text-sm">Fatos estritamente necessários (opcional, {sendsQueryContext ? 'enviados' : 'critério local'})<Textarea maxLength={2000} value={facts} onChange={e => setFacts(e.target.value)} placeholder="Evite nomes, documentos pessoais e dados sigilosos desnecessários." /></label>
          <label className="block text-sm">Tema, tese ou questão controvertida (opcional, {sendsQueryContext ? 'enviada' : 'critério local'})<Input maxLength={1000} value={thesis} onChange={e => setThesis(e.target.value)} /></label>
          {provider === 'legaw' && tool === 'ler_inteiro_teor' && <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Tribunal<Input required maxLength={15} value={tribunal} onChange={e => setTribunal(e.target.value.toUpperCase())} placeholder="STJ" /></label><label className="text-sm">Número do processo<Input required minLength={6} maxLength={120} value={processNumber} onChange={e => setProcessNumber(e.target.value)} /></label><label className="text-sm">Página<Input type="number" min={1} max={1000} value={page} onChange={e => setPage(Number(e.target.value))} /></label><label className="text-sm">Data do julgamento (opcional)<Input maxLength={30} value={judgmentDate} onChange={e => setJudgmentDate(e.target.value)} /></label><label className="text-sm">Relator (opcional)<Input maxLength={200} value={relator} onChange={e => setRelator(e.target.value)} /></label></div>}
          {provider === 'legaw' && tool === 'conferir_citacoes' && <label className="block text-sm">Texto da peça ou citações a conferir<Textarea required maxLength={60000} rows={12} value={citationText} onChange={e => setCitationText(e.target.value)} placeholder="Cole somente o texto revisado e necessário para a conferência." /><span className="text-xs text-muted-foreground">Até 60.000 caracteres; o texto será enviado ao provedor somente após sua confirmação.</span></label>}
          {provider === 'legaw' && (tool === 'buscar_jurisprudencia' || tool === 'buscar_legislacao') && <div className="grid gap-4 sm:grid-cols-2">
            {tool === 'buscar_jurisprudencia' && <><label className="text-sm">Tribunais (até 3 siglas, separadas por vírgula)<Input value={courts} onChange={e => setCourts(e.target.value)} placeholder="STJ, TJSP" /></label><label className="text-sm">Início do período<Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></label><label className="text-sm">Fim do período<Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></label></>}
            <label className="text-sm">Quantidade máxima<Input type="number" min={1} max={tool === 'buscar_legislacao' ? 10 : 20} value={limit} onChange={e => setLimit(Number(e.target.value))} /></label>
          </div>}
          <details className="border rounded p-3"><summary className="text-sm">Preferências adicionais da pesquisa</summary><div className="space-y-3 mt-3"><label className="block text-sm">Fundamentos<select className="block w-full border rounded p-2 bg-background" value={stance} onChange={e => setStance(e.target.value as Plan['stance'])}><option value="ambos">Favoráveis e contrários</option><option value="favoraveis">Favoráveis</option><option value="contrarios">Contrários</option></select></label><label className="block text-sm">Termos obrigatórios<Input maxLength={500} value={requiredTerms} onChange={e => setRequiredTerms(e.target.value)} /></label><label className="block text-sm">Exclusões<Input maxLength={500} value={exclusions} onChange={e => setExclusions(e.target.value)} /></label></div></details>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={allowAfter} onChange={e => setAllowAfter(e.target.checked)} />Permitir busca e uso de fontes posteriores ao corte ou sem data identificada.</label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={refresh} onChange={e => setRefresh(e.target.checked)} />Solicitar nova consulta mesmo havendo resultado válido (pode consumir créditos).</label>
          <Button type="submit" disabled={busy}>{busy ? 'Preparando…' : 'Revisar plano e dados enviados'}</Button>
        </form>}
        {prepared && <section className="rounded border p-4 space-y-3" aria-label="Revisão da pesquisa">
          <h3 className="font-semibold">Aguardando confirmação</h3><p className="text-sm">Ferramenta: {prepared.research.plan.tool}. Máximo: 1 execução de ferramenta de pesquisa. A conexão MCP também troca mensagens de inicialização e catálogo. Prazo total externo: até 55 segundos.</p>
          <p className="text-sm">Consulta com contexto automático que será enviada (até 2.000 caracteres; histórico e documentos são condensados):</p><pre className="text-xs whitespace-pre-wrap break-words bg-muted p-3 rounded">{JSON.stringify(prepared.research.parameters, null, 2)}</pre>
          <p className="text-sm">Objetivo adicional: {prepared.research.plan.objective}. Fundamentos: {prepared.research.plan.stance}. Termos: {prepared.research.plan.requiredTerms || 'nenhum'}. Exclusões: {prepared.research.plan.exclusions || 'nenhuma'}.</p>
          {prepared.reusable && <p className="text-sm">Resultado existente {prepared.reusable.stale ? 'vencido: atualização requer esta confirmação' : prepared.research.plan.refresh ? 'disponível, mas foi solicitada atualização' : 'será reutilizado sem nova chamada'}.</p>}
          <p className="text-xs">{prepared.research.plan.tool === 'conferir_citacoes' ? 'A documentação informa que a conferência não consome cota de pesquisa; qualquer cobrança adicional permanece desconhecida.' : 'Pode consumir créditos do provedor; valor desconhecido.'} Não inclui processamento por IA. Interromper a espera não garante interrupção remota nem estorno.</p>
          <Button disabled={busy || (!prepared.available && (!prepared.reusable || prepared.reusable.stale || prepared.research.plan.refresh))} onClick={() => void act(async () => { const r = await api('confirm', { id: prepared.research.id, approvalToken: prepared.approvalToken }); await view(r.research.id); await reload(); setNotice(r.research.reusedFrom ? 'Reutilizado do histórico: zero chamadas externas.' : states[r.research.state]); })}>{busy ? 'Consultando…' : 'Confirmar e pesquisar'}</Button>
          {busy && <Button type="button" variant="outline" onClick={() => { void api('cancel', { id: prepared.research.id }).then(r => setNotice(r.message)).catch(e => setError(e.message)) }}>Solicitar cancelamento</Button>}
        </section>}
        <section className="space-y-2"><div className="flex gap-3 items-center"><h3 className="font-semibold">Histórico persistido</h3><Button variant="ghost" size="sm" disabled={busy} onClick={() => void act(async () => { await reload() })}>Atualizar histórico</Button></div><p className="text-xs text-muted-foreground">Até 100 registros recentes desta análise. Histórico permanece disponível com a integração desabilitada.</p>{context.history.map(r => <div key={r.id} className="rounded border p-3 space-y-2"><button type="button" className="block w-full text-left text-sm break-words" onClick={() => void act(() => view(r.id))} disabled={busy}><SafeDate date={r.createdAt} locale="pt-BR" localize /> · {r.reusedFrom ? 'Reutilizado do histórico' : stateLabel(r)} · {r.plan.query || r.plan.tool}<span className="block text-xs">{r.reusedFrom ? 'Nenhuma nova chamada' : r.dispatchedAt ? 'Envio externo registrado' : 'Sem envio externo registrado'}{r.cacheExpired ? ' · Cache vencido' : ''}</span></button>{context.canReconcile && r.state === 'remote_uncertain' && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void act(async () => { const result = await api('reconcile', { id: r.id }); setNotice(result.research.state === 'remote_uncertain' ? 'Execução remota marcada como incerta; a reserva de consumo foi preservada.' : 'Pesquisa já não estava em execução.'); await reload() })}>Reconciliar lease vencida</Button>}</div>)}</section>
        {loaded && <section className="space-y-3 border-t pt-4"><h3 className="font-semibold">{stateLabel(loaded.research)} · {loaded.research.plan.tool}</h3><pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(loaded.research.parameters, null, 2)}</pre><p className="text-xs">Consumo do provedor: {loaded.research.consumption ?? 'desconhecido'}. Processamento por IA nesta consulta: nenhum.</p>{loaded.research.state === 'remote_uncertain' && <p role="alert">O provedor pode ter processado e cobrado a chamada. Não há repetição automática; consulte o provedor antes de uma nova tentativa.</p>}{loaded.result?.limitations.map(l => <p className="text-xs" key={l}>{l}</p>)}{loaded.result?.sources.length === 0 && <p>Nenhum resultado retornado. Isso não comprova ausência de precedentes.</p>}
          {loaded.result?.sources.map(s => <div key={s.id} className="rounded border p-3 space-y-2"><label className="flex gap-2 items-start text-sm font-medium"><input type="checkbox" checked={selected.includes(s.id)} onChange={e => setSelected(v => e.target.checked ? [...v, s.id] : v.filter(id => id !== s.id))} />{s.title}</label><p className="text-xs break-all">Fonte: {s.id} · {s.date ?? 'data desconhecida'} · {s.court ?? 'tribunal não informado'}</p>{safeSourceUrl(s.url) && <a className="text-primary underline text-sm" href={safeSourceUrl(s.url)} target="_blank" rel="noopener noreferrer">Conferir fonte</a>}<details><summary className="text-sm">Ver texto persistido</summary><p className="text-sm whitespace-pre-wrap break-words max-h-96 overflow-auto">{s.text}</p></details></div>)}
          {!!loaded.result?.sources.length && <><label className="flex gap-2 text-sm"><input type="checkbox" checked={allowAfter} onChange={e => { setAllowAfter(e.target.checked); setPrepared(null) }} />Autorizo uso de fontes posteriores ao corte ou sem data.</label><label className="flex gap-2 text-sm"><input type="checkbox" checked={acknowledgeStale} onChange={e => setAcknowledgeStale(e.target.checked)} />Reavaliei a pertinência de fontes vencidas ou de contexto anterior.</label><Button disabled={busy || !selected.length} onClick={() => void act(async () => { const r = await api('select', { caseId: context.caseId, analysisId, selections: [{ researchId: loaded.research.id, sourceIds: selected }], allowAfterCutoff: allowAfter, acknowledgeStale }); setEvidence(r.evidence); onEvidence?.(r.evidence); setNotice('Pacote salvo. A aplicação à conversa não faz pesquisa externa; a resposta do agente consome processamento de IA.') })}>Salvar seleção para os agentes</Button></>}
        </section>}
        {evidence && <section className="rounded border p-3 space-y-3"><p className="text-sm">Pacote {evidence.id}: {evidence.sources.length} fontes. Pode ser aplicado à próxima resposta da conversa.</p><p className="text-xs">Nova análise preserva a anterior e executa os agentes do modo original com este mesmo pacote e os documentos originais. Haverá processamento adicional de IA, sem nova chamada externa.</p><Button variant="outline" disabled={busy} onClick={() => void reprocess()}>Confirmar nova análise com as fontes</Button></section>}
      </>}
    </CardContent>
  </Card>
}
