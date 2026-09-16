import { CaseConversationClient } from './_components/case-conversation-client'

export default async function CaseConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <CaseConversationClient caseId={id} />
}
