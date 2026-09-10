export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { getDashboardStats } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';

export async function GET() {
  const gate = await requireAuth(); if (gate instanceof NextResponse) return gate;
  try {
    const stats = await getDashboardStats();
    return NextResponse.json(stats);
  } catch (error: any) {
    console.error('Stats error:', error);
    return NextResponse.json({ error: 'Erro ao buscar estatísticas' }, { status: 500 });
  }
}
