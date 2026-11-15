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
 * 5. For /api and /uploads (the paths Vercel proxies to the VPS backend) it adds the
 *    secret header `x-origin-secret` (value of the ORIGIN_SECRET env var). nginx on
 *    the VPS refuses backend requests without it, so the backend can only be reached
 *    through this site and a caller cannot forge the visitor IP (X-Forwarded-For).
 *    `set` replaces any value a visitor tries to send themselves.
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

/** Prefixes that Vercel proxies to the VPS backend (see rewrites in next.config.js) */
const BACKEND_PROXY_PREFIXES = ['/api', '/uploads'];

/** Header the VPS nginx checks to know a request really came through this site */
const ORIGIN_SECRET_HEADER = 'x-origin-secret';

/**
 * Continue the request to the backend proxy with the shared origin secret attached.
 * Without the ORIGIN_SECRET env var the request continues unchanged.
 */
function withOriginSecret(request: NextRequest) {
    const secret = process.env.ORIGIN_SECRET;
    if (!secret) {
        return NextResponse.next();
    }
    const headers = new Headers(request.headers);
    headers.set(ORIGIN_SECRET_HEADER, secret);
    return NextResponse.next({ request: { headers } });
}

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // 0. Backend proxy paths: authenticate this site to the VPS, nothing else
    if (BACKEND_PROXY_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
        return withOriginSecret(request);
    }

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
         * Backend proxy paths, always (uploaded files have extensions such as
         * .jpg/.pdf and must also receive the origin secret header).
         */
        '/api/:path*',
        '/uploads/:path*',
        /*
         * Match all other request paths except:
         * - Static files with known extensions (images, fonts, etc.)
         */
        '/((?!.*\\.).*)',
    ],
};
