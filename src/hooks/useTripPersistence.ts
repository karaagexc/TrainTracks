'use client';

import { useEffect } from 'react';
import {
    deleteRuntimeValue,
    readRuntimeValue,
    writeRuntimeValue,
} from '@/domain/offline/indexedDb';
import {
    getCheckpointDisposition,
    isActiveTripCheckpoint,
    isPersistedTripPreferences,
    TRIP_CHECKPOINT_KEY,
    TRIP_CHECKPOINT_VERSION,
    TRIP_PREFERENCES_KEY,
    type ActiveTripCheckpoint,
    type PersistedTripPreferences,
} from '@/domain/offline/tripCheckpoint';
import { useTripStore } from '@/store/useTripStore';

const DEFAULT_PREFERENCES: PersistedTripPreferences = {
    version: 1,
    favorites: [],
    isMuted: false,
    notificationPreference: 'all',
    themePreference: 'system',
    showRushHour: true,
    dataMode: 'auto',
};

function buildPreferences(): PersistedTripPreferences {
    const state = useTripStore.getState();
    return {
        version: 1,
        favorites: state.favorites,
        isMuted: state.isMuted,
        notificationPreference: state.notificationPreference,
        themePreference: state.themePreference,
        showRushHour: state.showRushHour,
        dataMode: state.dataMode,
    };
}

function buildCheckpoint(): ActiveTripCheckpoint | null {
    const state = useTripStore.getState();
    if (
        state.isDevMode
        || (state.status !== 'WAITING' && state.status !== 'TRANSIT')
        || !state.origin
        || !state.destination
        || !state.tripStartedAt
        || !state.journeySnapshot.route
    ) {
        return null;
    }

    return {
        version: TRIP_CHECKPOINT_VERSION,
        savedAt: Date.now(),
        tripStartedAt: state.tripStartedAt,
        originId: state.origin.id,
        destinationId: state.destination.id,
        transitMode: state.transitMode,
        selectedLine: state.selectedLine,
        ticketType: state.ticketType,
        line7Mode: state.line7Mode,
        isDevMode: state.isDevMode,
        runningFare: state.runningFare,
        journeySnapshot: state.journeySnapshot,
    };
}

export function useTripPersistence() {
    useEffect(() => {
        let cancelled = false;
        let unsubscribe: (() => void) | null = null;
        let preferenceTimer: number | null = null;
        let checkpointTimer: number | null = null;

        const persistPreferences = () => writeRuntimeValue(TRIP_PREFERENCES_KEY, buildPreferences());
        const persistCheckpoint = async () => {
            const checkpoint = buildCheckpoint();
            if (checkpoint) {
                await writeRuntimeValue(TRIP_CHECKPOINT_KEY, checkpoint);
                return;
            }
            const state = useTripStore.getState();
            if (!state.pendingTripRecovery) {
                await deleteRuntimeValue(TRIP_CHECKPOINT_KEY);
            }
        };

        const schedulePreferences = () => {
            if (preferenceTimer !== null) return;
            preferenceTimer = window.setTimeout(() => {
                preferenceTimer = null;
                void persistPreferences();
            }, 250);
        };
        const scheduleCheckpoint = () => {
            if (checkpointTimer !== null) return;
            checkpointTimer = window.setTimeout(() => {
                checkpointTimer = null;
                void persistCheckpoint();
            }, 2000);
        };

        const initialize = async () => {
            const [storedPreferences, storedCheckpoint] = await Promise.all([
                readRuntimeValue<unknown>(TRIP_PREFERENCES_KEY),
                readRuntimeValue<unknown>(TRIP_CHECKPOINT_KEY),
            ]);
            if (cancelled) return;

            useTripStore.getState().hydratePreferences(
                isPersistedTripPreferences(storedPreferences)
                    ? storedPreferences
                    : DEFAULT_PREFERENCES,
            );

            if (isActiveTripCheckpoint(storedCheckpoint)) {
                const disposition = getCheckpointDisposition(storedCheckpoint);
                if (disposition === 'auto_resume') {
                    useTripStore.getState().restoreTripCheckpoint(storedCheckpoint);
                } else if (disposition === 'prompt') {
                    useTripStore.getState().setPendingTripRecovery(storedCheckpoint);
                } else {
                    await deleteRuntimeValue(TRIP_CHECKPOINT_KEY);
                }
            }

            let previousPending = useTripStore.getState().pendingTripRecovery;
            unsubscribe = useTripStore.subscribe((state, previous) => {
                if (!state.persistenceHydrated) return;
                if (
                    state.favorites !== previous.favorites
                    || state.isMuted !== previous.isMuted
                    || state.notificationPreference !== previous.notificationPreference
                    || state.themePreference !== previous.themePreference
                    || state.showRushHour !== previous.showRushHour
                    || state.dataMode !== previous.dataMode
                ) {
                    schedulePreferences();
                }

                if (
                    state.status === 'WAITING'
                    || state.status === 'TRANSIT'
                    || previous.status === 'WAITING'
                    || previous.status === 'TRANSIT'
                ) {
                    scheduleCheckpoint();
                }

                if (previousPending && !state.pendingTripRecovery && state.status === 'IDLE') {
                    void deleteRuntimeValue(TRIP_CHECKPOINT_KEY);
                }
                previousPending = state.pendingTripRecovery;
            });
        };

        const flushOnHide = () => {
            if (document.visibilityState !== 'hidden') return;
            void persistPreferences();
            void persistCheckpoint();
        };

        void initialize();
        document.addEventListener('visibilitychange', flushOnHide);
        window.addEventListener('pagehide', flushOnHide);

        return () => {
            cancelled = true;
            unsubscribe?.();
            if (preferenceTimer !== null) window.clearTimeout(preferenceTimer);
            if (checkpointTimer !== null) window.clearTimeout(checkpointTimer);
            document.removeEventListener('visibilitychange', flushOnHide);
            window.removeEventListener('pagehide', flushOnHide);
            void persistPreferences();
            void persistCheckpoint();
        };
    }, []);
}