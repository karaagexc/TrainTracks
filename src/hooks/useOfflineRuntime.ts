'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { cancelQueuedCrowdPresence, flushOutbox } from '@/domain/offline/outbox';
import { useConnectivityStore } from '@/store/useConnectivityStore';
import { useTripStore } from '@/store/useTripStore';
import { useTrainStore } from '@/store/useTrainStore';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from './useAuth';

export function reconcileCrowdConsentStorage(event: Pick<StorageEvent, 'key' | 'newValue'>): boolean {
    if ((event.key !== 'traintracks_crowd_presence_consent' || event.newValue === 'granted') && event.key !== null) return false;
    useTrainStore.setState({ crowdConsent: event.newValue === 'denied' ? 'denied' : 'unknown' });
    return true;
}

export async function clearPrivatePwaCaches(): Promise<void> {
    if (typeof caches === 'undefined') return;
    const safe = new Set(['traintracks-map-tiles-v4', 'traintracks-static-v2',
        'traintracks-station-images-v2', 'traintracks-public-pages-v3']);
    for (const name of await caches.keys()) {
        if (safe.has(name)) continue;
        if (name.startsWith('workbox-precache')) {
            const cache = await caches.open(name);
            for (const request of await cache.keys()) {
                const url = new URL(request.url);
                if (/^\/(?:api|auth|profile|admin|login|api-console)(?:\/|\.|$)/.test(url.pathname)
                    || (!url.pathname.startsWith('/_next/static/') && !/\.(?:png|jpe?g|webp|avif|svg|ico|woff2?|css|js|geojson)$/i.test(url.pathname))) {
                    await cache.delete(request);
                }
            }
        } else if (name === 'start-url' || name.startsWith('traintracks-pages')
            || /^(?:pages|apis|others|cross-origin|next-data|.*-rsc)(?:-|$)/.test(name)) {
            await caches.delete(name);
        }
    }
}

export function useOfflineRuntime() {
    const { user, loading } = useAuth();
    const ownerRef = useRef<string | null>(null);
    useEffect(() => {
        const cancelCrowd = () => {
            void cancelQueuedCrowdPresence().catch((error) => console.warn('[Offline] Crowd cancellation/storage failed; GPS replay remains consent-gated:', error));
        };
        const unsubscribe = useTrainStore.subscribe((state, previous) => {
            if (state.crowdConsent !== previous.crowdConsent && state.crowdConsent !== 'granted') cancelCrowd();
        });
        const onStorage = (event: StorageEvent) => {
            if (reconcileCrowdConsentStorage(event)) cancelCrowd();
        };
        if (useTrainStore.getState().crowdConsent !== 'granted') cancelCrowd();
        window.addEventListener('storage', onStorage);
        return () => { unsubscribe(); window.removeEventListener('storage', onStorage); };
    }, []);
    useEffect(() => {
        ownerRef.current = loading ? null : user?.id ?? null;
        useTripStore.getState().setAuthenticatedUserId(ownerRef.current);
        void clearPrivatePwaCaches().catch((error) => console.warn('[Offline] Cache cleanup failed:', error));
        window.dispatchEvent(new Event('traintracks:auth-ready'));
    }, [loading, user?.id]);

    useEffect(() => {
        let cancelled = false;
        let reauthenticatedOwnerId: string | null = null;
        let reauthenticatedAt = 0;
        const supabase = createClient();
        const setOnlineState = () => useConnectivityStore.getState().setConnectivity({ online: navigator.onLine });
        const flush = async () => {
            if (cancelled || !navigator.onLine) return;
            useConnectivityStore.getState().setConnectivity({ syncing: true, online: true });
            try {
                const result = await flushOutbox(fetch, { reauthenticatedOwnerId, reauthenticatedAt, getOwnerId: async () => {
                    if (!ownerRef.current) return null;
                    const { data, error } = await supabase.auth.getUser();
                    return !error && data.user?.id === ownerRef.current ? data.user.id : null;
                } });
                if (cancelled) return;
                useConnectivityStore.getState().setConnectivity({ syncing: false, pendingWrites: result.remaining,
                    ...(result.sent > 0 ? { lastSyncedAt: Date.now() } : {}) });
            } catch (error) {
                console.warn('[Offline] Sync/storage failed; writes retained:', error);
                if (!cancelled) useConnectivityStore.getState().setConnectivity({ syncing: false });
            }
        };
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
            if (['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED'].includes(event)) {
                reauthenticatedOwnerId = session?.user.id ?? null;
                reauthenticatedAt = Date.now();
                queueMicrotask(() => { void flush(); });
            }
            if (event === 'SIGNED_OUT') {
                ownerRef.current = null;
                reauthenticatedOwnerId = null;
                void clearPrivatePwaCaches().catch((error) => console.warn('[Offline] Cache cleanup failed:', error));
            }
        });
        const onOnline = () => { setOnlineState(); void flush(); };
        const onOffline = () => setOnlineState();
        const onVisibility = () => { if (!document.hidden) void flush(); };
        setOnlineState();
        void flush();
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        window.addEventListener('traintracks:auth-ready', onVisibility);
        document.addEventListener('visibilitychange', onVisibility);
        const interval = window.setInterval(() => { if (!document.hidden) void flush(); }, 30_000);
        return () => {
            cancelled = true;
            window.clearInterval(interval);
            subscription.unsubscribe();
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
            window.removeEventListener('traintracks:auth-ready', onVisibility);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, []);
}

