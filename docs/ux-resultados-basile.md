# SIB: resultados públicos e instruções padrão

## Visualização ampliada e fontes integradas

Todos os resultados públicos e as respostas da tela inicial têm um visualizador amplo compartilhado, com rolagem, título acessível, fechamento por Escape e controle de foco do Radix Dialog. A mesa de conversação e a lista de sínteses também permitem ampliar as respostas.

As fontes de pesquisa podem ser lidas dentro do SIB usando todo o texto recebido e persistido, sem corte visual. O sistema não apresenta um trecho retornado pela pesquisa como inteiro teor: essa limitação aparece no visualizador. Seleções salvas aparecem em “Fontes integradas ao SIB”, inclusive após recarregar, com possibilidade de reabrir e utilizar a seleção. As leituras validam o vínculo entre caso, análise e seleção no servidor.

Foram removidos os placeholders de número do processo, documento e nome do cliente. Nesta alteração, passaram 53 testes de apresentação/pesquisa, o lint dirigido e o build. A inspeção visual continuou bloqueada pela indisponibilidade do navegador.

## Diagnóstico confirmado

O formatador anterior percorria objetos arbitrários e serializava propriedades internas. APIs de análise e exportações devolviam registros completos; o histórico de pesquisa também incluía respostas brutas do provedor. A missão aparecia no formulário e era fornecida pelo cliente. O SSE não transmitia tokens do modelo, mas transmitia mensagens de erro operacionais.

## Implementação

- Contrato público validado com Zod: seções, atenção e fontes. Mapeamentos explícitos para os sete resultados; objetos desconhecidos não são serializados. Conteúdo incompatível recebe aviso e alternativa de nova análise, preservando o original.
- Projeção no servidor nas APIs de análise, casos, estatísticas e conversas. Histórico, cópia e exportação usam o mesmo conteúdo público. Resultados volumosos são recuperados do armazenamento antes da projeção.
- Pesquisa jurídica tem projeção própria para registros, fontes e seleção. O texto efetivamente enviado fica disponível antes da confirmação; respostas brutas, identificadores do provedor e caminhos de armazenamento permanecem privados.
- Fontes jurídicas são associadas à execução ou à conversa que as recebeu. Uma seleção posterior não é retroativamente atribuída a respostas antigas. Declaração do modelo não torna uma citação conferida.
- Fontes documentais mantêm nome, trecho, página válida e acesso autenticado ao original. Entidades são decodificadas uma vez e renderizadas como texto, sem HTML injetado.
- SSE transmite eventos de progresso e conclusão, sem resposta interna. Erros públicos são recuperáveis; índice documental aceita apenas número finito no intervalo permitido.
- Configurações → Método Basile → Instruções padrão: leitura, edição administrativa, cancelar, estado não salvo e restauração confirmada. Autorização no servidor, concorrência otimista, padrão original preservado e versão registrada por execução. O escopo é a instalação compartilhada já existente.
- Formulário inicial mais curto, objetivo opcional, rótulos associados e erros próximos aos campos. Rascunhos em memória da sessão preservam campos e arquivo durante navegação. Retentativas reaproveitam caso/documento e recuperam resultados parciais.
- Resultado principal em destaque, revisões sob demanda, fontes consultáveis, navegação móvel e estados de processamento sem percentuais inventados.

## Exemplo sintético

Antes: propriedades como `documentoId`, `sha256`, `revisao_completa: false`, avaliações repetidas e missão no mesmo relatório.

Depois:

> O documento relata atraso na entrega.
>
> **Atenção:** O material não informa se houve recurso. Análise parcial: uma página não pôde ser lida.
>
> **Fontes:** Sentença de exemplo.pdf, página 2 — trecho consultável; conferir contexto no original.

Isso é um exemplo de apresentação, não uma conclusão jurídica validada.

## Verificação e limites

Foram executados testes de documentos, rotas reais com dependências externas simuladas, pesquisa e apresentação pública. Cobrem saída malformada, dados internos, parcialidade, ausência de evidência, divergência, texto longo, legado, entidades, streaming, cópia, configuração, autorização e restauração. Fixtures novas são sintéticas.

A verificação de tipos e o build final de produção passaram. Foram aprovados 89 testes distintos: 32 de documentos/rotas, 39 de pesquisa, 5 de MCP e 13 de apresentação pública. O lint global não apresentou erros (21 avisos naquela execução); o aviso do formatador alterado foi corrigido e o lint dirigido aos últimos arquivos modificados passou sem avisos.

Inspeções anteriores cobriram início, configurações e navegação móvel em 390 × 844. A tentativa de reinspecionar a versão final foi bloqueada pela indisponibilidade da conexão com o navegador. Portanto, a inspeção final de desktop, mobile, teclado, zoom e contraste permanece pendente; não se declara conformidade WCAG integral.

Não houve chamada real paga aos modelos ou pesquisa externa, teste de gravação em Firestore de produção nem validação com usuários representativos. A persistência e as permissões foram verificadas com simulações nas rotas. Validar com usuários se conseguem iniciar, compreender uma limitação e localizar uma fonte continua pendente.

Rascunhos são temporários: não sobrevivem a recarga completa ou encerramento da sessão. Registros legados sem estrutura reconhecível exigem nova análise; o conteúdo original permanece armazenado. A política elimina serialização genérica e campos internos, mas não substitui avaliação semântica da qualidade das respostas dos modelos.
