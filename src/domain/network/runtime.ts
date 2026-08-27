import type { DataMode } from '@/domain/offline/tripCheckpoint';

export interface NetworkProfile {
    saveData: boolean;
    effectiveType: string | null;
    dataMode: DataMode;
}

export const ACTIVE_PREDICTION_TICK_MS = 1_000;

interface NavigatorWithConnection extends Navigator {
    connection?: { saveData?: boolean; effectiveType?: string };
    mozConnection?: { saveData?: boolean; effectiveType?: string };
    webkitConnection?: { saveData?: boolean; effectiveType?: string };
}

export function getNetworkProfile(dataMode: DataMode = 'auto'): NetworkProfile {
    if (typeof navigator === 'undefined') {
        return { saveData: dataMode === 'saver', effectiveType: null, dataMode };
    }

    const typedNavigator = navigator as NavigatorWithConnection;
    const connection = typedNavigator.connection
        ?? typedNavigator.mozConnection
        ?? typedNavigator.webkitConnection;
    const effectiveType = connection?.effectiveType?.toLowerCase() ?? null;
    return {
        saveData: dataMode === 'saver' || (dataMode === 'auto' && connection?.saveData === true),
        effectiveType: dataMode === 'standard' ? null : effectiveType,
        dataMode,
    };
}

// SSE remains available to API consumers, but the commuter client defaults to bounded polling.
export function shouldUsePredictionStream(): boolean {
    return false;
}

export function getAdaptivePredictionPollMs(profile = getNetworkProfile()): number {
    if (profile.saveData || profile.effectiveType === 'slow-2g' || profile.effectiveType === '2g') {
        return 30_000;
    }
    if (profile.effectiveType === '3g') return 20_000;
    return 15_000;
}

export function getAdaptiveCrowdReportMs(profile = getNetworkProfile()): number {
    if (profile.saveData || profile.effectiveType === 'slow-2g' || profile.effectiveType === '2g') {
        return 15_000;
    }
    if (profile.effectiveType === '3g') return 10_000;
    return 7_000;
}