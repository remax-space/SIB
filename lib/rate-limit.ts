// Limitador simples em memória (janela deslizante por chave).
// Suficiente para dificultar uso automatizado/raspagem em instância única.
type Hit = { count: number; resetAt: number }
const buckets = new Map<string, Hit>()

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now()
  const hit = buckets.get(key)
  if (!hit || now > hit.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfter: 0 }
  }
  if (hit.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((hit.resetAt - now) / 1000) }
  }
  hit.count++
  return { ok: true, retryAfter: 0 }
}
