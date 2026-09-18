# Legaw MCP no SIB

## Configuração

1. Na Legaw, abra **Conexões → Chaves de integração** e crie uma chave.
2. No servidor, configure `LEGAW_MCP_KEY` no `.env` (desenvolvimento) ou no gerenciador de segredos da hospedagem (produção). Reinicie o Next.js.
3. Entre como ADMIN em **Jurisprudência → Conexão MCP — Legaw**. Confirme que sua conta autoriza acesso compartilhado e armazenamento/reutilização de resultados e clique em **Conectar Legaw**.
4. A conexão verifica `initialize` e `tools/list`, sem executar pesquisa. Depois abra uma análise concluída, prepare o plano, revise os dados e confirme a pesquisa.

```dotenv
LEGAW_MCP_KEY=sua_chave_de_integracao
```

A chave permanece exclusivamente no ambiente do servidor. Não é salva em Settings, retornada pela API, enviada aos agentes ou incluída no JavaScript do navegador. `.env` está ignorado pelo Git. `.env.example` contém apenas placeholders. Restrinja o acesso ao segredo aos operadores do servidor. Não use NEXT_PUBLIC_*.

Trocar/remover a chave desativa a conexão até nova verificação administrativa. Desconectar no SIB bloqueia novas pesquisas e preserva o histórico. Para revogar a chave no provedor, use Conexões → Chaves de integração na Legaw. Execuções já enviadas podem continuar remotamente.

## Contrato e transporte

O caminho ativo usa **MCP remoto via Streamable HTTP**, em `https://api.legaw.ai/v1/mcp`, autenticado com Bearer da chave de integração. SDK fixado: `@modelcontextprotocol/sdk@1.30.0`. Não executa npx ou subprocessos nas requisições e não faz fallback automático para REST.

