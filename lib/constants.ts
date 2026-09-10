export const SIB_VERSION = '17.0 R2';
export const SIB_BUILD_DATE = '2026-09-07';

export const LEGAL_CLASSES = [
  { value: 'ACAO_INOMINADA', label: 'Ação Inominada', role: 'ACAO_CONHECIMENTO' },
  { value: 'MANDADO_SEGURANCA', label: 'Mandado de Segurança', role: 'ACAO_CONSTITUCIONAL' },
  { value: 'HABEAS_CORPUS', label: 'Habeas Corpus', role: 'ACAO_CONSTITUCIONAL' },
  { value: 'HABEAS_DATA', label: 'Habeas Data', role: 'ACAO_CONSTITUCIONAL' },
  { value: 'MANDADO_INJUNCAO', label: 'Mandado de Injunção', role: 'ACAO_CONSTITUCIONAL' },
  { value: 'ACAO_POPULAR', label: 'Ação Popular', role: 'ACAO_CONSTITUCIONAL' },
  { value: 'ACAO_CIVIL_PUBLICA', label: 'Ação Civil Pública', role: 'ACAO_CONSTITUCIONAL' },
  { value: 'RECLAMACAO_CONSTITUCIONAL', label: 'Reclamação Constitucional', role: 'ACAO_CONSTITUCIONAL' },
  { value: 'ADI', label: 'ADI — Ação Direta de Inconstitucionalidade', role: 'CONTROLE_ABSTRATO' },
  { value: 'ADC', label: 'ADC — Ação Declaratória de Constitucionalidade', role: 'CONTROLE_ABSTRATO' },
  { value: 'ADPF', label: 'ADPF — Arguição de Descumprimento de Preceito Fundamental', role: 'CONTROLE_ABSTRATO' },
  { value: 'ADO', label: 'ADO — Ação Direta de Inconstitucionalidade por Omissão', role: 'CONTROLE_ABSTRATO' },
  { value: 'APELACAO', label: 'Apelação', role: 'RECURSO' },
  { value: 'RESP', label: 'REsp — Recurso Especial', role: 'RECURSO' },
  { value: 'ARESP', label: 'AREsp — Agravo em Recurso Especial', role: 'RECURSO' },
  { value: 'RE', label: 'RE — Recurso Extraordinário', role: 'RECURSO' },
  { value: 'ARE', label: 'ARE — Agravo em Recurso Extraordinário', role: 'RECURSO' },
  { value: 'AGRAVO_PETICAO', label: 'Agravo em Petição', role: 'RECURSO' },
  { value: 'RECURSO_REVISTA', label: 'Recurso de Revista', role: 'RECURSO' },
  { value: 'RESE', label: 'RESE — Recurso em Sentido Estrito', role: 'RECURSO' },
  { value: 'AGRAVO_EXECUCAO_PENAL', label: 'Agravo em Execução Penal', role: 'RECURSO' },
  { value: 'EXECUCAO', label: 'Execução', role: 'EXECUCAO' },
  { value: 'EXECUCAO_FISCAL', label: 'Execução Fiscal', role: 'EXECUCAO' },
  { value: 'CUMPRIMENTO_SENTENCA', label: 'Cumprimento de Sentença', role: 'EXECUCAO' },
  { value: 'ACAO_CONHECIMENTO', label: 'Ação de Conhecimento (genérica)', role: 'ACAO_CONHECIMENTO' },
] as const;

export const ROLE_LABELS: Record<string, string> = {
  RECURSO: 'Recurso',
  ACAO_CONSTITUCIONAL: 'Ação Constitucional',
  CONTROLE_ABSTRATO: 'Controle Abstrato',
  EXECUCAO: 'Execução',
  INCIDENTE: 'Incidente',
  ACAO_CONHECIMENTO: 'Ação de Conhecimento',
};

export const CASE_STATUSES = [
  { value: 'ATIVO', label: 'Ativo', color: 'bg-emerald-500/20 text-emerald-400' },
  { value: 'SUSPENSO', label: 'Suspenso', color: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'ENCERRADO', label: 'Encerrado', color: 'bg-gray-500/20 text-gray-400' },
  { value: 'ARQUIVADO', label: 'Arquivado', color: 'bg-red-500/20 text-red-400' },
] as const;

export const READ_STATUSES = [
  { value: 'PENDENTE', label: 'Pendente', color: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'LIDO_INTEGRALMENTE', label: 'Lido Integralmente', color: 'bg-emerald-500/20 text-emerald-400' },
  { value: 'LIDO_PARCIALMENTE', label: 'Lido Parcialmente', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'ILEGIVEL', label: 'Ilegível/Incompleto', color: 'bg-red-500/20 text-red-400' },
] as const;

export const ANALYSIS_STATUSES = [
  { value: 'PENDENTE', label: 'Pendente', color: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'EM_ANDAMENTO', label: 'Em Andamento', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'CONCLUIDO', label: 'Concluído', color: 'bg-emerald-500/20 text-emerald-400' },
  { value: 'ERRO', label: 'Erro', color: 'bg-red-500/20 text-red-400' },
] as const;

export const PROVIDER_MODELS: Record<string, { label: string; model: string; icon: string; envVar: string }> = {
  openai: { label: 'OpenAI', model: 'gpt-4o', icon: '🤖', envVar: 'OPENAI_API_KEY' },
  anthropic: { label: 'Claude', model: 'claude-sonnet-4-20250514', icon: '🧠', envVar: 'ANTHROPIC_API_KEY' },
  gemini: { label: 'Gemini', model: 'gemini-2.0-flash', icon: '✨', envVar: 'GEMINI_API_KEY' },
};

export const AGENTS = [
  { key: 'basile', label: 'BASILE', subtitle: 'Investigador', icon: '🔍' },
  { key: 'advocado', label: 'ADVOGADO DO DIABO', subtitle: 'Contraditório', icon: '⚔️' },
  { key: 'cabeca', label: 'CABEÇA DO JUIZ', subtitle: 'Perspectiva Judicial', icon: '⚖️' },
  { key: 'auditor', label: 'AUDITOR DOCUMENTAL', subtitle: 'Integridade', icon: '📋' },
  { key: 'mestre', label: 'MESTRE', subtitle: 'Síntese Estratégica', icon: '🎯' },
  { key: 'orientacoes', label: 'ORIENTADOR', subtitle: 'Revisor Independente', icon: '🧭' },
] as const;

export function getIcpClass(score: number | null | undefined): string {
  const s = score ?? 0;
  if (s >= 90) return 'icp-excellent';
  if (s >= 75) return 'icp-good';
  if (s >= 60) return 'icp-moderate';
  if (s >= 40) return 'icp-low';
  return 'icp-critical';
}

export function getIcpLabel(score: number | null | undefined): string {
  const s = score ?? 0;
  if (s >= 90) return 'Altamente Confiável';
  if (s >= 75) return 'Fortemente Provável';
  if (s >= 60) return 'Moderadamente Sustentável';
  if (s >= 40) return 'Fragilmente Sustentável';
  return 'Criticamente Insuficiente';
}

// Missão padrão do Método Basile — usada quando o operador não digita uma missão própria.
export const DEFAULT_MISSION = 'Investigue, audite e conclua este PDF pelo Método Basile: identifique fatos, provas, cronologia, contradições, lacunas probatórias, tese principal, contratese, riscos e resistência judicial. Cada agente deve analisar o documento de forma independente e trazer suas próprias conclusões, formando a sequência natural do SIB. Ao final, indique objetivamente a melhor conduta do operador, sem inventar dados e sem usar memória como prova.';
