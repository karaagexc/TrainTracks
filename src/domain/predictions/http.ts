import type { NextRequest } from 'next/server';

const configuredOrigins = new Set(
    [
        process.env.NEXT_PUBLIC_SITE_URL,
        process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
        process.env.VERCEL_PROJECT_PRODUCTION_URL
            ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
            : null,
        ...(process.env.TRAINTRACKS_PUBLIC_API_ORIGINS ?? '').split(','),
    ]
        .map((origin) => origin?.trim().replace(/\/$/, ''))
        .filter((origin): origin is string => Boolean(origin)),
);

function requestOriginAllowed(request: NextRequest, origin: string): boolean {
    const normalized = origin.replace(/\/$/, '');
    if (normalized === request.nextUrl.origin.replace(/\/$/, '')) return true;
    if (configuredOrigins.has(normalized)) return true;
    return process.env.NODE_ENV !== 'production'
        && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized);
}

export function getPublicApiHeaders(
    request: NextRequest,
    methods = 'GET, OPTIONS',
): HeadersInit {
    const origin = request.headers.get('origin');
    const headers: Record<string, string> = {
        'Access-Control-Allow-Methods': methods,
        'Access-Control-Allow-Headers': 'Authorization, X-API-Key, Content-Type',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
    };
    if (origin && requestOriginAllowed(request, origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
    }
    return headers;
}

export function isPublicApiOriginAllowed(request: NextRequest): boolean {
    const origin = request.headers.get('origin');
    return !origin || requestOriginAllowed(request, origin);
}

export function noStoreHeaders(extra: HeadersInit = {}): HeadersInit {
    return {
        'Cache-Control': 'no-store, max-age=0',
        ...extra,
    };
}