export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth-helpers';

export async function GET() {
  const gate = await requireAuth(); if (gate instanceof NextResponse) return gate;
  try {
    const [totalCases, totalAnalyses, totalDocs, inProgress] = await Promise.all([
      prisma.case.count(),
      prisma.analysis.count(),
      prisma.document.count(),
      prisma.analysis.count({ where: { status: 'EM_ANDAMENTO' } }),
    ]);

    const recentCases = await prisma.case.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { id: true, caseId: true, title: true, clientName: true, classText: true, status: true, createdAt: true },
    });

    const recentAnalyses = await prisma.analysis.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { case: { select: { caseId: true, title: true } } },
    });

    return NextResponse.json({
      totalCases,
      totalAnalyses,
      totalDocs,
      inProgress,
      recentCases: recentCases ?? [],
      recentAnalyses: (recentAnalyses ?? []).map((a: any) => ({
        ...a,
        icpScore: a?.icpScore != null ? Number(a.icpScore) : null,
      })),
    });
  } catch (error: any) {
    console.error('Stats error:', error);
    return NextResponse.json({ error: 'Erro ao buscar estatísticas' }, { status: 500 });
  }
}
