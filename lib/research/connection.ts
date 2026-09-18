import { getSetting, setSetting } from '@/lib/db'
import { hash } from './identity'
import { MCP_CONTRACT, mcpKey, probeLegawMcp } from './mcp'
import { ResearchError } from './adapter'

const SETTING = 'legaw_mcp_connection'
export function mcpConnectionVersion() { return hash([MCP_CONTRACT, mcpKey()]) }
export async function mcpConnectionState() {
  let stored: { enabled?: boolean; version?: string; checkedAt?: number } = {}
  try { stored = JSON.parse(await getSetting(SETTING) || '{}') ?? {} } catch { /* Disabled for invalid old settings. */ }
  const configured = !!mcpKey()
  const active = configured && stored.enabled === true && stored.version === mcpConnectionVersion()
  return { configured, active, checkedAt: stored.checkedAt ?? null, blockers: active ? [] : [configured ? 'O administrador precisa conectar o MCP em Jurisprudência.' : 'Configure LEGAW_MCP_KEY no ambiente do servidor e reinicie o serviço.'] }
}
export async function configureLegawMcp(enabled: boolean, sharedUseAuthorized: boolean, signal: AbortSignal) {
  if (!enabled) { await setSetting(SETTING, JSON.stringify({ enabled: false })); return mcpConnectionState() }
  if (!sharedUseAuthorized) throw new ResearchError('LEGAW_SHARED_USE_REQUIRED', 422)
  const version = mcpConnectionVersion()
  await probeLegawMcp(signal)
  if (version !== mcpConnectionVersion()) throw new ResearchError('CONNECTION_CHANGED_RECONFIRM', 409)
  await setSetting(SETTING, JSON.stringify({ enabled: true, version, checkedAt: Date.now(), sharedUseAuthorized: true }))
  return mcpConnectionState()
}