const PWA_TRIP_LOCK = 'traintracks-pwa-active-trip';

export function isTripSafeForPwaUpdate(state = useTripStore.getState()): boolean {
    return state.persistenceHydrated && state.status === 'IDLE' && !state.origin
        && !state.pendingTripRecovery && !state.pendingCompletedTrip;
}

export async function activatePwaUpdate(registration: ServiceWorkerRegistration,
    canActivate: () => boolean): Promise<boolean> {
    if (!canActivate() || !registration.waiting || !navigator.locks) return false;
    return navigator.locks.request(PWA_TRIP_LOCK, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        if (!lock || !canActivate() || !registration.waiting) return false;
        await clearPrivatePwaCaches();
        if (!canActivate() || !registration.waiting) return false;
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        return true;
    });
}

// Mount wherever journey and receipt state are authoritative. Unsafe tabs hold a
// shared lock; activation requires an exclusive lock across all mounted tabs.
export function usePwaUpdateRuntime({ canActivate }: { canActivate: boolean }) {
    const safeRef = useRef(canActivate);
    const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
    const [updateWaiting, setUpdateWaiting] = useState(false);
    const [activationError, setActivationError] = useState<string | null>(null);

    useEffect(() => {
        safeRef.current = canActivate;
        if (canActivate || !('locks' in navigator)) return;
        let release: (() => void) | undefined;
        let disposed = false;
        void navigator.locks.request(PWA_TRIP_LOCK, { mode: 'shared' }, () => {
            if (disposed) return;
            return new Promise<void>((resolve) => { release = resolve; });
        });
        return () => { disposed = true; release?.(); };
    }, [canActivate]);

    useEffect(() => {
        if (!('serviceWorker' in navigator)) return;
        let disposed = false;
        let removeListeners: (() => void) | undefined;
        void navigator.serviceWorker.getRegistration().then((registration) => registration ?? navigator.serviceWorker.ready).then((registration) => {
            if (disposed || !registration) return;
            registrationRef.current = registration;
            const update = () => { if (!disposed) setUpdateWaiting(Boolean(registration.waiting)); };
            const workers = new Set<ServiceWorker>();
            const watch = () => {
                if (registration.installing) {
                    workers.add(registration.installing);
                    registration.installing.addEventListener('statechange', update);
                }
                update();
            };
            registration.addEventListener('updatefound', watch);
            watch();
            removeListeners = () => {
                registration.removeEventListener('updatefound', watch);
                workers.forEach((worker) => worker.removeEventListener('statechange', update));
            };
        }).catch((error) => {
            if (!disposed) setActivationError(error instanceof Error ? error.message : 'Update unavailable.');
        });
        return () => { disposed = true; removeListeners?.(); };
    }, []);

    const activateUpdate = useCallback(async (): Promise<boolean> => {
        const canActivateNow = () => safeRef.current && isTripSafeForPwaUpdate();
        if (!canActivateNow() || !registrationRef.current?.waiting) return false;
        if (!navigator.locks) {
            setActivationError('Close other TrainTracks tabs to finish updating.');
            return false;
        }
        try {
            const activated = await activatePwaUpdate(registrationRef.current, canActivateNow);
            if (activated) { setActivationError(null); setUpdateWaiting(false); }
            return activated;
        } catch (error) {
            setActivationError(error instanceof Error ? error.message : 'Update unavailable.');
            return false;
        }
    }, []);
    useEffect(() => {
        if (!canActivate || !updateWaiting) return;
        // No reconnect reload. Wait until every mounted trip/receipt has released its lock.
        let disposed = false;
        queueMicrotask(() => { if (!disposed) void activateUpdate(); });
        const interval = window.setInterval(() => { void activateUpdate(); }, 10_000);
        return () => { disposed = true; window.clearInterval(interval); };
    }, [activateUpdate, canActivate, updateWaiting]);
    return { updateWaiting, activateUpdate, activationError };
}
