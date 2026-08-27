import { useEffect, useRef } from 'react';
import {
    alignJourneySnapshotToLocation,
    reduceJourneySnapshot,
} from '@/domain/journey/engine';
import { JOURNEY_CONSTANTS } from '@/domain/journey/constants';
import { shouldShowGpsReconnectionBanner } from '@/domain/location/status';
import { getDistanceKm } from '@/utils/geo';
import { useTripStore } from '@/store/useTripStore';
import { useSmartLocation } from './useSmartLocation';

export function useJourneyRuntime() {
    const status = useTripStore((state) => state.status);
    const origin = useTripStore((state) => state.origin);
    const destination = useTripStore((state) => state.destination);
    const isDevMode = useTripStore((state) => state.isDevMode);
    const isGpsOverride = useTripStore((state) => state.isGpsOverride);
    const journeySnapshot = useTripStore((state) => state.journeySnapshot);
    const syncJourneySnapshot = useTripStore((state) => state.syncJourneySnapshot);
    const setGpsReconnecting = useTripStore((state) => state.setGpsReconnecting);
    const setFallbackLocationActive = useTripStore((state) => state.setFallbackLocationActive);
    const setFallbackLocation = useTripStore((state) => state.setFallbackLocation);
    const setFallbackSpeed = useTripStore((state) => state.setFallbackSpeed);

    const {
        locationSample,
        rawGpsLocation,
        rawGpsSpeed,
        rawGpsAccuracy,
        rawGpsTimestamp,
    } = useSmartLocation();

    const alignedRouteKeyRef = useRef<string | null>(null);
    const active = status === 'WAITING' || status === 'TRANSIT';
    const routeKey = `${origin?.id ?? 'none'}:${destination?.id ?? 'none'}:${journeySnapshot.route?.operationalMode ?? 'none'}`;

    useEffect(() => {
        alignedRouteKeyRef.current = null;
    }, [routeKey]);

    useEffect(() => {
        if (!active) return;

        const source = isGpsOverride ? locationSample.source : 'gps';
        const location = isGpsOverride ? locationSample.location : rawGpsLocation;
        const speedKph = isGpsOverride ? locationSample.speedKph : rawGpsSpeed;
        const accuracyMeters = isGpsOverride ? locationSample.accuracyMeters : rawGpsAccuracy;
        const timestamp = isGpsOverride
            ? locationSample.timestamp ?? Date.now()
            : rawGpsTimestamp;
        if (!location || !timestamp) return;

        const current = useTripStore.getState().journeySnapshot;
        const shouldAlignLateEntry = alignedRouteKeyRef.current !== routeKey
            && Boolean(origin)
            && getDistanceKm(location, origin!) > JOURNEY_CONSTANTS.lateEntryDistanceKm;
        const next = shouldAlignLateEntry
            ? alignJourneySnapshotToLocation(
                current,
                location,
                speedKph,
                accuracyMeters,
                timestamp,
                source === 'simulation' ? 'simulation' : 'gps',
            )
            : reduceJourneySnapshot(current, {
                type: 'LOCATION_SAMPLE',
                location,
                speedKph,
                gpsAccuracy: accuracyMeters,
                timestamp,
                source,
            });

        alignedRouteKeyRef.current = routeKey;
        syncJourneySnapshot(next);
    }, [
        active,
        isGpsOverride,
        locationSample,
        origin,
        rawGpsAccuracy,
        rawGpsLocation,
        rawGpsSpeed,
        rawGpsTimestamp,
        routeKey,
        syncJourneySnapshot,
    ]);

    useEffect(() => {
        if (!active) return;

        const tick = () => {
            const current = useTripStore.getState().journeySnapshot;
            const next = reduceJourneySnapshot(current, { type: 'TICK', timestamp: Date.now() });
            if (next !== current) syncJourneySnapshot(next);
        };
        const interval = window.setInterval(tick, 1000);
        const onVisibility = () => {
            if (!document.hidden) tick();
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [active, syncJourneySnapshot]);

    useEffect(() => {
        setGpsReconnecting(shouldShowGpsReconnectionBanner(journeySnapshot.gpsFallbackActive, isDevMode));
        setFallbackLocationActive(false);
        setFallbackLocation(journeySnapshot.gpsFallbackActive ? journeySnapshot.estimatedLocation : null);
        setFallbackSpeed(journeySnapshot.gpsFallbackActive ? journeySnapshot.estimatedSpeedKph : null);
    }, [
        journeySnapshot.estimatedLocation,
        journeySnapshot.estimatedSpeedKph,
        journeySnapshot.gpsFallbackActive,
        isDevMode,
        setFallbackLocation,
        setFallbackLocationActive,
        setFallbackSpeed,
        setGpsReconnecting,
    ]);
}