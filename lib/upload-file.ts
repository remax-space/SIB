import { validatePdfSize } from './document-limits'

export async function putUploadedFile(uploadUrl: string, file: File, cloudPath: string) {
  validatePdfSize(file.size)
  const contentType = file.type || 'application/pdf'
  try {
    if (uploadUrl.startsWith('/api/documents/local-put') && file.size > 3 * 1024 * 1024) return await putInParts(file, cloudPath)
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file,
    })
    if (res.ok) return
  } catch {
    // CORS or network: fall through to same-origin proxy
  }

  if (file.size > 3 * 1024 * 1024) return putInParts(file, cloudPath)
  const fallback = await fetch(`/api/documents/local-put?key=${encodeURIComponent(cloudPath)}`, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  })
  if (!fallback.ok) {
    throw new Error('Erro ao enviar arquivo')
  }
}

async function putInParts(file: File, key: string) {
  const chunkSize = 3 * 1024 * 1024
  const params = new URLSearchParams({ key, uploadId: crypto.randomUUID(), parts: String(Math.ceil(file.size / chunkSize)), size: String(file.size) })
  for (let start = 0, index = 0; start < file.size; start += chunkSize, index++) {
    const response = await fetch(`/api/documents/local-put?${params}&part=${index}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: file.slice(start, start + chunkSize) })
    if (!response.ok) throw new Error('Envio interrompido. Tente enviar o PDF novamente.')
  }
  const response = await fetch(`/api/documents/local-put?${params}`, { method: 'POST', headers: { 'Content-Type': file.type || 'application/pdf' } })
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Erro ao concluir envio do PDF.')
}
