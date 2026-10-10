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

export function getAdaptivePredictionPollMs(profile?: NetworkProfile): number {
    void profile;
    return ACTIVE_PREDICTION_TICK_MS;
}

export function getAdaptiveCrowdReportMs(profile = getNetworkProfile()): number {
    if (profile.saveData || profile.effectiveType === 'slow-2g' || profile.effectiveType === '2g') {
        return 15_000;
    }
    if (profile.effectiveType === '3g') return 10_000;
    return 7_000;
}

export class PollHttpError extends Error {
    constructor(public readonly status: number, public readonly retryAfterMs = 0) {
        super(`Request failed with ${status}.`);
    }
}

export function parseRetryAfter(value: string | null, now = Date.now()): number {
    if (!value) return 0;
    const seconds = Number(value);
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
    return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}

export function getPollBackoffMs(failures: number, retryAfterMs = 0): number {
    return Math.max(retryAfterMs, Math.min(60_000, 1000 * 2 ** Math.min(6, Math.max(1, failures))));
}

/** One outstanding request; pause invalidates responses even if an adapter ignores abort. */
export function createForegroundPoller(options: {
    run: (signal: AbortSignal, isCurrent: () => boolean) => Promise<void>;
    isActive: () => boolean;
    onError?: (error: unknown) => void;
    intervalMs?: number;
    timeoutMs?: number;
    now?: () => number;
    setTimer?: typeof setTimeout;
    clearTimer?: typeof clearTimeout;
}) {
    const now = options.now ?? Date.now;
    const setTimer = options.setTimer ?? setTimeout;
    const clearTimer = options.clearTimer ?? clearTimeout;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    let stopped = false;
    let generation = 0;
    let failures = 0;
    let nextAllowedAt = 0;

    const clearScheduled = () => {
        if (timer !== null) clearTimer(timer);
        timer = null;
    };
    const schedule = (delay: number) => {
        clearScheduled();
        if (!stopped && options.isActive()) timer = setTimer(() => void tick(), delay);
    };
    const tick = async () => {
        clearScheduled();
        if (stopped || controller || !options.isActive()) return;
        if (now() < nextAllowedAt) {
            schedule(nextAllowedAt - now());
            return;
        }
        const startedAt = now();
        const currentGeneration = generation;
        const activeController = new AbortController();
        controller = activeController;
        const timeout = setTimer(() => activeController.abort(), options.timeoutMs ?? 10_000);
        const isCurrent = () => !stopped && currentGeneration === generation
            && !activeController.signal.aborted && options.isActive();
        try {
            await options.run(activeController.signal, isCurrent);
            if (isCurrent()) {
                failures = 0;
                nextAllowedAt = startedAt + (options.intervalMs ?? ACTIVE_PREDICTION_TICK_MS);
            }
        } catch (error) {
            if (!stopped && currentGeneration === generation && options.isActive()) {
                failures += 1;
                nextAllowedAt = now() + getPollBackoffMs(failures,
                    error instanceof PollHttpError ? error.retryAfterMs : 0);
                options.onError?.(error);
            }
        } finally {
            clearTimer(timeout);
            controller = null;
            schedule(Math.max(0, nextAllowedAt - now()));
        }
    };
    return {
        wake: (immediate = false) => {
            if (immediate && failures === 0) nextAllowedAt = 0;
            if (!stopped) void tick();
        },
        pause: () => { generation += 1; clearScheduled(); controller?.abort(); },
        stop: () => { stopped = true; generation += 1; clearScheduled(); controller?.abort(); },
    };
}
