'use client';
import { useEffect } from 'react';
import { readAppConfig } from '@/domain/config';
import { createClient } from '@/lib/supabase/client';
import { useTrainStore } from '@/store/useTrainStore';

let subscribers = 0;
let stop: (() => void) | null = null;

function startConfigSync() {
    let disposed = false;
    let inFlight = false;
    const refresh = async () => {
        if (disposed || inFlight || document.hidden || !navigator.onLine) return;
        inFlight = true;
        try {
            const result = await readAppConfig(createClient());
            if (!disposed) useTrainStore.getState().setRuntimeApiConfig(result);
        } catch {
            if (!disposed) useTrainStore.getState().setRuntimeApiConfig({ status: 'error', config: null, error: 'Configuration unavailable.' });
        } finally { inFlight = false; }
    };
    const activity = () => { void refresh(); };
    const timer = window.setInterval(activity, 60_000);
    window.addEventListener('online', activity);
    document.addEventListener('visibilitychange', activity);
    activity();
    return () => {
        disposed = true; window.clearInterval(timer);
        window.removeEventListener('online', activity);
        document.removeEventListener('visibilitychange', activity);
    };
}

export function useRuntimeApiConfig() {
    useEffect(() => {
        subscribers += 1;
        if (!stop) stop = startConfigSync();
        return () => { subscribers -= 1; if (!subscribers) { stop?.(); stop = null; } };
    }, []);
    return useTrainStore((state) => state.apiConfig);
}
