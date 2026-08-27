import { NextResponse, type NextRequest } from 'next/server';
import {
    AUTH_RETURN_TO_COOKIE,
    buildAuthCallbackUrl,
    hasAuthCodeVerifierCookie,
    readAuthReturnToCookie,
    resolveAuthCodeExchangeOrigin,
} from '@/domain/auth/redirect';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
    const code = request.nextUrl.pathname === '/'
        ? request.nextUrl.searchParams.get('code')
        : null;

    if (code) {
        const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL
            ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
        const hasCodeVerifier = hasAuthCodeVerifierCookie(
            request.cookies.getAll().map(({ name }) => name),
        );
        const callbackOrigin = resolveAuthCodeExchangeOrigin(
            request.nextUrl.origin,
            configuredOrigin,
            hasCodeVerifier,
        );
        const callbackUrl = new URL(buildAuthCallbackUrl(callbackOrigin));
        const returnTo = readAuthReturnToCookie(
            request.cookies.get(AUTH_RETURN_TO_COOKIE)?.value,
        );

        callbackUrl.searchParams.set('code', code);
        if (returnTo !== '/') callbackUrl.searchParams.set('next', returnTo);

        const type = request.nextUrl.searchParams.get('type');
        if (type) callbackUrl.searchParams.set('type', type);

        return NextResponse.redirect(callbackUrl);
    }

    return await updateSession(request);
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon)
         * - public files (icons, manifest, sw, etc.)
         */
        '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|sw.js|workbox-.*\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
