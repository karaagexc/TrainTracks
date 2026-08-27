'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTrainStore } from '@/store/useTrainStore';
import { useTripStore } from '@/store/useTripStore';
import type { TrainPresence } from '@/types/train';
import { getTrainPresenceIdentity, isPublicTrainPresence } from '@/domain/trainPresence';
import { TRAIN_PRESENCE_CHANNEL } from '@/domain/crowd/constants';

function isTrainPresence(value: unknown): value is TrainPresence {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<TrainPresence>;
    return (
        typeof candidate.id === 'string' &&
        typeof candidate.lat === 'number' &&
        typeof candidate.lng === 'number' &&
        typeof candidate.updatedAt === 'number' &&
        !!candidate.lineId &&
        (candidate.sampleId === undefined || typeof candidate.sampleId === 'string') &&
        !!candidate.direction &&
        !!candidate.statusCode
    );
}

export function useRealtimeTrainPresence() {
    const spectatorMode = useTrainStore((s) => s.spectatorMode);
    const mockTrainsMode = useTrainStore((s) => s.mockTrainsMode);
    const tripStatus = useTripStore((s) => s.status);
    const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
    const shouldListen = pageVisible && (spectatorMode || tripStatus !== 'IDLE') && !mockTrainsMode;

    useEffect(() => {
        const handleVisibilityChange = () => setPageVisible(!document.hidden);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    useEffect(() => {
        if (!shouldListen) return;
        useTrainStore.getState().pruneStaleTrains();
        const interval = setInterval(() => {
            useTrainStore.getState().pruneStaleTrains();
        }, 5000);

        return () => clearInterval(interval);
    }, [shouldListen]);

    useEffect(() => {
        if (!shouldListen) {
            useTrainStore.getState().setPolling(false);
            return;
        }

        const supabase = createClient();
        const channel = supabase.channel(TRAIN_PRESENCE_CHANNEL, {
            config: {
                broadcast: { self: false },
            },
        });

        channel.on('broadcast', { event: 'presence' }, ({ payload }: { payload: unknown }) => {
            if (!isTrainPresence(payload)) return;
            if (payload.source === 'simulated') return;
            if (!isPublicTrainPresence(payload)) return;
            const trainStore = useTrainStore.getState();
            if (
                trainStore.crowdTrain &&
                getTrainPresenceIdentity(payload) === getTrainPresenceIdentity(trainStore.crowdTrain)
            ) {
                return;
            }
            trainStore.upsertTrain(payload);
        });

        channel.subscribe((status: string) => {
            const ready = status === 'SUBSCRIBED';
            useTrainStore.getState().setPolling(ready);
            useTrainStore.getState().setError(ready ? null : status);
        });

        return () => {
            useTrainStore.getState().setPolling(false);
            supabase.removeChannel(channel);
        };
    }, [shouldListen]);
}

/**
 * Backwards-compatible hook name.
 * Realtime train presence now comes from Supabase broadcasts plus local/dev simulators,
 * not external API polling.
 */
export function useTrainPolling() {
    return useRealtimeTrainPresence();
}

export { TRAIN_PRESENCE_CHANNEL };
