'use client';

import { useEffect } from 'react';
import { useTrainStore } from '@/store/useTrainStore';
import { useTripStore } from '@/store/useTripStore';
import { getOperationalMode } from '@/domain/railway';
import { buildPredictionRequests } from '@/domain/predictions/clientRequests';
import { parsePredictionRequestFromUrl } from '@/domain/predictions/request';
import {
    getAdaptivePredictionPollMs,
    getNetworkProfile,
    ACTIVE_PREDICTION_TICK_MS,
} from '@/domain/network/runtime';
import type { PredictionResponse } from '@/domain/predictions/engine';
import type { TrainPresence } from '@/types/train';

function isPredictionResponse(value: unknown): value is PredictionResponse {
    return Boolean(value)
        && typeof value === 'object'
        && Array.isArray((value as Partial<PredictionResponse>).predictions);
}

async function fetchPredictions(url: string, signal: AbortSignal): Promise<TrainPresence[]> {
    const response = await fetch(url, {
        signal,
        cache: 'no-store',
        headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Prediction request failed with ${response.status}.`);
    const payload: unknown = await response.json();
    return isPredictionResponse(payload) ? payload.predictions : [];
}

export function usePredictedTrainPresence() {
    const spectatorMode = useTrainStore((state) => state.spectatorMode);
    const mockTrainsMode = useTrainStore((state) => state.mockTrainsMode);
    const selectedStationCode = useTrainStore((state) => state.selectedStationCode);
    const tripStatus = useTripStore((state) => state.status);
    const isDevMode = useTripStore((state) => state.isDevMode);
    const line7Mode = useTripStore((state) => state.line7Mode);
    const transitMode = useTripStore((state) => state.transitMode);
    const currentStation = useTripStore((state) => state.currentStation || state.origin);
    const direction = useTripStore((state) => state.direction);
    const dataMode = useTripStore((state) => state.dataMode);
    const shouldPredict = transitMode === 'train'
        && (spectatorMode || tripStatus !== 'IDLE')
        && !mockTrainsMode;
    const mode = getOperationalMode(isDevMode, line7Mode);

    useEffect(() => {
        if (!shouldPredict) {
            useTrainStore.getState().setPredictedTrains([]);
            return;
        }

        let cancelled = false;
        let controller: AbortController | null = null;
        let interval: number | null = null;
        const requests = buildPredictionRequests(currentStation?.id, selectedStationCode, direction, mode);
        const pollMs = getAdaptivePredictionPollMs(getNetworkProfile(dataMode));

        const sync = async () => {
            if (cancelled || document.hidden || !navigator.onLine) return;
            controller?.abort();
            controller = new AbortController();
            useTrainStore.getState().setPolling(true);
            try {
                const batches = await Promise.all(
                    requests.map((request) => fetchPredictions(request.jsonUrl, controller!.signal)),
                );
                if (!cancelled) {
                    useTrainStore.getState().setPredictedTrains(batches.flat());
                    useTrainStore.getState().setError(null);
                }
            } catch (error) {
                if (!cancelled && !(error instanceof DOMException && error.name === 'AbortError')) {
                    useTrainStore.getState().setError('Live estimates are temporarily unavailable.');
                }
            } finally {
                if (!cancelled) useTrainStore.getState().setPolling(false);
            }
        };

        const onVisibility = () => {
            if (document.hidden) controller?.abort();
            else void sync();
        };
        const onOnline = () => void sync();

        void sync();
        interval = window.setInterval(() => void sync(), pollMs);
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('online', onOnline);

        return () => {
            cancelled = true;
            controller?.abort();
            if (interval !== null) window.clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('online', onOnline);
            useTrainStore.getState().setPolling(false);
        };
    }, [
        currentStation?.id,
        dataMode,
        direction,
        mode,
        selectedStationCode,
        shouldPredict,
    ]);
    useEffect(() => {
        if (!shouldPredict) return;

        let cancelled = false;
        let interval: number | null = null;
        let enginePromise: Promise<typeof import('@/domain/predictions/engine')> | null = null;
        let tickInFlight = false;
        const requests = buildPredictionRequests(currentStation?.id, selectedStationCode, direction, mode);

        const tick = async () => {
            if (cancelled || tickInFlight || document.hidden) return;
            tickInFlight = true;

            try {
                enginePromise ??= import('@/domain/predictions/engine');
                const { getPredictionResponse } = await enginePromise;
                if (cancelled) return;

                const now = new Date();
                const predictions = requests.flatMap((request) => {
                    const parsed = parsePredictionRequestFromUrl(
                        new URL(request.jsonUrl, window.location.origin),
                    );
                    return getPredictionResponse({ ...parsed, now }).predictions;
                });

                if (!cancelled) {
                    useTrainStore.getState().setPredictedTrains(predictions);
                }
            } finally {
                tickInFlight = false;
            }
        };

        const onVisibility = () => {
            if (!document.hidden) void tick();
        };

        void tick();
        interval = window.setInterval(() => void tick(), ACTIVE_PREDICTION_TICK_MS);
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            cancelled = true;
            if (interval !== null) window.clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [
        currentStation?.id,
        direction,
        mode,
        selectedStationCode,
        shouldPredict,
    ]);
}
