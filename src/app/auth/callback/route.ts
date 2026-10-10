import { createClient } from '@/lib/supabase/server';
import {
    AUTH_RETURN_TO_COOKIE,
    buildAuthFailurePath,
    hasAuthCodeVerifierCookie,
    readAuthReturnToCookie,
    isAllowedAuthOrigin,
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
    const allowedDeploymentOrigins = [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.AUTH_ALLOWED_ORIGINS]
        .filter(Boolean).join(',');
    if (!isAllowedAuthOrigin(request.nextUrl.origin, configuredOrigin, allowedDeploymentOrigins)) {
        return NextResponse.json({ error: 'Auth callback origin is not allowlisted.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }

    const origin = resolveAuthOrigin(request.nextUrl.origin, configuredOrigin);

    const redirect = (path: string) => {
        const response = NextResponse.redirect(new URL(path, origin));
        response.headers.set('Cache-Control', 'no-store');
        response.cookies.delete(AUTH_RETURN_TO_COOKIE);
        return response;
    };

    if (code && hasCodeVerifier) {
        const supabase = await createClient();
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        const verified = !error && data.session ? await supabase.auth.getUser() : null;
        if (!error && data.session && verified?.data.user && !verified.error && data.session.user.id === verified.data.user.id) {
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
            errorCode: error?.code ?? 'session_not_verified',
            errorStatus: error?.status ?? null,
            hasCodeVerifier,
        });

        return redirect(buildAuthFailurePath(
            next,
            hasCodeVerifier ? 'exchange_failed' : 'pkce_verifier_missing',
        ));
    }

    // Preserve the requested destination so a retry returns to the same surface.
    return redirect(buildAuthFailurePath(next, code && !hasCodeVerifier ? 'pkce_verifier_missing' : 'exchange_failed'));
}
