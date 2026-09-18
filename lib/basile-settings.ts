import { createHash } from 'node:crypto'
import { z } from 'zod'
import { DEFAULT_MISSION } from './constants'
import { getSetting } from './db'

export const BASILE_SETTING_KEY = 'basile-instructions-installation-v1'
// 12,000 characters bounds prompt cost while accommodating the original mission.
export const instructionsSchema = z.string().trim().min(20).max(12_000).refine(v => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v), 'Remova caracteres de controle.')
export function instructionsVersion(content: string) { return createHash('sha256').update(content).digest('hex') }
export async function getBasileInstructions() {
  const saved = await getSetting(BASILE_SETTING_KEY)
  const content = saved || DEFAULT_MISSION
  return { content, version: instructionsVersion(content), customized: !!saved }
}
export function composeMission(instructions: string, request?: string) {
  return request?.trim() ? `${instructions}\n\nOBJETIVO DESTA ANÁLISE:\n${request.trim()}` : instructions
}
export { INTEGRITY_RULES } from './analysis-integrity'
