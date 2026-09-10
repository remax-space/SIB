export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth-helpers';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(); if (gate instanceof NextResponse) return gate;
  try {
    const { id } = await params;
    const body = await request.json();
    const action = String(body?.action ?? '');

    let data: any = {};
    if (action === 'revoke') data = { revoked: true, active: false };
    else if (action === 'reactivate') data = { revoked: false, active: true };
    else if (action === 'reset') data = { fingerprint: null, activatedAt: null, lastSeenAt: null };
    else if (action === 'rename') data = { label: String(body?.label ?? '').trim() || 'Máquina sem nome' };
    else return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });

    const license = await prisma.license.update({ where: { id }, data });
    return NextResponse.json({ license });
  } catch (e) {
    return NextResponse.json({ error: 'Erro ao atualizar licença' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(); if (gate instanceof NextResponse) return gate;
  try {
    const { id } = await params;
    await prisma.license.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: 'Erro ao excluir licença' }, { status: 500 });
  }
}
