import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes
  if (
    pathname === '/login' ||
    pathname === '/setup-password' ||
    pathname === '/change-password' ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname === '/logo.png' ||
    pathname === '/manual.html'
  ) {
    return NextResponse.next();
  }

  const cookieName = process.env.SESSION_COOKIE_NAME ?? 'birth_finance_session';
  const session = request.cookies.get(cookieName);

  if (!session?.value) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
