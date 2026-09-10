import { NextResponse, type NextRequest } from 'next/server';

// Cabeçalhos de segurança (item 5 da blindagem).
// NÃO inclui X-Frame-Options / frame-ancestors para não quebrar o preview em iframe.
export function proxy(_req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
