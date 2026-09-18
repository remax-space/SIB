# Acesso documental de Mestre e Orientador

A causa era estrutural: o Mestre recebia somente interpretações anteriores; o Orientador recebia texto truncado. `callLLM` não transportava documentos. A persistência podia registrar tamanho e prévia mesmo quando o texto completo não era salvo.

## Implementação

- `lib/document-sources.ts`: valida seleção, abre originais via `readStoredFile`, confere SHA-256, conta páginas físicas e identifica recursos visuais. Os originais são baixados uma vez por execução e compartilhados pelos dois revisores.
- `lib/llm-documents.ts` e `lib/llm.ts`: contrato comum de anexos. OpenAI usa Responses/input_file; Anthropic usa document/base64; Gemini usa inline_data/application/pdf. Cada anexo identifica documento, hash e páginas originais.
- `lib/document-review.ts`: cada revisor percorre o acervo em lotes de até oito páginas antes de receber as interpretações anteriores. A síntese pode solicitar páginas complementares, com validação do identificador e da página. Modelos sem suporte PDF confirmado usam texto por página e OCR visual quando necessário/disponível.
- `lib/agent-prompts.ts`: missão, corte temporal, fontes e limitações explícitos; conclusões anteriores são interpretações a verificar, não provas. Campos antigos preservados e fundamentos novos acrescentados.
- Rotas de análise e conversa: mantêm autenticação, seleção, SSE, identificadores e SOMENTE_BASILE. Checkpoints são persistidos durante a leitura. A conversa mantém controle transacional de revisão e armazena resultados grandes fora do documento Firestore.
- `lib/repo/documents.ts`, `lib/repo/text-store.ts`, `lib/extraction-integrity.ts` e rotas de extração/consulta: prévia, texto armazenado, texto parcial, ausência e falhas são distintos. Novas extrações usam blobs imutáveis com ponteiro transacional. Falha de gravação ou extração inferior não substitui a versão anterior. Nenhuma quantidade de caracteres implica leitura integral.
- `components/document-review.tsx`, `lib/format-document-review.ts`, `lib/format-agent-output.ts`, telas de análise/orientações e mesa: apresentam fundamentos e cobertura, com compatibilidade para resultados antigos.
- Dependência `pdf-lib` para separar páginas sem substituir o original por uma reconstrução textual. `package.json` inclui `test:documents`; os lockfiles existentes foram preservados e atualizados para a dependência.

## Cobertura e limites

`envio_tentado`, `enviado` e `processado` são registros distintos. Uma resposta válida do provedor não comprova compreensão integral. Trechos são conferidos contra a camada textual da página física; isso verifica correspondência textual, não a verdade jurídica da afirmação. Evidências visuais/OCR continuam marcadas como não verificadas automaticamente.

Lotes acima de 8 MiB codificados são subdivididos; uma página isolada excessiva fica explicitamente não processada. Textos densos são fragmentados sem descarte. O orçamento de originais é 128 MiB por execução. A síntese tem orçamento explícito de contexto: quando excedido, os registros por lote permanecem e a síntese fica parcial, sem corte silencioso. Há até duas rodadas de consulta complementar. Tempo é reservado para persistir resultados antes dos limites das rotas.

Não há worker ou retomada automática de páginas pendentes: outra solicitação na mesa inicia uma nova revisão. Acervos que não couberem no tempo, memória ou contexto ficam parciais e identificam páginas pendentes; não são apresentados como revisão documental integral. O acesso do sistema continua compartilhado entre usuários autenticados, conforme a política existente; não foi criada uma política fictícia de propriedade de casos.

## Validação

`npm run test:documents`: 22 testes determinísticos, sem chamadas pagas. Cobrem anexos dos três provedores; dois revisores com o mesmo acervo; conteúdo após 15 mil caracteres e últimas páginas dentro dos PDFs enviados; consulta complementar; OCR/ausência de OCR; páginas densas; seleção inválida; preservação e falha de armazenamento; checkpoints; conversas posteriores; SSE; SOMENTE_BASILE; formatação legada; distribuição das fontes de pesquisa aos seis agentes e repetição somente da interpretação.

`npm run build`: passou com `typescript.ignoreBuildErrors: false`. `npx tsc --noEmit --pretty false` também passou. `npm run lint` passou sem erros, com 23 avisos preexistentes de variáveis não usadas, navegação e exportação anônima.

Os testes com respostas simuladas comprovam transporte, controle e persistência; não comprovam raciocínio independente real. Uma avaliação de modelo deve usar documentos conhecidos com evidência contrária às respostas anteriores, aferir citações e correções, e registrar provedor/modelo e custo. Nenhuma chamada paga foi feita nesta validação.

Contratos consultados: [OpenAI file inputs](https://developers.openai.com/api/docs/guides/file-inputs), [Anthropic PDF support](https://platform.claude.com/docs/en/build-with-claude/pdf-support), [Gemini document understanding](https://ai.google.dev/gemini-api/docs/document-processing).
