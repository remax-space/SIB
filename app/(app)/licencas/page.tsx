import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { LicencasClient } from './_components/licencas-client';

export const dynamic = 'force-dynamic';

export default async function LicencasPage() {
  const session = await auth();
  if (!session) redirect('/login');
  if ((session.user as any)?.role !== 'ADMIN') redirect('/');
  return <LicencasClient />;
}
