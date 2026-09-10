export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { createLicense, findLicenseByKey, listLicenses } from '@/lib/db';
import { requireAdmin } from '@/lib/auth-helpers';
import crypto from 'crypto';

function genKey(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const block = () =>
    Array.from({ length: 4 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  return `SIB-${block()}-${block()}-${block()}`;
}

export async function GET() {
  const gate = await requireAdmin(); if (gate instanceof NextResponse) return gate;
  try {
    const licenses = await listLicenses();
    return NextResponse.json({ licenses });
  } catch (e) {
    return NextResponse.json({ error: 'Erro ao listar licenças' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin(); if (gate instanceof NextResponse) return gate;
  try {
    const body = await request.json();
    const label = String(body?.label ?? '').trim() || 'Máquina sem nome';
    const notes = body?.notes ? String(body.notes).trim() : null;

    let key = genKey();
    for (let i = 0; i < 5; i++) {
      const exists = await findLicenseByKey(key);
      if (!exists) break;
      key = genKey();
    }

    const license = await createLicense({ key, label, notes });
    return NextResponse.json({ license });
  } catch (e) {
    return NextResponse.json({ error: 'Erro ao criar licença' }, { status: 500 });
  }
}
