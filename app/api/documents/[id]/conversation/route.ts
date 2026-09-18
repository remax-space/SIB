import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { getDocumentById, setDocumentExtractedText } from '@/lib/db'
import { readStoredFile } from '@/lib/storage'
import { locateMovement } from '@/lib/document-movements'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'
import { ResearchError } from '@/lib/research/adapter'
import { researchHttpError } from '@/lib/research/http'

export const runtime = 'nodejs'
export const maxDuration = 180

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth()
  if (session instanceof NextResponse) return session
  if (!rateLimit(`document-chat:${session.user?.id}`, 10, 60_000).ok) return NextResponse.json({ error: 'Aguarde um minuto antes de consultar novamente.' }, { status: 429 })
  const body = z.object({ message: z.string().trim().min(1).max(2000) }).safeParse(await request.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: 'Informe sua consulta.' }, { status: 400 })
  const movement = body.data.message.match(/\b(?:movimento|movimentação|mov\.?|evento|ev\.?)\s*(?:n[º°o.]?\s*)?[:#-]?\s*(\d+)\b/i)?.[1]
  if (!movement) return NextResponse.json({ content: 'Informe o número do movimento ou evento. Por exemplo: “Me traga o movimento 28”.' })
  try {
    const { id } = await params
    const doc = await getDocumentById(id) as Record<string, unknown> | null
    if (!doc) return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 })
    const buffer = await readStoredFile(String(doc.cloudStoragePath), String(doc.mimeType), Boolean(doc.isPublic))
    const { getDocumentProxy, extractText } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    let pages: string[]
    try {
      const extracted = await extractText(pdf, { mergePages: false })
      pages = extracted.text
    } finally { await pdf.loadingTask.destroy() }
    const readable = pages.filter((page) => page.trim().length >= 40).length
    const candidate = readable ? pages.map((page, index) => '[Página ' + (index + 1) + ']\n' + page).join('\n\n') : ''
    const saved = await setDocumentExtractedText(id, candidate, pages.length, readable ? 'LIDO_PARCIALMENTE' : 'ILEGIVEL')
    const readStatus = saved?.readStatus ?? 'LIDO_PARCIALMENTE'
    const sources = locateMovement(pages, movement)
    const length = sources.reduce((sum, source) => sum + source.text.length, 0)
    if (length > 450_000) return NextResponse.json({ content: 'Há muitas referências a esse movimento. Divida o PDF para consultar e transcrever as páginas com segurança.', readStatus, pageCount: pages.length })
    return NextResponse.json({
      content: sources.length
        ? `Localizei referências ao movimento ${movement} em ${doc.filename}. Segue a transcrição de ${sources.length} página(s), incluindo possíveis continuações até o próximo identificador. Uma referência pode ser uma citação ou índice; confira os limites e o inteiro teor no PDF original.`
        : `Não localizei o movimento ${movement} no texto pesquisável de ${doc.filename}.${readable < pages.length ? ' Há páginas sem texto suficiente; é necessário OCR para pesquisar essas páginas.' : ' Confira o número ou selecione outro documento.'}`,
      sources, readStatus, pageCount: pages.length,
    })
  } catch (error) {
    if (error instanceof ResearchError) return researchHttpError(error)
    console.error('Document conversation:', error)
    return NextResponse.json({ error: 'Não foi possível ler o PDF. Verifique o arquivo e tente novamente.' }, { status: 500 })
  }
}
