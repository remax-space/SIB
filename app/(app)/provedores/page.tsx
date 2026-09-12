import { ProvedoresClient } from './_components/provedores-client'
import { requireAdminPage } from '@/lib/require-admin-page'

export const dynamic = 'force-dynamic'

export default async function ProvedoresPage() {
  await requireAdminPage()
  return <ProvedoresClient />
}
