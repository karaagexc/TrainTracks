"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTripStore } from '@/store/useTripStore';
import { createClient } from '@/lib/supabase/client';
import { readAppConfig, parseAppConfig, type ConfigLoadResult, type AppConfig } from '@/domain/config';
import type { CongestionConfig } from '@/domain/congestion/engine';

export function useMaintenanceMode() {
    const storedMaintenanceMode = useTripStore(state => state.maintenanceMode);
    const isActiveTrip = useTripStore(state => state.status !== 'IDLE');
    const congestionConfig = useTripStore(state => state.congestionConfig);
    const [result, setResult] = useState<ConfigLoadResult | null>(null);
    const inFlight = useRef(false);
    const mounted = useRef(false);

    const refreshConfig = useCallback(async () => {
        if (inFlight.current) return;
        inFlight.current = true;
        try {
            const next = await readAppConfig(createClient());
            if (!mounted.current) return;
            setResult(next);
            if (next.config) {
                const store = useTripStore.getState();
                store.setMaintenanceMode(next.config.maintenance_mode);
                if (next.status === 'ready') store.setCongestionConfig(next.config.congestion_config);
            }
        } finally { inFlight.current = false; }
    }, []);

    useEffect(() => {
        mounted.current = true;
        const poll = () => { if (!document.hidden) void refreshConfig(); };
        poll();
        const interval = setInterval(poll, 60000);
        document.addEventListener('visibilitychange', poll);
        window.addEventListener('online', poll);
        return () => {
            mounted.current = false;
            clearInterval(interval);
            document.removeEventListener('visibilitychange', poll);
            window.removeEventListener('online', poll);
        };
    }, [refreshConfig]);

    return {
        // Existing consumers receive a gate that never removes an active passenger's controls.
        maintenanceMode: !isActiveTrip && storedMaintenanceMode,
        remoteMaintenanceMode: result?.config?.maintenance_mode ?? null,
        maintenanceMessage: result?.config?.maintenance_message ?? null,
        congestionConfig, configStatus: result?.status ?? 'loading', configError: result?.error ?? null,
        refreshConfig,
    };
}

async function updateRemoteConfig(payload: Record<string, unknown>): Promise<AppConfig | null> {
    try {
        const response = await fetch('/api/admin/config', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload), cache: 'no-store',
        });
        const body = await response.json();
        const result = parseAppConfig(body.config);
        if (!response.ok || body.ok !== true || result.status !== 'ready' || !result.config) return null;
        const store = useTripStore.getState();
        store.setMaintenanceMode(result.config.maintenance_mode);
        store.setCongestionConfig(result.config.congestion_config);
        return result.config;
    } catch (error) {
        console.error('[Config] Update failed:', error);
        return null;
    }
}

export async function setRemoteMaintenanceMode(enabled: boolean): Promise<boolean> {
    return (await updateRemoteConfig({ maintenanceMode: enabled }))?.maintenance_mode === enabled;
}

export async function setRemoteCongestionConfig(config: CongestionConfig): Promise<boolean> {
    return !!await updateRemoteConfig({ congestionConfig: config });
}