Consultados em 18/09/2026: [documentação Legaw](https://legaw.ai/docs/mcp), [descoberta OAuth](https://api.legaw.ai/.well-known/oauth-authorization-server), [recurso MCP](https://api.legaw.ai/.well-known/oauth-protected-resource/v1/mcp), [pacote legaw-mcp](https://registry.npmjs.org/legaw-mcp), [OpenAPI](https://api.legaw.ai/openapi.json), [transporte MCP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports), [termos](https://legaw.ai/termos) e [privacidade](https://legaw.ai/privacidade).

A seção Outros assistentes oferece chave de integração para clientes sem login automático. O SIB usa essa modalidade a pedido do operador. OAuth existe na Legaw, mas este fluxo não precisa de callback ou refresh token. A antiga variável LEGAW_API_KEY não ativa o MCP. O adaptador REST anterior permanece como referência coberta por fixtures; o serviço escolhe legawMcpAdapter.

Ferramentas permitidas: buscar_jurisprudencia, buscar_legislacao, ler_inteiro_teor e conferir_citacoes. Antes da execução, o SIB obtém o catálogo e valida os argumentos contra o schema anunciado. Ferramenta ausente/schema incompatível bloqueia tools/call. Aceita respostas JSON e SSE, dados estruturados ou JSON em blocos de texto. Instruções do provedor não iniciam ações adicionais; o envelope original é preservado como dado.

Contrato interno: `legaw-remote-mcp/sdk-1.30.0/docs-2026-09-18/sib-4`. A versão da conexão inclui hash da credencial; rotação invalida planos/cache dessa conexão sem expor o segredo.

## Arquitetura

- lib/research/mcp.ts: cliente MCP, segredo server-side, catálogo, schemas, execução única e leitura limitada.
- lib/research/connection.ts e /api/research/config: status/ativação ADMIN; Settings guarda apenas estado, hash e data de verificação.
- lib/research/service.ts: preparação, confirmação, cache, quotas e execução.
- lib/repo/research.ts: transações, reservas, leases, snapshots e auditoria.
- lib/research/evidence.ts: pacote comum aos seis agentes e auditoria de IDs citados.
- components/legaw-connection.tsx: conexão administrativa; LegalResearch é compartilhado pelas telas de análise, jurisprudência e mesa.

Confirmação vinculada a token aleatório de 256 bits (somente hash persistido), usuário, caso, análise, contexto e parâmetros; validade de 15 minutos. Alterações exigem nova revisão. Acesso compartilhado entre usuários autenticados segue o modelo real do SIB. Confirmação/cancelamento pertencem ao solicitante; configuração exige ADMIN e valida origem/JSON.

Uma confirmação permite **um tools/call**, além das mensagens de inicialização/catálogo. Não há pesquisa recursiva, paginação automática, reconexão ou retry pago. Carregar página, enviar PDF, concluir análise e conversar não consultam silenciosamente. Agentes recebem fontes selecionadas, sem chave nem ferramentas Legaw.

## Limites, persistência e deploy

Prazo único de 55 segundos desde a rota inclui conexão, catálogo, ferramenta e leitura; maxDuration=60 reserva margem para persistência. Sinal propagado ao SDK/fetch. Cancelamento/timeout após despacho gera execução remota incerta: abortar HTTP não prova interrupção nem estorno. Reservas não são devolvidas automaticamente. Lease expirada exige reconciliação administrativa para liberar concorrência.

| Variável | Padrão |
| --- | --- |
| LEGAW_MCP_KEY | ausente; integração começa desativada |
| RESEARCH_USER_DAILY_CALLS | 10 |
| RESEARCH_SHARED_DAILY_CALLS | 30 |
| RESEARCH_SHARED_MONTHLY_CALLS | 200 |
| RESEARCH_CONCURRENT_CALLS | 2 |

Zero bloqueia novas reservas. Quotas persistentes contam tentativas locais, não créditos reais. A Legaw informa agrupamento de pesquisas em um minuto e conferência sem consumo de pesquisa; o SIB não promete preço, gratuidade ou estorno. Rate limits numéricos, idempotência e cancelamento remoto não são garantidos. IA posterior tem custo independente.

Coleções: legalResearch, legalResearchLocks, legalResearchBudgets, legalResearchLifecycle, legalEvidence, legalEvidenceUses. Storage: legal-research/<id>/result-v1.json, criação imutável e hash verificado na leitura. Cache: sete dias para jurisprudência e um dia para demais ferramentas. Contexto alterado/fontes vencidas exigem reavaliação. Fontes posteriores ao corte exigem escolha explícita.

Índice: legalResearch(analysisId ASC, createdAt DESC), em firestore.indexes.json. Execute `npm run indexes:deploy` no destino autorizado. Sem migração de resultados antigos. Regras cliente Firestore/Storage continuam deny-all; autorização no servidor. Exclusão de caso usa marcador transacional, remove registros/blobs sem referências externas e permite retomada após falha. A retenção de pesquisas de análises excluídas individualmente ainda requer política definida.

DataJud e provedores legados permanecem distintos. Reinterpretação usa fontes persistidas; nova análise preserva a anterior. Mestre e Orientador mantêm originais. Auditoria de IDs não comprova fidelidade textual ou correção jurídica.

## Validação e pendências

`tests/mcp.test.ts` usa SDK real e transporte simulado: handshake, catálogo sem pesquisa, sessão, JSON/SSE, quatro ferramentas, schema incompatível, erros HTTP sem vazamento, abort sem replay, ativação e rotação. A suíte de pesquisa cobre confirmação/cache/quotas/concorrência simulada/incerteza/evidências; a documental verifica o pipeline e o pacote comum aos seis agentes.

Comandos: `npm run test:research`, `npm run test:documents`, `npx tsc --noEmit --pretty false`, `npm run lint`, `npm run build` com TypeScript habilitado.

Validação registrada: 40 testes de pesquisa/MCP e 22 documentais passaram; TypeScript passou e lint apresentou zero erros (23 avisos anteriores).

Não foi usada credencial real nem realizada pesquisa paga. A conexão com sua conta será comprovada após configurar a chave e clicar em Conectar. Testes de transação são simulados; emulador Firestore e validação visual autenticada/móvel continuam pendentes. Não confundir build/testes com homologação em produção.

O operador deve confirmar que sua conta permite credencial organizacional, acesso compartilhado e snapshots fora da Legaw. Os termos distinguem conta pessoal, Assentos e sistemas similares (7.4.1, 8.1–8.4, 9.5–9.6). A declaração administrativa registra essa confirmação; não concede direitos nem substitui o contrato do provedor.
