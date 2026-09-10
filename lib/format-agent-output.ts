const HIDDEN_KEYS = new Set([
  'missao_registrada',
  'registros_obediencia',
])

function looksLikePrompt(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const v = value.trim()
  if (!v) return false
  if (v.startsWith('MISSÃO LITERAL')) return true
  if (v.startsWith('Investigue, audite e conclua')) return true
  return v.includes('Método Basile:') && v.includes('sem inventar dados')
}

function stripMarkdownFence(text: string): string {
  let clean = text.trim()
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }
  return clean.trim()
}

function tryParseJson(text: string): any | null {
  const clean = stripMarkdownFence(text)
  const startObj = clean.indexOf('{')
  const startArr = clean.indexOf('[')
  const start =
    startObj >= 0 && (startArr < 0 || startObj < startArr) ? startObj
    : startArr >= 0 ? startArr
    : -1
  if (start < 0) return null
  const endChar = clean[start] === '{' ? '}' : ']'
  const end = clean.lastIndexOf(endChar)
  if (end <= start) return null
  try {
    return JSON.parse(clean.slice(start, end + 1))
  } catch {
    return null
  }
}

export function normalizeAgentResult(data: any): any {
  if (data == null) return null
  if (typeof data === 'string') {
    return tryParseJson(data) ?? (looksLikePrompt(data) ? null : data)
  }
  if (typeof data === 'object' && typeof data.raw_text === 'string') {
    return tryParseJson(data.raw_text) ?? data
  }
  return data
}

function isEmpty(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === 'string') return !value.trim()
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value as object).length === 0
  return false
}

function line(label: string, value: unknown): string {
  if (isEmpty(value) || looksLikePrompt(value)) return ''
  return `${label}: ${String(value).trim()}`
}

function section(title: string, body: string): string {
  const content = body.trim()
  if (!content) return ''
  return `${title}\n${content}`
}

function formatListItem(parts: string[]): string {
  const cleaned = parts.filter(Boolean)
  if (cleaned.length === 0) return ''
  return `• ${cleaned.join('\n  ')}`
}

function formatBasile(data: any): string {
  const blocks: string[] = []

  if (data.linha_estado_processual && !looksLikePrompt(data.linha_estado_processual)) {
    blocks.push(section('ESTADO PROCESSUAL', String(data.linha_estado_processual)))
  }

  const cronologia = Array.isArray(data.cronologia) ? data.cronologia : []
  if (cronologia.length > 0) {
    blocks.push(section('CRONOLOGIA', cronologia.map((item: any) => {
      if (!item || typeof item !== 'object') return ''
      return formatListItem([
        [item.data, item.evento].filter(Boolean).join(' — '),
        item.fonte ? `Fonte: ${item.fonte}` : '',
      ])
    }).filter(Boolean).join('\n')))
  }

  const fatos = Array.isArray(data.fatos_provas) ? data.fatos_provas : []
  if (fatos.length > 0) {
    blocks.push(section('FATOS E PROVAS', fatos.map((f: any) => {
      if (!f || typeof f !== 'object') return ''
      return formatListItem([
        f.item ?? '',
        (f.classificacao_epistemica || f.categoria) ? `Classificação: ${f.classificacao_epistemica || f.categoria}` : '',
        f.evidencia ? `Evidência: ${f.evidencia}` : '',
        f.fonte ? `Fonte: ${f.fonte}` : '',
      ])
    }).filter(Boolean).join('\n\n')))
  }

  const contradicoes = Array.isArray(data.contradicoes) ? data.contradicoes : []
  if (contradicoes.length > 0) {
    blocks.push(section('CONTRADIÇÕES', contradicoes.map((c: any) => {
      if (!c || typeof c !== 'object') return ''
      return formatListItem([
        c.descricao ?? '',
        c.fonte_a ? `Fonte A: ${c.fonte_a}` : '',
        c.fonte_b ? `Fonte B: ${c.fonte_b}` : '',
        c.impacto ? `Impacto: ${c.impacto}` : '',
      ])
    }).filter(Boolean).join('\n\n')))
  }

  const lacunas = Array.isArray(data.lacunas_probatorias) ? data.lacunas_probatorias : []
  if (lacunas.length > 0) {
    blocks.push(section('LACUNAS PROBATÓRIAS', lacunas.map((l: any) => {
      if (!l || typeof l !== 'object') return ''
      return formatListItem([
        l.fato ?? '',
        l.grau_atual ? `Grau atual: ${l.grau_atual}` : '',
        l.prova_ausente ? `Prova ausente: ${l.prova_ausente}` : '',
        l.risco ? `Risco: ${l.risco}` : '',
      ])
    }).filter(Boolean).join('\n\n')))
  }

  if (data.tese_principal && !looksLikePrompt(data.tese_principal)) {
    blocks.push(section('TESE PRINCIPAL', String(data.tese_principal)))
  }

  if (data.observacoes && !looksLikePrompt(data.observacoes)) {
    blocks.push(section('CONDUTA RECOMENDADA', String(data.observacoes)))
  }

  return blocks.filter(Boolean).join('\n\n')
}

