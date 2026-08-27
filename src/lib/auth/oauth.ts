'use client';

import {
    AUTH_RETURN_TO_COOKIE,
    buildAuthCallbackUrl,
    resolveAuthOrigin,
    sanitizeAuthReturnTo,
} from '@/domain/auth/redirect';

const AUTH_RETURN_TO_MAX_AGE_SECONDS = 15 * 60;

export function prepareOAuthRedirect(returnTo = '/'): string {
    const safeReturnTo = sanitizeAuthReturnTo(returnTo);
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';

    document.cookie = [
        `${AUTH_RETURN_TO_COOKIE}=${encodeURIComponent(safeReturnTo)}`,
        'Path=/',
        `Max-Age=${AUTH_RETURN_TO_MAX_AGE_SECONDS}`,
        'SameSite=Lax',
    ].join('; ') + secure;

    const callbackOrigin = resolveAuthOrigin(
        window.location.origin,
        process.env.NEXT_PUBLIC_SITE_URL,
    );

    const callback = new URL(buildAuthCallbackUrl(callbackOrigin));
    if (safeReturnTo !== '/') callback.searchParams.set('next', safeReturnTo);
    return callback.toString();
}
