'use client';

import { useEffect } from 'react';
import { useTrainStore } from '@/store/useTrainStore';
import { useTripStore } from '@/store/useTripStore';
import { getOperationalMode } from '@/domain/railway';
import { buildPredictionRequests } from '@/domain/predictions/clientRequests';
import { isPredictionResponse } from '@/domain/predictions/snapshot';
import { createForegroundPoller, PollHttpError, parseRetryAfter } from '@/domain/network/runtime';
import type { PredictedTrain } from '@/domain/predictions/engine';

export function usePredictedTrainPresence() {
    const spectatorMode = useTrainStore((state) => state.spectatorMode);
    const mockTrainsMode = useTrainStore((state) => state.mockTrainsMode);
    const selectedStationCode = useTrainStore((state) => state.selectedStationCode);
    const tripStatus = useTripStore((state) => state.status);
    const isDevMode = useTripStore((state) => state.isDevMode);
    const line7Mode = useTripStore((state) => state.line7Mode);
    const transitMode = useTripStore((state) => state.transitMode);
    const currentStationId = useTripStore((state) => (state.currentStation || state.origin)?.id);
    const direction = useTripStore((state) => state.direction);
    const shouldPredict = transitMode === 'train'
        && (spectatorMode || tripStatus !== 'IDLE') && !mockTrainsMode;
    const mode = getOperationalMode(isDevMode, line7Mode);

    useEffect(() => {
        const context = useTrainStore.getState().beginPredictionContext();
        if (!shouldPredict) return;
        const requests = buildPredictionRequests(currentStationId, selectedStationCode, direction, mode);
        let worker: Worker | null = null;
        let workerBusy = false;
        let disposed = false;

        const forecast = () => {
            if (disposed || document.hidden || workerBusy) return;
            const store = useTrainStore.getState();
            if (store.predictionContext !== context || store.predictionState === 'fresh') return;
            if (!store.predictionSnapshots.length) return;
            if (!worker) {
                try {
                    worker = new Worker(new URL('../workers/predictions.worker.ts', import.meta.url));
                    worker.onmessage = ({ data }: MessageEvent<{ context: number; revision: number; forecasts: PredictedTrain[] }>) => {
                        workerBusy = false;
                        if (!disposed) useTrainStore.getState().setOfflineForecasts(data.context, data.forecasts, data.revision);
                    };
                    worker.onerror = () => { workerBusy = false; worker?.terminate(); worker = null; };
                } catch { return; }
            }
            workerBusy = true;
            worker.postMessage({ context, revision: store.predictionRevision, snapshots: store.predictionSnapshots, now: Date.now() });
        };
        const poller = createForegroundPoller({
            isActive: () => !disposed && !document.hidden && navigator.onLine,
            run: async (signal, isCurrent) => {
                useTrainStore.getState().setPolling(true);
                try {
                    const snapshots = [];
                    for (const request of requests) {
                        const response = await fetch(request.jsonUrl, {
                            signal, cache: 'no-store', headers: { Accept: 'application/json' },
                        });
                        if (!response.ok) throw new PollHttpError(response.status,
                            parseRetryAfter(response.headers.get('Retry-After')));
                        const payload: unknown = await response.json();
                        if (!isPredictionResponse(payload)) throw new Error('Invalid prediction snapshot.');
                        snapshots.push({ key: request.key, response: payload, receivedAt: Date.now() });
                    }
                    if (isCurrent()) useTrainStore.getState().setPredictionSnapshots(context, snapshots);
                } finally {
                    if (!disposed) useTrainStore.getState().setPolling(false);
                }
            },
            onError: () => {
                useTrainStore.getState().setPredictionState('error', 'Live estimates are temporarily unavailable.');
                forecast();
            },
        });
        const refreshActivity = () => {
            if (document.hidden || !navigator.onLine) {
                poller.pause();
                useTrainStore.getState().setPolling(false);
                useTrainStore.getState().setPredictionState(navigator.onLine ? 'stale' : 'offline');
                if (document.hidden) {
                    worker?.terminate(); worker = null; workerBusy = false;
                } else forecast();
            } else poller.wake();
        };
        useTrainStore.getState().setPredictionState(navigator.onLine ? 'loading' : 'offline');
        refreshActivity();
        const expiryTimer = window.setInterval(() => {
            const store = useTrainStore.getState();
            if (store.predictionState === 'fresh' && store.predictionSnapshots.some(
                (snapshot) => Date.parse(snapshot.response.validUntil) < Date.now(),
            )) store.setPredictionState('stale');
            forecast();
        }, 5000);
        document.addEventListener('visibilitychange', refreshActivity);
        window.addEventListener('online', refreshActivity);
        window.addEventListener('offline', refreshActivity);
        return () => {
            disposed = true;
            poller.stop(); worker?.terminate();
            window.clearInterval(expiryTimer);
            document.removeEventListener('visibilitychange', refreshActivity);
            window.removeEventListener('online', refreshActivity);
            window.removeEventListener('offline', refreshActivity);
            useTrainStore.getState().setPolling(false);
        };
    }, [currentStationId, direction, mode, selectedStationCode, shouldPredict]);
}