function formatAdvogado(data: any): string {
  const blocks: string[] = []

  const contra = Array.isArray(data.contra_argumentos) ? data.contra_argumentos : []
  if (contra.length > 0) {
    blocks.push(section('CONTRA-ARGUMENTOS', contra.map((ca: any) => {
      if (!ca || typeof ca !== 'object') return ''
      return formatListItem([
        ca.argumento ?? '',
        ca.tese_atacada ? `Ataca: ${ca.tese_atacada}` : '',
        ca.gravidade ? `Gravidade: ${ca.gravidade}` : '',
        ca.fonte ? `Fonte: ${ca.fonte}` : '',
      ])
    }).filter(Boolean).join('\n\n')))
  }

  if (data.tese_contraparte && !looksLikePrompt(data.tese_contraparte)) {
    blocks.push(section('TESE DA CONTRAPARTE', String(data.tese_contraparte)))
  }

  const frageis = Array.isArray(data.pontos_frageis) ? data.pontos_frageis : []
  if (frageis.length > 0) {
    blocks.push(section('PONTOS FRÁGEIS', frageis.map((p: any) => {
      if (!p || typeof p !== 'object') return ''
      return formatListItem([
        p.ponto ?? '',
        p.risco ? `Risco: ${p.risco}` : '',
        p.mitigacao ? `Mitigação: ${p.mitigacao}` : '',
      ])
    }).filter(Boolean).join('\n\n')))
  }

  const riscos = Array.isArray(data.riscos_identificados) ? data.riscos_identificados : []
  if (riscos.length > 0) {
    blocks.push(section('RISCOS IDENTIFICADOS', riscos.map((r: any) => {
      if (typeof r === 'string') return `• ${r}`
      if (!r || typeof r !== 'object') return ''
      return formatListItem([r.risco ?? r.descricao ?? '', r.impacto ? `Impacto: ${r.impacto}` : ''])
    }).filter(Boolean).join('\n')))
  }

  return blocks.filter(Boolean).join('\n\n')
}

function formatCabeca(data: any): string {
  const blocks: string[] = []

  if (data.probabilidade_acolhimento) {
    blocks.push(section('PROBABILIDADE DE ACOLHIMENTO', String(data.probabilidade_acolhimento)))
  }

  if (data.fundamento_decisao_provavel && !looksLikePrompt(data.fundamento_decisao_provavel)) {
    blocks.push(section('FUNDAMENTO DA DECISÃO PROVÁVEL', String(data.fundamento_decisao_provavel)))
  }

  const precedentes = Array.isArray(data.precedentes_relevantes) ? data.precedentes_relevantes : []
  if (precedentes.length > 0) {
    blocks.push(section('PRECEDENTES RELEVANTES', precedentes.map((p: any) => {
      if (typeof p === 'string') return p.trim() ? `• ${p}` : ''
      return formatListItem([p?.identificacao ?? p?.ementa ?? '', p?.tribunal ? `Tribunal: ${p.tribunal}` : ''])
    }).filter(Boolean).join('\n')))
  }

  const riscos = Array.isArray(data.riscos_judiciais) ? data.riscos_judiciais : []
  if (riscos.length > 0) {
    blocks.push(section('RISCOS JUDICIAIS', riscos.map((r: any) => {
      if (!r || typeof r !== 'object') return ''
      return formatListItem([
        r.risco ?? '',
        r.probabilidade ? `Probabilidade: ${r.probabilidade}` : '',
        r.impacto ? `Impacto: ${r.impacto}` : '',
      ])
    }).filter(Boolean).join('\n\n')))
  }

  if (data.recomendacao_judicial && !looksLikePrompt(data.recomendacao_judicial)) {
    blocks.push(section('RECOMENDAÇÃO JUDICIAL', String(data.recomendacao_judicial)))
  }

  return blocks.filter(Boolean).join('\n\n')
}

