import { APP_URL } from '@/config';
import { DEFAULT_LOCALE, isSupportedLocale } from '@/utils/locales';
import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Skip middleware for static files, API routes, and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/logo_') ||
    pathname === '/sitemap.xml' ||
    pathname === '/robots.txt' ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|webp|avif)$/)
  ) {
    return NextResponse.next();
  }

  // Check if locale is already in path (must be first segment)
  const pathSegments = pathname.split('/').filter(Boolean);
  const firstSegment = pathSegments[0];
  const pathnameHasLocale = isSupportedLocale(firstSegment);

  // Check if path is /auth/login (with or without locale)
  const isAuthLogin =
    pathname === '/auth/login' ||
    (pathnameHasLocale &&
      pathSegments.length === 3 &&
      pathSegments[1] === 'auth' &&
      pathSegments[2] === 'login');

  // Redirect /auth/login to the web app
  if (isAuthLogin) {
    return NextResponse.redirect(`${APP_URL}/auth/login`);
  }

  // Check for explicit locale preference in cookie
  const explicitLocale = request.cookies.get('NEXT_LOCALE')?.value;
  const hasExplicitLocale = isSupportedLocale(explicitLocale);

  // Redirect /en and /en/* to non-prefixed URLs (English is default)
  // BUT: Don't redirect if:
  // 1. User has explicitly chosen English (cookie exists), OR
  // 2. User is navigating from language switcher (referer has a locale prefix)
  // This prevents the redirect loop when user explicitly selects English
  const referer = request.headers.get('referer');
  let refererHasExplicitLocale = false;
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const refererFirstSegment = refererUrl.pathname
        .split('/')
        .filter(Boolean)[0];
      refererHasExplicitLocale = isSupportedLocale(refererFirstSegment);
    } catch {
      // Invalid referer URL, ignore
    }
  }

  if (
    firstSegment === 'en' &&
    !hasExplicitLocale &&
    !refererHasExplicitLocale
  ) {
    const pathWithoutLocale = pathSegments.slice(1).join('/');
    const redirectPath = pathWithoutLocale ? `/${pathWithoutLocale}` : '/';
    const redirectUrl = new URL(redirectPath, request.url);
    // Preserve query string
    redirectUrl.search = request.nextUrl.search;
    return NextResponse.redirect(redirectUrl, 301); // Permanent redirect
  }

  if (pathnameHasLocale) {
    // Locale is already in path - pass through to [locale] route
    // If it's /en with explicit cookie, we already handled it above (no redirect)
    // Next.js will automatically match /fr, /es or /en to [locale] route
    return NextResponse.next();
  }

  // Detect locale: prioritize explicit cookie choice, then Accept-Language header, then default to 'en'
  const acceptLanguage = request.headers.get('accept-language');
  let locale: string = DEFAULT_LOCALE;

  // First, check if user has explicitly chosen a locale (cookie)
  if (hasExplicitLocale) {
    locale = explicitLocale;
  }
  // Otherwise, use Accept-Language header
  else if (acceptLanguage) {
    const preferredLocale = acceptLanguage
      .split(',')
      .map((lang) => lang.split(';')[0].trim().toLowerCase().split('-')[0])
      .find(isSupportedLocale);

    if (preferredLocale) {
      locale = preferredLocale;
    }
  }

  // Rewrite to [locale] route (internal rewrite, URL stays the same)
  // For root path, rewrite to /[locale]/
  // For other paths, rewrite to /[locale]/path
  const rewritePath = pathname === '/' ? `/${locale}` : `/${locale}${pathname}`;
  const newUrl = new URL(rewritePath, request.url);
  return NextResponse.rewrite(newUrl);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
