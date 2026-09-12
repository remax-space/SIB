import { ConfigClient } from './_components/config-client'
import { requireAdminPage } from '@/lib/require-admin-page'

export const dynamic = 'force-dynamic'

export default async function ConfigPage() {
  await requireAdminPage()
  return <ConfigClient />
}