function formatAuditor(data: any): string {
  const blocks: string[] = []
  const icp = data.icp_basile ?? {}

  if (icp.total != null) {
    const dims = [
      ['Autenticidade', icp.autenticidade],
      ['Completude', icp.completude],
      ['Corroboração', icp.corroboracao],
      ['Coerência cronológica', icp.coerencia_cronologica],
      ['Contraditório', icp.contraditorio],
      ['Validade formal', icp.validade_formal],
    ]
    const lines = [`Total: ${icp.total}${icp.faixa ? ` (${icp.faixa})` : ''}`]
    for (const [label, dim] of dims) {
      if (!dim) continue
      const score = typeof dim === 'object' ? dim.score : dim
      const just = typeof dim === 'object' ? dim.justificativa : ''
      lines.push(`• ${label}: ${score}${just ? ` — ${just}` : ''}`)
    }
    blocks.push(section('ICP BASILE', lines.join('\n')))
  }

  const classes = Array.isArray(data.classificacao_epistemica) ? data.classificacao_epistemica : []
  if (classes.length > 0) {
    blocks.push(section('CLASSIFICAÇÃO EPISTÊMICA', classes.map((c: any) => {
      if (!c || typeof c !== 'object') return ''
      return formatListItem([c.item ?? '', c.categoria ? `Categoria: ${c.categoria}` : '', c.fundamento ? `Fundamento: ${c.fundamento}` : ''])
    }).filter(Boolean).join('\n\n')))
  }

  return blocks.filter(Boolean).join('\n\n')
}

function formatMestre(data: any): string {
  const blocks: string[] = []

  if (data.sintese_executiva && !looksLikePrompt(data.sintese_executiva)) {
    blocks.push(section('SÍNTESE EXECUTIVA', String(data.sintese_executiva)))
  }
  if (data.decisao_necessaria && !looksLikePrompt(data.decisao_necessaria)) {
    blocks.push(section('DECISÃO NECESSÁRIA', String(data.decisao_necessaria)))
  }
  if (data.objetivo_processual && !looksLikePrompt(data.objetivo_processual)) {
    blocks.push(section('OBJETIVO PROCESSUAL', String(data.objetivo_processual)))
  }

  const medidas = Array.isArray(data.medidas_prioritarias) ? data.medidas_prioritarias : []
  if (medidas.length > 0) {
    blocks.push(section('MEDIDAS PRIORITÁRIAS', medidas.map((m: any, i: number) => {
      if (!m || typeof m !== 'object') return ''
      return formatListItem([
        `${m.ordem ?? i + 1}. ${m.medida ?? ''}`,
        m.prazo ? `Prazo: ${m.prazo}` : '',
        m.responsavel ? `Responsável: ${m.responsavel}` : '',
      ])
    }).filter(Boolean).join('\n\n')))
  }

  if (data.prazo_critico) {
    blocks.push(section('PRAZO CRÍTICO', String(data.prazo_critico)))
  }

  const riscos = Array.isArray(data.riscos_principais) ? data.riscos_principais : []
  if (riscos.length > 0) {
    blocks.push(section('RISCOS PRINCIPAIS', riscos.map((r: any) => {
      if (!r || typeof r !== 'object') return ''
      return formatListItem([
        r.risco ?? '',
        r.probabilidade ? `Probabilidade: ${r.probabilidade}` : '',
        r.impacto ? `Impacto: ${r.impacto}` : '',
      ])
    }).filter(Boolean).join('\n\n')))
  }

  if (data.resultado_esperado && !looksLikePrompt(data.resultado_esperado)) {
    blocks.push(section('RESULTADO ESPERADO', String(data.resultado_esperado)))
  }

  const alts = Array.isArray(data.alternativas_juridicas) ? data.alternativas_juridicas : []
  if (alts.length > 0) {
    blocks.push(section('ALTERNATIVAS JURÍDICAS', alts.map((a: any) => {
      if (!a || typeof a !== 'object') return ''
      return formatListItem([
        a.alternativa ?? '',
        a.vantagem ? `Vantagem: ${a.vantagem}` : '',
        a.desvantagem ? `Desvantagem: ${a.desvantagem}` : '',
      ])
    }).filter(Boolean).join('\n\n')))
  }

  if (data.proximo_movimento && !looksLikePrompt(data.proximo_movimento)) {
    blocks.push(section('PRÓXIMO MOVIMENTO', String(data.proximo_movimento)))
  }

  return blocks.filter(Boolean).join('\n\n')
}

