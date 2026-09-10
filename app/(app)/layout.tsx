import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { ShellWrapper } from '@/components/shell-wrapper'

export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const role = (session.user as any).role ?? 'MACHINE'
  return <ShellWrapper role={role}>{children}</ShellWrapper>
}
