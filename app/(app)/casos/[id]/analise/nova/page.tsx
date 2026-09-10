import { NovaAnaliseClient } from './_components/nova-analise-client'

export default async function NovaAnalisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <NovaAnaliseClient caseId={id} />
}
