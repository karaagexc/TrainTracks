export const AUTH_RETURN_TO_COOKIE = 'traintracks_auth_return_to';
export const DEFAULT_PRODUCTION_ORIGIN = 'https://traintracks.vercel.app';
const VERIFIED_PRODUCTION_ORIGINS = [DEFAULT_PRODUCTION_ORIGIN,
    'https://traintracks-aaron-martinezs-projects-ea1c41f7.vercel.app'];
const AUTH_RETURN_PATHS = new Set([
    '/', '/admin', '/api-console', '/explorer', '/docs', '/profile/setup',
    '/auth/verified', '/auth/reset-password',
]);

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
    // PKCE cookies belong to the initiating origin, including custom/preview hosts.
    return normalizedRequestOrigin ?? normalizeOrigin(configuredOrigin) ?? DEFAULT_PRODUCTION_ORIGIN;
}

export function isAllowedAuthOrigin(requestOrigin: string, configuredOrigin?: string | null, allowedOrigins = ''): boolean {
    const origin = normalizeOrigin(requestOrigin);
    if (!origin) return false;
    if (isLocalOrigin(origin) && process.env.NODE_ENV !== 'production') return true;
    const allowlist = [...VERIFIED_PRODUCTION_ORIGINS, configuredOrigin, ...allowedOrigins.split(',')]
        .map(value => normalizeOrigin(value?.trim())).filter(Boolean);
    return allowlist.includes(origin);
}

export function hasAuthCodeVerifierCookie(cookieNames: readonly string[]): boolean {
    return cookieNames.some((name) => /-code-verifier(?:\.\d+)?$/.test(name));
}

export function resolveAuthCodeExchangeOrigin(
    requestOrigin: string,
    configuredOrigin: string | null | undefined,
    hasCodeVerifier: boolean,
): string {
    void hasCodeVerifier;
    return resolveAuthOrigin(requestOrigin, configuredOrigin);
}

export function sanitizeAuthReturnTo(
    value: string | null | undefined,
    fallback = '/',
): string {
    if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\u0000-\u0020\u007f]/.test(value)) {
        return fallback;
    }

    try {
        const base = new URL('https://traintracks.local');
        const destination = new URL(value, base);
        if (destination.origin !== base.origin) return fallback;
        if (!AUTH_RETURN_PATHS.has(destination.pathname.replace(/\/$/, '') || '/')) return fallback;
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
