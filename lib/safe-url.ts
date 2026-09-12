const BLOCKED_HOSTS = new Set([
  'localhost',
  '0.0.0.0',
  '127.0.0.1',
  '::1',
  'metadata.google.internal',
  'metadata.google.internal.',
])

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false
  }
  const [a, b] = parts
  if (a === 10 || a === 127) return true
  if (a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

export function assertSafeHttpsUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('Endpoint de jurisprudência inválido')
  }

  if (url.protocol !== 'https:') {
    throw new Error('O endpoint da base de jurisprudência deve usar HTTPS')
  }

  const host = url.hostname.toLowerCase().replace(/\.+$/, '')
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Endpoint de jurisprudência não permitido')
  }
  if (isPrivateIpv4(host)) {
    throw new Error('Endpoint de jurisprudência não permitido')
  }

  return url
}

export async function fetchWithTimeout(url: string, init: RequestInit, ms = 20_000): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...init, redirect: 'error', signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}
