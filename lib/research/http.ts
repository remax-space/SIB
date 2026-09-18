import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { DocumentSelectionError } from '@/lib/document-sources'
import { ResearchError } from './adapter'

export function checkResearchOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin || origin !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new ResearchError('ORIGIN_NOT_ALLOWED', 403)
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new ResearchError('JSON_REQUIRED', 415)
}
export async function researchBody(request: Request) {
  const text = await request.text()
  // Citation verification accepts up to 60,000 characters plus the reviewed
  // plan envelope. Keep a bounded request while allowing that documented tool.
  if (text.length > 96_000) throw new ResearchError('REQUEST_TOO_LARGE', 413)
  try { return JSON.parse(text) as unknown } catch { throw new ResearchError('INVALID_JSON', 400) }
}
const messages: Record<string, string> = {
  RESEARCH_HISTORY_INDEX_PENDING: 'O histórico está aguardando a preparação do banco de dados. Tente carregá-lo novamente em alguns minutos; se persistir, avise o administrador. Nenhuma pesquisa externa foi iniciada por esta leitura.',
  LEGAW_MCP_KEY_MISSING: 'Configure a chave de integração Legaw no servidor (LEGAW_MCP_KEY).',
  LEGAW_SHARED_USE_REQUIRED: 'Confirme que sua conta Legaw permite o uso compartilhado e a conservação das fontes no SIB.',
  LEGAW_MCP_TOOLS_MISSING: 'O MCP não disponibilizou as quatro ferramentas esperadas. A conexão não foi ativada.',
  LEGAW_MCP_SCHEMA_CHANGED: 'Os parâmetros não correspondem ao contrato atual do MCP. Nenhuma ferramenta de pesquisa foi chamada.',
  LEGAW_MCP_FAILURE: 'Falha na conexão MCP. Confira a chave no servidor e consulte o histórico antes de repetir uma pesquisa.',
  LEGAW_MCP_TOOL_ERROR: 'A ferramenta MCP informou falha. O consumo remoto é desconhecido; não haverá repetição automática.',
  CASE_DELETION_IN_PROGRESS: 'O caso está em exclusão. Novas pesquisas e seleções estão bloqueadas; a limpeza pode ser retomada.',
  LEGAW_CONTRACT_PENDING: 'Legaw desconectada. O administrador precisa configurar a chave no servidor e conectar o MCP em Jurisprudência.',
  INTEGRATION_DISABLED: 'Integração desabilitada. O histórico continua disponível.',
  INVALID_APPROVAL: 'Confirmação inválida ou vinculada a outro usuário. Prepare novamente.',
  APPROVAL_EXPIRED: 'A revisão expirou. Prepare e confirme novamente.',
  CONTEXT_CHANGED: 'Os documentos, a missão ou o corte temporal mudaram. Revise novamente o plano.',
  CONNECTION_CHANGED_RECONFIRM: 'A configuração ou o contexto da análise mudou. Prepare e confirme novamente.',
  LOCAL_BUDGET_EXHAUSTED: 'Limite local de chamadas ou concorrência atingido.',
  RESEARCH_IN_PROGRESS: 'Uma pesquisa idêntica já está em andamento. Consulte o histórico.',
  REMOTE_EXECUTION_UNCERTAIN: 'Execução remota incerta. Não haverá repetição automática; verifique com o provedor.',
  DEFINE_PERIOD_WITHIN_CUTOFF: 'Defina o fim do período dentro do corte temporal ou autorize fontes posteriores.',
  SOURCE_DATE_REQUIRES_EXPLICIT_CHOICE: 'Há fonte posterior ao corte ou sem data. Autorize explicitamente seu uso.',
  REASSESS_SOURCE_RELEVANCE: 'Reavalie e aceite a pertinência das fontes vencidas ou de outro contexto.',
  EVIDENCE_CONTEXT_TOO_LARGE: 'As fontes excedem o contexto permitido. Selecione menos fontes; nenhuma será cortada silenciosamente.',
  INVALID_ENDPOINT: 'Endpoint inválido. Use uma URL HTTPS pública e segura.',
  LEGAW_AUTH_INVALID: 'A credencial Legaw foi recusada pelo provedor. Nenhuma repetição automática será feita.',
  LEGAW_FORBIDDEN: 'O provedor Legaw recusou o acesso desta credencial.',
  LEGAW_QUOTA_EXHAUSTED: 'A cota Legaw informada pelo provedor está esgotada. Nenhuma repetição automática será feita.',
  LEGAW_RATE_LIMITED: 'O provedor Legaw limitou a frequência. Nenhuma repetição automática será feita.',
  LEGAW_NOT_FOUND: 'O processo ou recurso solicitado não foi encontrado no provedor Legaw.',
  LEGAW_INPUT_TOO_LARGE: 'O conteúdo enviado excedeu o limite aceito pelo provedor Legaw.',
  LEGAW_BAD_REQUEST: 'O provedor Legaw rejeitou os parâmetros enviados.',
  LEGAW_HTTP_FAILURE: 'O provedor Legaw ficou indisponível após o envio. Consulte o histórico antes de repetir.',
  LEGAW_TRANSPORT_FAILURE: 'Não foi possível confirmar a resposta do provedor Legaw. A execução remota permanece incerta.',
  LEGAW_INVALID_RESPONSE: 'O provedor Legaw devolveu uma resposta que não pôde ser validada. Consulte o histórico antes de repetir.',
  LEGAW_RESULT_TOO_LARGE: 'A resposta do provedor Legaw excedeu o limite local. A execução remota permanece incerta.',
}
export function researchHttpError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: 'Plano inválido. Revise os campos e limites.', issues: error.issues.map(i => ({ path: i.path, message: i.message })) }, { status: 400 })
  if (error instanceof DocumentSelectionError) return NextResponse.json({ error: error.message }, { status: 400 })
  if (error instanceof ResearchError) return NextResponse.json({ error: messages[error.code] ?? 'Não foi possível concluir esta operação de pesquisa.', code: error.code }, { status: error.status })
  return NextResponse.json({ error: 'Falha na operação. Consulte o histórico antes de repetir.' }, { status: 500 })
}
