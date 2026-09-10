import { AnalysisResultClient } from './_components/analysis-result-client'

export default async function AnalysisResultPage({ params }: { params: Promise<{ id: string; analysisId: string }> }) {
  const { id, analysisId } = await params
  return <AnalysisResultClient caseId={id} analysisId={analysisId} />
}
