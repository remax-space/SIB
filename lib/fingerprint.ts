'use client'

/**
 * Gera uma impressão digital estável do dispositivo/navegador.
 * Combina atributos de hardware e software e devolve um hash SHA-256.
 * Não é à prova de especialistas, mas impede a cópia comum de login entre máquinas.
 */
export async function getDeviceFingerprint(): Promise<string> {
  const parts: string[] = []
  try {
    const nav = navigator as any
    parts.push(nav.userAgent || '')
    parts.push(nav.platform || '')
    parts.push((nav.languages || [nav.language]).join(','))
    parts.push(String(nav.hardwareConcurrency || ''))
    parts.push(String(nav.deviceMemory || ''))
    parts.push(Intl.DateTimeFormat().resolvedOptions().timeZone || '')
    parts.push(`${screen.width}x${screen.height}x${screen.colorDepth}`)
    parts.push(String(new Date().getTimezoneOffset()))

    // Canvas fingerprint (leve)
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.textBaseline = 'top'
        ctx.font = "14px 'Arial'"
        ctx.fillStyle = '#f60'
        ctx.fillRect(125, 1, 62, 20)
        ctx.fillStyle = '#069'
        ctx.fillText('SIB\u2022' + navigator.userAgent.slice(0, 20), 2, 15)
        parts.push(canvas.toDataURL())
      }
    } catch {}
  } catch {}

  const raw = parts.join('|')
  const enc = new TextEncoder().encode(raw)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
