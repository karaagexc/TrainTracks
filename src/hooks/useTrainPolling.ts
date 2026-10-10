'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTrainStore } from '@/store/useTrainStore';
import { useTripStore } from '@/store/useTripStore';
import { TRAIN_PRESENCE_CHANNEL } from '@/domain/crowd/constants';
import { createCrowdSampleReceiver, isReceivedCrowdPresence } from '@/domain/crowd/receiver';
import { createForegroundPoller, PollHttpError, parseRetryAfter } from '@/domain/network/runtime';

export function useRealtimeTrainPresence() {
    const spectatorMode = useTrainStore((state) => state.spectatorMode);
    const mockTrainsMode = useTrainStore((state) => state.mockTrainsMode);
    const tripStatus = useTripStore((state) => state.status);
    const [active, setActive] = useState(() => typeof document === 'undefined'
        || (!document.hidden && navigator.onLine));
    const shouldListen = active && (spectatorMode || tripStatus !== 'IDLE') && !mockTrainsMode;

    useEffect(() => {
        const refresh = () => setActive(!document.hidden && navigator.onLine);
        document.addEventListener('visibilitychange', refresh);
        window.addEventListener('online', refresh);
        window.addEventListener('offline', refresh);
        return () => {
            document.removeEventListener('visibilitychange', refresh);
            window.removeEventListener('online', refresh);
            window.removeEventListener('offline', refresh);
        };
    }, []);

    useEffect(() => {
        if (!shouldListen) {
            useTrainStore.getState().setRealtimeStatus('idle');
            return;
        }
        let disposed = false;
        const receiveSample = createCrowdSampleReceiver();
        const poller = createForegroundPoller({
            intervalMs: 30_000,
            isActive: () => !disposed && !document.hidden && navigator.onLine,
            run: async (signal, isCurrent) => {
                const response = await fetch('/api/crowd/presence', {
                    signal, cache: 'no-store', headers: { Accept: 'application/json' },
                });
                if (!response.ok) throw new PollHttpError(response.status,
                    parseRetryAfter(response.headers.get('Retry-After')));
                const payload = await response.json() as { ok?: boolean; trains?: unknown[] };
                if (!payload.ok || !Array.isArray(payload.trains)) throw new Error('Invalid crowd snapshot.');
                if (!isCurrent()) return;
                const trains = payload.trains.filter((train) => isReceivedCrowdPresence(train))
                    .filter((train) => receiveSample(train));
                useTrainStore.getState().reconcileCrowdSnapshot(trains, Date.now());
            },
            onError: () => useTrainStore.getState().setRealtimeStatus(
                useTrainStore.getState().realtimeStatus, 'Crowd snapshot temporarily unavailable.',
            ),
        });
        const supabase = createClient();
        const channel = supabase.channel(TRAIN_PRESENCE_CHANNEL, { config: { broadcast: { self: false } } });
        channel.on('broadcast', { event: 'presence' }, ({ payload }: { payload: unknown }) => {
            if (!disposed && isReceivedCrowdPresence(payload) && receiveSample(payload)) {
                useTrainStore.getState().upsertTrain(payload);
            }
        });
        useTrainStore.getState().setRealtimeStatus('connecting');
        channel.subscribe((status: string) => {
            if (disposed) return;
            useTrainStore.getState().setRealtimeStatus(status === 'SUBSCRIBED' ? 'live' : status.toLowerCase());
            if (status === 'SUBSCRIBED') poller.wake(true);
        });
        const activity = () => {
            if (document.hidden || !navigator.onLine) poller.pause();
            else poller.wake(true);
        };
        poller.wake();
        const prune = window.setInterval(() => useTrainStore.getState().pruneStaleTrains(), 5000);
        document.addEventListener('visibilitychange', activity);
        window.addEventListener('online', activity);
        window.addEventListener('offline', activity);
        return () => {
            disposed = true; poller.stop(); window.clearInterval(prune);
            document.removeEventListener('visibilitychange', activity);
            window.removeEventListener('online', activity);
            window.removeEventListener('offline', activity);
            useTrainStore.getState().setRealtimeStatus('idle');
            void supabase.removeChannel(channel);
        };
    }, [shouldListen]);
}

export function useTrainPolling() { return useRealtimeTrainPresence(); }
export { TRAIN_PRESENCE_CHANNEL };
