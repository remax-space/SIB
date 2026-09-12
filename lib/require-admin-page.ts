import { redirect } from 'next/navigation'
import { auth } from '@/auth'

export async function requireAdminPage() {
  const session = await auth()
  if (!session) redirect('/login')
  if ((session.user as { role?: string } | undefined)?.role !== 'ADMIN') redirect('/')
  return session
}
