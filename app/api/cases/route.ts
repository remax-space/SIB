export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  const gate = await requireAuth(); if (gate instanceof NextResponse) return gate;
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const classText = searchParams.get('classText');

    const where: any = {};
    if (status) where.status = status;
    if (classText) where.classText = classText;

    const cases = await prisma.case.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { documents: true, analyses: true } },
      },
    });

    return NextResponse.json(cases ?? []);
  } catch (error: any) {
    console.error('Cases GET error:', error);
    return NextResponse.json({ error: 'Erro ao buscar casos' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAuth(); if (gate instanceof NextResponse) return gate;
  try {
    const body = await request.json();
    const { caseId, title, clientName, clientDoc, classText, primaryRole, objective, cutoffDate, notes } = body ?? {};

    if (!caseId || !title || !clientName || !classText || !primaryRole) {
      return NextResponse.json({ error: 'Campos obrigatórios: caseId, title, clientName, classText, primaryRole' }, { status: 400 });
    }

    const newCase = await prisma.case.create({
      data: { caseId, title, clientName, clientDoc: clientDoc ?? null, classText, primaryRole, objective: objective ?? null, cutoffDate: cutoffDate ?? null, notes: notes ?? null },
    });

    return NextResponse.json(newCase, { status: 201 });
  } catch (error: any) {
    console.error('Cases POST error:', error);
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'Já existe um caso com este número processual' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Erro ao criar caso' }, { status: 500 });
  }
}
