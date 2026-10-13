import { NextRequest, NextResponse } from 'next/server';
import { verifySession } from '@/lib/session';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes
  if (
    pathname === '/login' ||
    pathname === '/setup-password' ||
    pathname === '/change-password' ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/quick-expense') ||
    pathname.startsWith('/api/quick-expense') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname === '/logo.png' ||
    pathname === '/manual.html'
  ) {
    return NextResponse.next();
  }

  const cookieName = process.env.SESSION_COOKIE_NAME ?? 'birth_finance_session';
  // Cookie の署名と有効期限を検証する (Cookie があるだけでは通さない)
  const loginId = await verifySession(request.cookies.get(cookieName)?.value);

  if (!loginId) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ ok: false, message: 'ログインしてください。' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
