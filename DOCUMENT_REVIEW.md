# Leitura documental dos seis agentes e PDFs de até 200 MB

## Atualização: arquivos extensos

- Limite de 200 MiB por PDF (`MAX_PDF_BYTES`), validado no navegador, preparação do upload, gravação, cadastro e abertura do original. O total selecionado por análise é limitado a 512 MiB.
- Upload direto ao armazenamento; envio local ou fallback em partes de até 3 MiB, com validação do tamanho de cada parte e montagem antes do cadastro. Assim, uma requisição de entrada não precisa transportar os 200 MiB. Partes de envios concluídos são removidas; envios abandonados podem deixar temporários em `upload-parts/`, que devem ter uma política de expiração no armazenamento.
- Prévia de metadados em trechos menores. A capa estruturada do Projudi prevalece sobre processos anexados; classe hierárquica e polo ativo são reconhecidos sem IA quando legíveis.
- Os seis agentes fazem leitura própria dos originais, em lotes de até oito páginas. A análise só termina após todos os agentes previstos no modo concluírem as páginas e a síntese. Falhas interrompem a conclusão e preservam o que já foi processado.
- Checkpoints vinculados ao agente, provedor/modelo, missão, corte temporal, documentos e respectivos hashes. Retomadas não repetem lotes concluídos. Mudanças nesses parâmetros exigem nova análise. Uma trava transacional impede duas execuções simultâneas do mesmo registro.
- Cada requisição tem duração limitada e processa até seis lotes por agente. O navegador solicita a próxima etapa automaticamente. Ao fechar a página, o processamento para após a etapa em curso; o botão **Retomar leitura dos documentos** no resultado continua com o mesmo registro. Não há worker autônomo em segundo plano.
- Notas extensas são consolidadas hierarquicamente, sem excluir os registros originais por lote. As consolidações também são preservadas para retomada. Resultados e checkpoints ficam em blobs imutáveis, fora do limite de 1 MiB do Firestore; falhas na recuperação desses blobs não são tratadas como resultados vazios.
- A interface mostra páginas processadas/total por agente. Processamento de todas as páginas não garante compreensão perfeita ou acerto jurídico; ressalvas e evidências permanecem disponíveis.

Testes: `npm run test:documents`. Para verificar o transporte das 618 páginas do exemplo aos seis agentes com respostas simuladas, defina `PDF_REGRESSION_FILE` com o caminho local do PDF e execute `npx tsx --test tests/large-pdf.test.ts`. O documento do usuário não é incluído no repositório. Esses testes não fazem chamadas pagas nem avaliam a qualidade do raciocínio jurídico.

A causa era estrutural: o Mestre recebia somente interpretações anteriores; o Orientador recebia texto truncado. `callLLM` não transportava documentos. A persistência podia registrar tamanho e prévia mesmo quando o texto completo não era salvo.

## Implementação

- Uploads calculam SHA-256 e tamanho a partir dos bytes armazenados. O cadastro antigo usava caminho + horário, causando falsa divergência de integridade. `npx tsx --require dotenv/config scripts/repair-document-hashes.ts <IDs>` verifica esse padrão; `--apply` corrige apenas correspondências comprovadas e preserva o valor anterior. A nova referência comprova o arquivo atual, não sua integridade retroativa.
- A análise, inclusive SOMENTE_BASILE, abre os originais antes de executar agentes, sem depender da extração manual. Todos os documentos passam pela revisão em lotes. Originais indisponíveis bloqueiam o início. Resultados antigos não são recalculados automaticamente.
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

Lotes acima de 8 MiB codificados são subdivididos; uma página isolada excessiva fica explicitamente não processada. Textos densos são fragmentados sem descarte. O orçamento de originais é 512 MiB por execução, com até 200 MiB por arquivo. A síntese consolida notas quando necessário e mantém orçamento explícito de contexto: quando comparações/fontes externas ainda excedem esse orçamento, os registros permanecem e a síntese fica pendente, sem corte silencioso. Há até duas rodadas de consulta complementar por execução. Tempo é reservado para persistir resultados antes dos limites das rotas.

O fluxo da análise inicial tem retomada automática enquanto a página está aberta e retomada manual pelo resultado. Uma nova solicitação na mesa é uma revisão distinta, limitada ao prazo daquela solicitação; a retomada do processamento principal não se confunde com uma nova pergunta. Acervos ilegíveis, páginas isoladas que excedam o transporte do provedor e falhas de IA ficam explicitamente pendentes. O acesso do sistema continua compartilhado entre usuários autenticados, conforme a política existente.

## Validação

`npm run test:documents`: 22 testes determinísticos, sem chamadas pagas. Cobrem anexos dos três provedores; dois revisores com o mesmo acervo; conteúdo após 15 mil caracteres e últimas páginas dentro dos PDFs enviados; consulta complementar; OCR/ausência de OCR; páginas densas; seleção inválida; preservação e falha de armazenamento; checkpoints; conversas posteriores; SSE; SOMENTE_BASILE; formatação legada; distribuição das fontes de pesquisa aos seis agentes e repetição somente da interpretação.

`npm run build`: passou com `typescript.ignoreBuildErrors: false`. `npx tsc --noEmit --pretty false` também passou. `npm run lint` passou sem erros, com 23 avisos preexistentes de variáveis não usadas, navegação e exportação anônima.

Os testes com respostas simuladas comprovam transporte, controle e persistência; não comprovam raciocínio independente real. Uma avaliação de modelo deve usar documentos conhecidos com evidência contrária às respostas anteriores, aferir citações e correções, e registrar provedor/modelo e custo. Nenhuma chamada paga foi feita nesta validação.

Contratos consultados: [OpenAI file inputs](https://developers.openai.com/api/docs/guides/file-inputs), [Anthropic PDF support](https://platform.claude.com/docs/en/build-with-claude/pdf-support), [Gemini document understanding](https://ai.google.dev/gemini-api/docs/document-processing).
