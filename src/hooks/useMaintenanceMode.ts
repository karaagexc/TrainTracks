"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTripStore } from "@/store/useTripStore";
import { createClient } from "@/lib/supabase/client";
import { normalizeCongestionConfig, type CongestionConfig } from "@/domain/congestion/engine";

/**
 * useMaintenanceMode
 * 
 * Polls the `app_config` table in Supabase once per minute while visible to check
 * if maintenance_mode is enabled. Syncs the result into Zustand so
 * the entire app reacts immediately.
 * 
 * DevOpts toggle writes BACK to Supabase so ALL clients see the change.
 */
export function useMaintenanceMode() {
    const maintenanceMode = useTripStore((state) => state.maintenanceMode);
    const setMaintenanceMode = useTripStore((state) => state.setMaintenanceMode);
    const congestionConfig = useTripStore((state) => state.congestionConfig);
    const setCongestionConfig = useTripStore((state) => state.setCongestionConfig);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const maintenanceModeRef = useRef(maintenanceMode);
    const congestionConfigRef = useRef(JSON.stringify(congestionConfig));

    useEffect(() => {
        maintenanceModeRef.current = maintenanceMode;
        congestionConfigRef.current = JSON.stringify(congestionConfig);
    }, [maintenanceMode, congestionConfig]);

    const fetchFlag = useCallback(async () => {
        try {
            const supabase = createClient();
            const { data, error } = await supabase
                .from("app_config")
                .select("maintenance_mode, maintenance_message, congestion_config")
                .eq("id", 1)
                .single();

            if (error) {
                console.warn("[Maintenance] Failed to fetch config:", error.message);
                return;
            }

            if (data && data.maintenance_mode !== maintenanceModeRef.current) {
                maintenanceModeRef.current = data.maintenance_mode;
                setMaintenanceMode(data.maintenance_mode);
            }

            if (data) {
                const nextCongestionConfig = normalizeCongestionConfig(data.congestion_config as CongestionConfig | null);
                const serialized = JSON.stringify(nextCongestionConfig);
                if (serialized !== congestionConfigRef.current) {
                    congestionConfigRef.current = serialized;
                    setCongestionConfig(nextCongestionConfig);
                }
            }
        } catch (err) {
            console.warn("[Maintenance] Network error:", err);
        }
    }, [setCongestionConfig, setMaintenanceMode]);

    useEffect(() => {
        const pollWhileVisible = () => {
            if (typeof document === 'undefined' || !document.hidden) {
                void fetchFlag();
            }
        };
        const handleVisibilityChange = () => {
            if (!document.hidden) pollWhileVisible();
        };

        pollWhileVisible();
        intervalRef.current = setInterval(pollWhileVisible, 60_000);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [fetchFlag]);

    return { maintenanceMode, congestionConfig };
}

/**
 * Toggle maintenance mode in Supabase.
 * Called from CommandCenter DevOpts.
 */
export async function setRemoteMaintenanceMode(enabled: boolean): Promise<boolean> {
    try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            console.error("[Maintenance] Update denied: no authenticated session");
            return false;
        }

        const { error } = await supabase
            .from("app_config")
            .update({ maintenance_mode: enabled, updated_at: new Date().toISOString() })
            .eq("id", 1);

        if (error) {
            console.error("[Maintenance] Failed to update:", error.message);
            return false;
        }

        // Also update local Zustand immediately
        useTripStore.getState().setMaintenanceMode(enabled);
        return true;
    } catch (err) {
        console.error("[Maintenance] Network error:", err);
        return false;
    }
}

export async function setRemoteCongestionConfig(config: CongestionConfig): Promise<boolean> {
    try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            console.error("[Maintenance] Congestion config update denied: no authenticated session");
            return false;
        }

        const normalizedConfig = normalizeCongestionConfig(config);
        const { error } = await supabase
            .from("app_config")
            .update({ congestion_config: normalizedConfig, updated_at: new Date().toISOString() })
            .eq("id", 1);

        if (error) {
            console.error("[Maintenance] Failed to update congestion config:", error.message);
            return false;
        }

        useTripStore.getState().setCongestionConfig(normalizedConfig);
        return true;
    } catch (err) {
        console.error("[Maintenance] Congestion config network error:", err);
        return false;
    }
}
