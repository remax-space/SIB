import { CaseDetailClient } from './_components/case-detail-client'

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <CaseDetailClient caseId={id} />
}
