import { auth } from '@/auth'
import { NextResponse } from 'next/server'

/**
 * Guard para rotas de API: retorna a sessão ou uma resposta 401.
 * Uso:
 *   const gate = await requireAuth()
 *   if (gate instanceof NextResponse) return gate
 *   const session = gate
 */
export async function requireAuth() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  return session
}

/** Guard admin-only (login mestre). */
export async function requireAdmin() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }
  if ((session.user as any).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso restrito ao operador mestre' }, { status: 403 })
  }
  return session
}
