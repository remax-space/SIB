import bcrypt from 'bcryptjs';
import { upsertAnalysisByJobId } from '../lib/repo/analyses';
import { upsertCaseByProcessNumber } from '../lib/repo/cases';
import { upsertProviderConfig } from '../lib/repo/providers';
import { upsertUser } from '../lib/repo/users';

async function main() {
  console.log('Seeding SIB Firestore...');

  // --- Contas administrativas (login mestre) ---
  // Conta mestre do Operador
  await upsertUser({
    email: 'basile@sib.local',
    password: await bcrypt.hash('Plhdlh@0103', 10),
    name: 'Operador',
    role: 'ADMIN',
  });

  // Conta interna de verificação (não divulgar)
  await upsertUser({
    email: 'abacus-f76835ba@example.com',
    password: await bcrypt.hash('s6UhuJm2@e', 10),
    name: 'QA',
    role: 'ADMIN',
  });

  // Upsert 3 sample cases
  const case1 = await upsertCaseByProcessNumber({
      caseId: '5000001-01.2026.8.09.0000',
      title: 'Apelação Cível — Contrato de Compra e Venda',
      clientName: 'Maria Silva Santos',
      clientDoc: '123.456.789-00',
      classText: 'Apelação',
      primaryRole: 'RECURSO',
      status: 'ATIVO',
      objective: 'Reverter sentença de primeiro grau que julgou improcedente a ação de rescisão contratual com devolução de valores.',
      cutoffDate: '2026-09-01',
      notes: 'Cliente alega vício redibitório no imóvel adquirido.',
  });

  const case2 = await upsertCaseByProcessNumber({
      caseId: '0800123-45.2026.5.01.0001',
      title: 'Mandado de Segurança — Licença Ambiental',
      clientName: 'Fazenda Boa Esperança Ltda.',
      clientDoc: '12.345.678/0001-99',
      classText: 'Mandado de Segurança',
      primaryRole: 'ACAO_CONSTITUCIONAL',
      status: 'ATIVO',
      objective: 'Obter liminar para suspensão da exigência de nova licença ambiental durante ren..',
      notes: 'Urgência: prazo de plantação se encerra em outubro.',
  });

  const case3 = await upsertCaseByProcessNumber({
      caseId: '1000456-78.2025.8.26.0100',
      title: 'Execução de Título Extrajudicial',
      clientName: 'Banco Nacional de Crédito S.A.',
      clientDoc: '98.765.432/0001-11',
      classText: 'Execução',
      primaryRole: 'EXECUCAO',
      status: 'SUSPENSO',
      objective: 'Cobrança de dívida representada por cédula de crédito bancário.',
      notes: 'Devedor apresentou embargos. Penhora sobre imóvel rural.',
  });

  // Sample analysis for case1
  await upsertAnalysisByJobId({
      caseId: String(case1.id),
      jobId: 'SIB-20260905-143022-0001',
      missionLiteral: 'Investigue, audite e conclua este caso pelo Método Basile: fatos, provas, cronologia, contradições, lacunas, tese, contratese, riscos e resistência judicial.',
      authorizedProduct: 'Parecer completo para sustentação oral',
      provider: 'openai',
      modelUsed: 'gpt-5.4',
      runMode: 'COMPLETA',
      status: 'CONCLUIDO',
      documentIds: [],
      currentAgent: null,
      basileResult: {
        missao_registrada: 'Investigue, audite e conclua este caso pelo Método Basile.',
        linha_estado_processual: 'Apelação interposta contra sentença de improcedencia. Fase recursal no TJGO.',
        cronologia: [
          { data: '2024-03-15', evento: 'Contrato de compra e venda firmado', fonte: 'Doc 1' },
          { data: '2024-06-20', evento: 'Constatação de infiltrações e rachaduras', fonte: 'Doc 2' },
          { data: '2024-08-10', evento: 'Notificação extrajudicial ao vendedor', fonte: 'Doc 3' },
          { data: '2025-02-05', evento: 'Sentença de improcedencia', fonte: 'Doc 4' },
        ],
        fatos_provas: [
          { item: 'Vício oculto no imóvel', categoria: 'FATO_PARCIALMENTE_COMPROVADO', evidencia: 'Laudo técnico particular', fonte: 'Doc 2', icp_parcial: 15, classificacao_epistemica: 'FATO_PARCIALMENTE_COMPROVADO' },
          { item: 'Notificação prévia', categoria: 'FATO_DOCUMENTALMENTE_COMPROVADO', evidencia: 'AR com confirmação de recebimento', fonte: 'Doc 3', icp_parcial: 22, classificacao_epistemica: 'FATO_DOCUMENTALMENTE_COMPROVADO' },
        ],
        contradicoes: [
          { descricao: 'Laudo particular vs. vistoria do vendedor', fonte_a: 'Doc 2', fonte_b: 'Doc 5', impacto: 'MÉDIO' },
        ],
        lacunas_probatorias: [
          { fato: 'Ausência de perícia judicial', grau_atual: 'HIPOTESE', prova_ausente: 'Laudo pericial judicial', probabilidade: 'ALTA', risco: 'Fragiliza a tese de vício redibitório' },
        ],
        tese_principal: 'O imóvel possui vícios redibitórios ocultos que ensejam rescisão contratual com restituição integral.',
        registros_obediencia: { missao: true, produto: true, sem_invencao: true },
        observacoes: 'Recomenda-se requerer perícia judicial na fase recursal.',
      },
      advocadoResult: {
        contra_argumentos: [
          { tese_atacada: 'Vício redibitório', argumento: 'Comprador teve oportunidade de vistoria prévia', fonte: 'Doc contrato', gravidade: 'ALTA' },
          { tese_atacada: 'Rescisão contratual', argumento: 'Decadência do art. 445 CC', fonte: 'Código Civil', gravidade: 'MEDIA' },
        ],
        tese_contraparte: 'O comprador aceitou o imóvel nas condições em que se encontrava.',
        pontos_frageis: [
          { ponto: 'Ausência de perícia judicial', risco: 'Prova fragilizada', mitigacao: 'Requerer perícia em segunda instância' },
        ],
        riscos_identificados: ['Decadência', 'Prova insuficiente', 'Aceitação tácita'],
      },
      cabecaResult: {
        probabilidade_acolhimento: 'MEDIA',
        fundamento_decisao_provavel: 'A ausência de perícia judicial será o ponto central da decisão recursal.',
        precedentes_relevantes: ['STJ REsp 1.123.456', 'TJGO Apelação 5001234-56'],
        riscos_judiciais: [
          { risco: 'Manutenção da sentença', probabilidade: 'MÉDIA', impacto: 'ALTO' },
        ],
        recomendacao_judicial: 'Concentrar esforços na produção de prova pericial.',
      },
      auditorResult: {
        inventario_integridade: [
          { documento: 'Contrato de Compra e Venda', status_leitura: 'LIDO_INTEGRALMENTE', paginas: 12, observacao: 'Completo' },
          { documento: 'Laudo Técnico', status_leitura: 'LIDO_INTEGRALMENTE', paginas: 8, observacao: 'Particular, não judicial' },
        ],
        classificacao_epistemica: [
          { item: 'Contrato firmado', categoria: 'FATO_DOCUMENTALMENTE_COMPROVADO', fundamento: 'Documento assinado pelas partes' },
          { item: 'Vício oculto', categoria: 'FATO_PARCIALMENTE_COMPROVADO', fundamento: 'Suportado apenas por laudo particular' },
        ],
        icp_basile: {
          autenticidade: { score: 20, justificativa: 'Documentos originários, mas sem certificação digital' },
          completude: { score: 14, justificativa: 'Falta perícia judicial e documentação do vendedor' },
          corroboracao: { score: 12, justificativa: 'Laudo particular sem corroboração independente' },
          coerencia_cronologica: { score: 13, justificativa: 'Cronologia coerente e bem documentada' },
          contraditorio: { score: 6, justificativa: 'Contraditório parcialmente exercido' },
          validade_formal: { score: 8, justificativa: 'Documentos formalmente válidos' },
          total: 73,
          faixa: 'Moderadamente Sustentável',
        },
      },
      mestreResult: {
        decisao_necessaria: 'Decidir entre prosseguir com a apelação ou buscar composição amigável.',
        objetivo_processual: 'Reforma da sentença com determinação de perícia judicial.',
        medidas_prioritarias: [
          { ordem: 1, medida: 'Requerer conversão do julgamento em diligência para perícia', prazo: '15 dias', responsavel: 'Operador' },
          { ordem: 2, medida: 'Preparar quesitos técnicos detalhados', prazo: '10 dias', responsavel: 'Assistente técnico' },
          { ordem: 3, medida: 'Verificar prazo decadencial do art. 445 CC', prazo: 'Imediato', responsavel: 'Operador' },
        ],
        prazo_critico: 'Sustentação oral na sessão de julgamento prevista para outubro/2026.',
        riscos_principais: [
          { risco: 'Manutenção da sentença por insuficiência probatória', probabilidade: 'MÉDIA', impacto: 'ALTO' },
        ],
        resultado_esperado: 'Anulação parcial da sentença com determinação de perícia.',
        alternativas_juridicas: [
          { alternativa: 'Composição amigável com abatimento proporcional', vantagem: 'Celeridade e certeza', desvantagem: 'Possível perda financeira' },
          { alternativa: 'Ação estimatória (quanti minoris)', vantagem: 'Mantém o contrato', desvantagem: 'Novo processo' },
        ],
        proximo_movimento: 'Preparar peça de sustentação oral focada na necessidade de perícia judicial.',
        sintese_executiva: 'O caso apresenta fundamentos moderados para reforma, porém depende criticamente da produção de prova pericial judicial. A estratégia recomendada é requerer conversão em diligência antes do julgamento da apelação.',
      },
      icpScore: 73,
      exitCode: 0,
      completedAt: new Date(),
  });

  // Seed provider configs
  for (const [key, val] of Object.entries({
    openai: 'gpt-5.4',
    anthropic: 'claude-sonnet-4-6',
    gemini: 'gemini-3.8-flash',
  })) {
    await upsertProviderConfig({
      provider: key,
      apiKey: '',
      model: val,
      enabled: true,
    });
  }

  console.log('Seed complete!', { case1: case1.id, case2: case2.id, case3: case3.id });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