function formatOrientacoes(data: any): string {
  const blocks: string[] = []

  if (data.concordancia_com_mestre) {
    blocks.push(section('POSIÇÃO SOBRE O MESTRE', String(data.concordancia_com_mestre).replace(/_/g, ' ')))
  }
  if (data.parecer_geral && !looksLikePrompt(data.parecer_geral)) {
    blocks.push(section('PARECER GERAL', String(data.parecer_geral)))
  }

  const erros = Array.isArray(data.erros_de_analise) ? data.erros_de_analise : []
  if (erros.length > 0) {
    blocks.push(section('ERROS DE ANÁLISE', erros.map((e: any) => {
      if (!e || typeof e !== 'object') return ''
      return formatListItem([
        e.descricao ?? '',
        e.tipo ? `Tipo: ${e.tipo}` : '',
        e.gravidade ? `Gravidade: ${e.gravidade}` : '',
        e.onde ? `Onde: ${e.onde}` : '',
        e.correcao ? `Correção: ${e.correcao}` : '',
      ])
    }).filter(Boolean).join('\n\n')))
  }

  const validacoes = Array.isArray(data.validacoes) ? data.validacoes : []
  if (validacoes.length > 0) {
    blocks.push(section('VALIDAÇÕES', validacoes.map((v: any) => {
      if (!v || typeof v !== 'object') return ''
      return formatListItem([v.ponto ?? '', v.por_que_esta_correto ?? ''])
    }).filter(Boolean).join('\n\n')))
  }

  const melhorias = Array.isArray(data.melhorias) ? data.melhorias : []
  if (melhorias.length > 0) {
    blocks.push(section('MELHORIAS', melhorias.map((m: any) => {
      if (!m || typeof m !== 'object') return ''
      return formatListItem([m.sugestao ?? '', m.beneficio ? `Benefício: ${m.beneficio}` : ''])
    }).filter(Boolean).join('\n\n')))
  }

  const alertas = Array.isArray(data.alertas_criticos) ? data.alertas_criticos.filter(Boolean) : []
  if (alertas.length > 0) {
    blocks.push(section('ALERTAS CRÍTICOS', alertas.map((a: any) => `• ${typeof a === 'string' ? a : a?.alerta ?? ''}`).join('\n')))
  }

  if (data.recomendacao_final && !looksLikePrompt(data.recomendacao_final)) {
    blocks.push(section('RECOMENDAÇÃO FINAL', String(data.recomendacao_final)))
  }

  return blocks.filter(Boolean).join('\n\n')
}

function formatGeneric(data: any): string {
  if (typeof data === 'string') {
    return looksLikePrompt(data) ? '' : data
  }
  if (!data || typeof data !== 'object') return ''

  const blocks: string[] = []
  for (const [key, value] of Object.entries(data)) {
    if (HIDDEN_KEYS.has(key) || looksLikePrompt(value) || isEmpty(value)) continue
    const title = key.replace(/_/g, ' ').toUpperCase()
    if (Array.isArray(value)) {
      const items = value.map((item) => {
        if (typeof item === 'string') return looksLikePrompt(item) ? '' : `• ${item}`
        if (!item || typeof item !== 'object') return ''
        const parts = Object.entries(item)
          .filter(([k, v]) => !HIDDEN_KEYS.has(k) && !looksLikePrompt(v) && !isEmpty(v))
          .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
        return formatListItem(parts)
      }).filter(Boolean)
      if (items.length) blocks.push(section(title, items.join('\n\n')))
      continue
    }
    if (typeof value === 'object') {
      const nested = formatGeneric(value)
      if (nested) blocks.push(section(title, nested))
      continue
    }
    blocks.push(section(title, String(value)))
  }
  return blocks.filter(Boolean).join('\n\n')
}

function detectAgent(data: any): string | null {
  if (!data || typeof data !== 'object') return null
  if (data.linha_estado_processual || data.fatos_provas || data.tese_principal) return 'basile'
  if (data.contra_argumentos || data.tese_contraparte) return 'advocado'
  if (data.probabilidade_acolhimento || data.recomendacao_judicial) return 'cabeca'
  if (data.icp_basile) return 'auditor'
  if (data.sintese_executiva || data.decisao_necessaria || data.proximo_movimento) return 'mestre'
  if (data.parecer_geral || data.erros_de_analise || data.concordancia_com_mestre) return 'orientacoes'
  return null
}

export function formatAgentOutput(data: any, agent?: string): string {
  const obj = normalizeAgentResult(data)
  if (!obj) return ''
  if (typeof obj === 'string') return looksLikePrompt(obj) ? '' : obj

  const kind = agent || detectAgent(obj)
  let text = ''
  switch (kind) {
    case 'basile':
      text = formatBasile(obj)
      break
    case 'advocado':
      text = formatAdvogado(obj)
      break
    case 'cabeca':
      text = formatCabeca(obj)
      break
    case 'auditor':
      text = formatAuditor(obj)
      break
    case 'mestre':
      text = formatMestre(obj)
      break
    case 'orientacoes':
      text = formatOrientacoes(obj)
      break
    default:
      text = formatGeneric(obj)
  }

  if (text.trim()) return text.trim()
  return formatGeneric(obj).trim()
}
