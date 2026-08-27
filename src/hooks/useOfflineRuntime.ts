'use client';

import { useEffect } from 'react';
import { flushOutbox } from '@/domain/offline/outbox';
import { useConnectivityStore } from '@/store/useConnectivityStore';

export function useOfflineRuntime() {
    useEffect(() => {
        let cancelled = false;
        let interval: number | null = null;

        const setOnlineState = () => {
            useConnectivityStore.getState().setConnectivity({
                online: typeof navigator === 'undefined' ? true : navigator.onLine,
            });
        };

        const flush = async () => {
            if (cancelled || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
            useConnectivityStore.getState().setConnectivity({ syncing: true, online: true });
            const result = await flushOutbox().catch(() => null);
            if (cancelled) return;
            useConnectivityStore.getState().setConnectivity({
                syncing: false,
                pendingWrites: result?.remaining ?? 0,
                lastSyncedAt: result ? Date.now() : null,
            });
        };

        const onOnline = () => {
            setOnlineState();
            void flush();
        };
        const onOffline = () => setOnlineState();
        const onVisibility = () => {
            if (!document.hidden) void flush();
        };

        setOnlineState();
        void flush();
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        document.addEventListener('visibilitychange', onVisibility);
        interval = window.setInterval(() => {
            if (!document.hidden) void flush();
        }, 30_000);

        return () => {
            cancelled = true;
            if (interval !== null) window.clearInterval(interval);
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, []);
}
