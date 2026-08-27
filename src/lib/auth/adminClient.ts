'use client';

export type AdminAccessStatus = 'granted' | 'denied' | 'not_logged_in' | 'error';

export interface AdminAccessResult {
    status: AdminAccessStatus;
    email: string | null;
    message: string;
}

interface AdminAccessPayload {
    authenticated?: boolean;
    isAdmin?: boolean;
    email?: string | null;
}

const ADMIN_SURFACE_PATHS = ['/admin', '/api-console'];

export async function checkAdminAccess(signal?: AbortSignal): Promise<AdminAccessResult> {
    const response = await fetch('/api/auth/admin', {
        signal,
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
    });
    const payload = await response.json().catch(() => null) as AdminAccessPayload | null;
    const email = payload?.email ?? null;

    if (response.status === 401 || payload?.authenticated === false) {
        return {
            status: 'not_logged_in',
            email: null,
            message: 'Sign in to continue.',
        };
    }

    if (response.status === 403 || (payload?.authenticated === true && payload.isAdmin === false)) {
        return {
            status: 'denied',
            email,
            message: 'Access Denied: Admin privileges required.',
        };
    }

    if (!response.ok || payload?.authenticated !== true || payload.isAdmin !== true) {
        return {
            status: 'error',
            email,
            message: 'Authorization could not be verified. Please try again.',
        };
    }

    return {
        status: 'granted',
        email,
        message: 'Access Granted',
    };
}

export function shouldExitAdminSurfaceOnReload(
    navigationType: string | null | undefined,
    navigationUrl: string | null | undefined,
): boolean {
    if (navigationType !== 'reload') return false;
    if (!navigationUrl) return true;

    try {
        const pathname = new URL(navigationUrl, 'https://traintracks.local').pathname;
        return ADMIN_SURFACE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
    } catch {
        return true;
    }
}

export function wasAdminSurfaceReloaded(): boolean {
    if (typeof window === 'undefined') return false;

    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (navigation) {
        return shouldExitAdminSurfaceOnReload(navigation.type, navigation.name);
    }

    const legacyNavigation = (performance as Performance & { navigation?: { type?: number } }).navigation;
    return legacyNavigation?.type === 1
        && ADMIN_SURFACE_PATHS.some((path) => window.location.pathname.startsWith(path));
}
