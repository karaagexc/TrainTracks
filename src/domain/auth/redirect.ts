export const AUTH_RETURN_TO_COOKIE = 'traintracks_auth_return_to';
export const DEFAULT_PRODUCTION_ORIGIN = 'https://traintracks.vercel.app';

export type AuthFailureReason = 'pkce_verifier_missing' | 'exchange_failed';

function normalizeOrigin(value: string | null | undefined): string | null {
    if (!value) return null;

    try {
        const url = new URL(value.includes('://') ? value : `https://${value}`);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        return url.origin;
    } catch {
        return null;
    }
}

function isVercelOrigin(origin: string): boolean {
    try {
        const { hostname, protocol } = new URL(origin);
        return protocol === 'https:' && hostname.endsWith('.vercel.app');
    } catch {
        return false;
    }
}

function isLocalOrigin(origin: string): boolean {
    try {
        const { hostname } = new URL(origin);
        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    } catch {
        return false;
    }
}

export function resolveAuthOrigin(
    requestOrigin: string,
    configuredOrigin?: string | null,
): string {
    const normalizedRequestOrigin = normalizeOrigin(requestOrigin);
    if (
        normalizedRequestOrigin
        && (isLocalOrigin(normalizedRequestOrigin) || isVercelOrigin(normalizedRequestOrigin))
    ) {
        return normalizedRequestOrigin;
    }

    return normalizeOrigin(configuredOrigin) ?? normalizedRequestOrigin ?? DEFAULT_PRODUCTION_ORIGIN;
}

export function hasAuthCodeVerifierCookie(cookieNames: readonly string[]): boolean {
    return cookieNames.some((name) => name.endsWith('-code-verifier'));
}

export function resolveAuthCodeExchangeOrigin(
    requestOrigin: string,
    configuredOrigin: string | null | undefined,
    hasCodeVerifier: boolean,
): string {
    const normalizedRequestOrigin = normalizeOrigin(requestOrigin);
    const normalizedConfiguredOrigin = normalizeOrigin(configuredOrigin);

    // Local callbacks must stay local even when a production URL is present in env.
    if (normalizedRequestOrigin && isLocalOrigin(normalizedRequestOrigin)) {
        return normalizedRequestOrigin;
    }

    if (hasCodeVerifier) {
        return normalizedRequestOrigin ?? normalizedConfiguredOrigin ?? DEFAULT_PRODUCTION_ORIGIN;
    }

    // Supabase falls back to Site URL when redirectTo is not allowlisted. In that
    // case the verifier remains on the origin that initiated OAuth.
    return normalizedConfiguredOrigin ?? normalizedRequestOrigin ?? DEFAULT_PRODUCTION_ORIGIN;
}

export function sanitizeAuthReturnTo(
    value: string | null | undefined,
    fallback = '/',
): string {
    if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
        return fallback;
    }

    try {
        const base = new URL('https://traintracks.local');
        const destination = new URL(value, base);
        if (destination.origin !== base.origin) return fallback;
        return `${destination.pathname}${destination.search}${destination.hash}`;
    } catch {
        return fallback;
    }
}

export function readAuthReturnToCookie(value: string | null | undefined): string {
    if (!value) return '/';

    try {
        return sanitizeAuthReturnTo(decodeURIComponent(value));
    } catch {
        return '/';
    }
}

export function buildAuthCallbackUrl(origin: string): string {
    return new URL('/auth/callback', origin).toString();
}
export function buildAuthFailurePath(
    returnTo: string | null | undefined,
    reason: AuthFailureReason = 'exchange_failed',
): string {
    const safeReturnTo = sanitizeAuthReturnTo(returnTo);
    const params = new URLSearchParams({
        error: 'auth_callback_failed',
        reason,
    });
    if (safeReturnTo !== '/') params.set('next', safeReturnTo);
    return `/login?${params.toString()}`;
}
