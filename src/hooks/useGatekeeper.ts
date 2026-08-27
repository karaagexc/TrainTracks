import { useEffect, useMemo, useRef } from 'react';
import { useSmartLocation } from '@/hooks/useSmartLocation';
import { useTripStore } from '@/store/useTripStore';
import { getOperationalMode } from '@/domain/railway';
import { getStationProximity } from '@/domain/location/stationProximity';

// 350m reliably catches transfer areas like LRT-1 EDSA and MRT-3 Taft.
const GEOFENCE_RADIUS_KM = 0.35;

export function useGatekeeper() {
    const { location, isOverride, bridgeName, locationStatus, requestLocation, gpsAccuracy } = useSmartLocation();
    const line7Mode = useTripStore(s => s.line7Mode);
    const isDevMode = useTripStore(s => s.isDevMode);
    const rawTransitMode = useTripStore(s => s.transitMode);
    const transitMode = isDevMode ? rawTransitMode : 'train';
    const previousStationIdRef = useRef<string | null>(null);

    const proximity = useMemo(() => {
        if (!location || !locationStatus.isUsable) {
            return null;
        }

        return getStationProximity({
            location,
            mode: getOperationalMode(isDevMode, line7Mode),
            line7Mode,
            transitMode,
            radiusKm: GEOFENCE_RADIUS_KM,
            accuracyMeters: gpsAccuracy,
            previousStationId: previousStationIdRef.current,
        });
    }, [gpsAccuracy, location, locationStatus.isUsable, line7Mode, isDevMode, transitMode]);

    useEffect(() => {
        if (proximity?.nearest && proximity.conflicts.length === 0) {
            previousStationIdRef.current = proximity.nearest.station.id;
        }
    }, [proximity]);

    return {
        nearest: proximity?.nearest ?? null,
        conflicts: proximity?.conflicts ?? [],
        loading: proximity === null,
        isOverride,
        bridgeName,
        locationStatus,
        requestLocation,
        proximityConfidence: proximity?.confidence ?? 'low',
        ambiguityReason: proximity?.ambiguityReason ?? null,
    };
}
