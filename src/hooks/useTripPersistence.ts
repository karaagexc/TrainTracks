'use client';

import { useEffect } from 'react';
import {
    deleteRuntimeValue,
    readRuntimeValue,
    writeRuntimeValue,
} from '@/domain/offline/indexedDb';
import {
    getCheckpointDisposition,
    parseActiveTripCheckpoint,
    isPersistedTripPreferences,
    TRIP_CHECKPOINT_KEY,
    LEGACY_TRIP_CHECKPOINT_KEY,
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
        ownerId: state.tripOwnerId,
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
        let initialized = false;
        let preferencesReadable = false;
        let checkpointsReadable = false;

        const reportStorageFailure = (error: unknown) => {
            const message = error instanceof Error ? error.message : 'Trip recovery storage is unavailable.';
            useTripStore.getState().setPersistenceError(message);
            console.warn('[TripPersistence] Recovery could not be saved:', error);
        };
        const safely = (operation: Promise<unknown>) => { void operation.catch(reportStorageFailure); };

        const persistPreferences = async () => {
            if (!initialized || !preferencesReadable) return;
            await writeRuntimeValue(TRIP_PREFERENCES_KEY, buildPreferences());
        };
        const persistCheckpoint = async () => {
            // A failed read is unknown data, not permission to replace or delete it.
            if (!initialized || !checkpointsReadable) return;
            const checkpoint = buildCheckpoint();
            if (checkpoint) {
                await writeRuntimeValue(TRIP_CHECKPOINT_KEY, checkpoint);
                useTripStore.getState().setPersistenceError(null);
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
                safely(persistPreferences());
            }, 250);
        };
        const scheduleCheckpoint = () => {
            if (checkpointTimer !== null) return;
            checkpointTimer = window.setTimeout(() => {
                checkpointTimer = null;
                safely(persistCheckpoint());
            }, 2000);
        };

        const initialize = async () => {
            const readSafely = async (key: string) => {
                try {
                    return { readable: true, value: await readRuntimeValue<unknown>(key) };
                } catch (error) {
                    reportStorageFailure(error);
                    return { readable: false, value: null };
                }
            };
            const [preferencesRead, checkpointRead, legacyRead] = await Promise.all([
                readSafely(TRIP_PREFERENCES_KEY),
                readSafely(TRIP_CHECKPOINT_KEY),
                readSafely(LEGACY_TRIP_CHECKPOINT_KEY),
            ]);
            if (cancelled) return;
            preferencesReadable = preferencesRead.readable;
            checkpointsReadable = checkpointRead.readable && legacyRead.readable;
            const storedPreferences = preferencesRead.value;
            const storedCheckpoint = checkpointRead.value;
            const legacyCheckpoint = legacyRead.value;

            useTripStore.getState().hydratePreferences(
                isPersistedTripPreferences(storedPreferences)
                    ? storedPreferences
                    : DEFAULT_PREFERENCES,
            );

            const checkpoint = parseActiveTripCheckpoint(storedCheckpoint) ?? parseActiveTripCheckpoint(legacyCheckpoint);
            if (checkpoint) {
                const disposition = getCheckpointDisposition(checkpoint);
                if (disposition === 'auto_resume') {
                    useTripStore.getState().restoreTripCheckpoint(checkpoint);
                } else if (disposition === 'prompt') {
                    useTripStore.getState().setPendingTripRecovery(checkpoint);
                } else if (checkpointsReadable) {
                    safely(deleteRuntimeValue(TRIP_CHECKPOINT_KEY));
                }
                if (checkpointsReadable && !parseActiveTripCheckpoint(storedCheckpoint) && disposition !== 'expired') {
                    safely(writeRuntimeValue(TRIP_CHECKPOINT_KEY, checkpoint).then(() => (
                        deleteRuntimeValue(LEGACY_TRIP_CHECKPOINT_KEY)
                    )));
                } else if (checkpointsReadable && legacyCheckpoint) {
                    safely(deleteRuntimeValue(LEGACY_TRIP_CHECKPOINT_KEY));
                }
            }
            if (checkpointsReadable && !checkpoint) {
                if (legacyCheckpoint) safely(deleteRuntimeValue(LEGACY_TRIP_CHECKPOINT_KEY));
                if (storedCheckpoint) safely(deleteRuntimeValue(TRIP_CHECKPOINT_KEY));
            }
            initialized = true;

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

                if (checkpointsReadable && previousPending && !state.pendingTripRecovery && state.status === 'IDLE') {
                    safely(deleteRuntimeValue(TRIP_CHECKPOINT_KEY));
                }
                previousPending = state.pendingTripRecovery;
            });
        };

        const flushOnHide = (event: Event) => {
            if (event.type !== 'pagehide' && document.visibilityState !== 'hidden') return;
            safely(persistPreferences());
            safely(persistCheckpoint());
        };

        safely(initialize());
        document.addEventListener('visibilitychange', flushOnHide);
        window.addEventListener('pagehide', flushOnHide);

        return () => {
            cancelled = true;
            unsubscribe?.();
            if (preferenceTimer !== null) window.clearTimeout(preferenceTimer);
            if (checkpointTimer !== null) window.clearTimeout(checkpointTimer);
            document.removeEventListener('visibilitychange', flushOnHide);
            window.removeEventListener('pagehide', flushOnHide);
            safely(persistPreferences());
            safely(persistCheckpoint());
        };
    }, []);
}
