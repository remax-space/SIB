export async function putUploadedFile(uploadUrl: string, file: File, cloudPath: string) {
  const contentType = file.type || 'application/pdf'
  try {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file,
    })
    if (res.ok) return
  } catch {
    // CORS or network: fall through to same-origin proxy
  }

  const fallback = await fetch(`/api/documents/local-put?key=${encodeURIComponent(cloudPath)}`, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  })
  if (!fallback.ok) {
    throw new Error('Erro ao enviar arquivo')
  }
}
