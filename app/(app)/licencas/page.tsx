import { LicencasClient } from './_components/licencas-client';
import { requireAdminPage } from '@/lib/require-admin-page';

export const dynamic = 'force-dynamic';

export default async function LicencasPage() {
  await requireAdminPage();
  return <LicencasClient />;
}
