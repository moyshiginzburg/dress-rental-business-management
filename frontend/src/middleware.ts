/**
 * Next.js Middleware for Global Route Protection
 *
 * Purpose: Intercepts every incoming request at the Edge (Vercel) BEFORE any
 * page is rendered. Redirects unauthenticated visitors to /login, except for
 * public routes (/login, /agreement) and static assets.
 *
 * Operation:
 * 1. Reads the `auth_token` cookie from the request.
 * 2. If the visitor has a valid cookie and tries to reach /login → redirect
 *    to /dashboard (already logged in).
 * 3. If the visitor has NO cookie and tries to reach any protected route →
 *    redirect to /login.
 * 4. Public routes (/login, /agreement) and Next.js internals (_next, api,
 *    static assets) are always allowed through without authentication.
 *
 * Note: This middleware only checks for the EXISTENCE of the cookie, not its
 * cryptographic validity. The backend verifies the JWT signature on every API
 * and /uploads request independently. This keeps Edge execution fast and cheap.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Routes that are accessible without authentication */
const PUBLIC_ROUTES = ['/login', '/agreement'];

/**
 * Prefixes that should be completely ignored by the middleware.
 * These include Next.js internals, API proxy routes (handled by
 * next.config.js rewrites), static assets, and upload proxies.
 */
const IGNORED_PREFIXES = [
    '/_next',      // Next.js bundled assets
    '/api',        // API proxy → backend
    '/uploads',    // Upload proxy → backend (backend checks cookie itself)
    '/favicon',    // Favicon
    '/icon',       // PWA icons
    '/apple-icon', // Apple touch icon
    '/manifest',   // PWA manifest
];

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // 1. Skip middleware for ignored prefixes (static assets, API, uploads)
    if (IGNORED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
        return NextResponse.next();
    }

    // 2. Check if the user has an auth_token cookie
    const authToken = request.cookies.get('auth_token')?.value;
    const isAuthenticated = !!authToken;

    // 3. Check if the current path is a public route
    const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

    // 4. If authenticated user visits /login → redirect to dashboard
    if (isAuthenticated && pathname === '/login') {
        return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // 5. If public route → always allow
    if (isPublicRoute) {
        return NextResponse.next();
    }

    // 6. If NOT authenticated and NOT a public route → redirect to /login
    if (!isAuthenticated) {
        const loginUrl = new URL('/login', request.url);
        return NextResponse.redirect(loginUrl);
    }

    // 7. Authenticated user on a protected route → allow
    return NextResponse.next();
}

/**
 * Matcher configuration: run middleware on all routes except static files.
 * This is an optimization — Next.js will only invoke the middleware function
 * for requests matching this pattern (i.e., NOT for .ico, .png, .svg, etc.).
 */
export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - Static files with known extensions (images, fonts, etc.)
         */
        '/((?!.*\\.).*)',
    ],
};
