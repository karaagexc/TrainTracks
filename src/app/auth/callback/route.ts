import { createClient } from '@/lib/supabase/server';
import {
    AUTH_RETURN_TO_COOKIE,
    buildAuthFailurePath,
    hasAuthCodeVerifierCookie,
    readAuthReturnToCookie,
    resolveAuthCodeExchangeOrigin,
    resolveAuthOrigin,
    sanitizeAuthReturnTo,
} from '@/domain/auth/redirect';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const code = searchParams.get('code');
    const storedReturnTo = readAuthReturnToCookie(
        request.cookies.get(AUTH_RETURN_TO_COOKIE)?.value,
    );
    const next = sanitizeAuthReturnTo(searchParams.get('next'), storedReturnTo);
    const type = searchParams.get('type'); // 'signup', 'recovery', 'magiclink', etc.
    const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL
        ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
    const hasCodeVerifier = hasAuthCodeVerifierCookie(
        request.cookies.getAll().map(({ name }) => name),
    );
    const exchangeOrigin = resolveAuthCodeExchangeOrigin(
        request.nextUrl.origin,
        configuredOrigin,
        hasCodeVerifier,
    );

    if (code && exchangeOrigin !== request.nextUrl.origin) {
        const exchangeUrl = new URL('/auth/callback', exchangeOrigin);
        exchangeUrl.search = request.nextUrl.search;
        console.info('[AuthCallback] Forwarding OAuth code to verifier origin', {
            fromHost: request.nextUrl.host,
            toHost: exchangeUrl.host,
        });
        return NextResponse.redirect(exchangeUrl);
    }

    const origin = resolveAuthOrigin(request.nextUrl.origin, configuredOrigin);

    const redirect = (path: string) => {
        const response = NextResponse.redirect(new URL(path, origin));
        response.cookies.delete(AUTH_RETURN_TO_COOKIE);
        return response;
    };

    if (code) {
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error) {
            let redirectPath = next;
            if (type === 'signup' || type === 'email') {
                redirectPath = '/auth/verified';
            } else if (type === 'recovery') {
                redirectPath = '/auth/reset-password';
            }

            return redirect(redirectPath);
        }

        console.error('[AuthCallback] OAuth code exchange failed', {
            callbackHost: request.nextUrl.host,
            configuredOrigin: exchangeOrigin,
            errorCode: error.code ?? 'unknown',
            errorStatus: error.status ?? null,
            hasCodeVerifier,
        });

        return redirect(buildAuthFailurePath(
            next,
            hasCodeVerifier ? 'exchange_failed' : 'pkce_verifier_missing',
        ));
    }

    // Preserve the requested destination so a retry returns to the same surface.
    return redirect(buildAuthFailurePath(next, 'exchange_failed'));
}
