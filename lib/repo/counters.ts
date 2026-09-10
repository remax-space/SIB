import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getDb } from '@/lib/firebase/admin'

export async function incrementCaseCount(
  caseId: string,
  field: 'documentCount' | 'analysisCount',
  delta: number
) {
  const ref = getDb().collection('cases').doc(caseId)
  await ref.update({
    [field]: FieldValue.increment(delta),
    updatedAt: Timestamp.now(),
  })
}
