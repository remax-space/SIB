import { redirect } from 'next/navigation'

export default async function CaixasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const incoming = await searchParams
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(incoming)) {
    if (key === 'view') continue
    if (typeof value === 'string') params.set(key, value)
    else if (Array.isArray(value) && value[0]) params.set(key, value[0])
  }
  params.set('view', 'grouped')
  redirect(`/casos?${params.toString()}`)
}
