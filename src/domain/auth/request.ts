import type { NextRequest } from 'next/server';

export function isSameOriginMutation(request: NextRequest): boolean {
    const origin = request.headers.get('origin');
    return !origin || origin === request.nextUrl.origin;
}
