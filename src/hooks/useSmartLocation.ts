import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTripStore } from '@/store/useTripStore';
import { useLocationStore } from '@/store/useLocationStore';
import { BRIDGE_ZONES } from '@/data/geofence';
import { getDistanceKm } from '@/utils/geo';
import { buildLocationSample, diagnoseLocationStatus, LOCATION_STALE_MS, SECURE_CONTEXT_MESSAGE } from '@/domain/location/status';
import { measureGpsSpeed, smoothGpsSpeed } from '@/domain/location/speed';
import { filterGpsPosition, type GpsPositionFix } from '@/domain/location/gpsFilter';
import type { Direction, LocationSample, Station } from '@/types';
import type { LocationOverrideState, RawLocationState } from '@/domain/location/types';

interface Coordinates {
    latitude: number;
    longitude: number;
}

type GeoPermissionState = PermissionState | 'unsupported' | 'unknown';
type GeoErrorCode = 'permission_denied' | 'position_unavailable' | 'timeout' | 'unsupported' | 'insecure_context' | 'stale' | null;

interface SharedLocationState {
    location: Coordinates | null;
    rawHeading: number | null;
    speed: number | null;
    gpsAccuracy: number;
    gpsTimestamp: number;
    gpsError: string | null;
    gpsErrorCode: GeoErrorCode;
    permissionState: GeoPermissionState;
    isRequestingLocation: boolean;
    isSecureContext: boolean;
}

const ACTIVE_GEO_OPTIONS: PositionOptions = {
    enableHighAccuracy: true,
    maximumAge: 750,
    timeout: 15000,
};

const IDLE_GEO_OPTIONS: PositionOptions = {
    enableHighAccuracy: false,
    maximumAge: 30_000,
    timeout: 10_000,
};
const IDLE_LOCATION_REFRESH_MS = 45_000;

const ACTIVE_STATION_SPEED_RADIUS_KM = 0.22;

let sharedLocationState: SharedLocationState = {
    location: null,
    rawHeading: null,
    speed: null,
    gpsAccuracy: 999,
    gpsTimestamp: 0,
    gpsError: null,
    gpsErrorCode: null,
    permissionState: 'unknown',
    isRequestingLocation: false,
    isSecureContext: true,
};

const listeners = new Set<() => void>();
let watchId: number | null = null;
let watchdogId: number | null = null;
let permissionProbeStarted = false;
let lastPositionSample: GpsPositionFix | null = null;
let lowMotionSampleCount = 0;
let lastListenerPublishAt = 0;
let lastWatchRestartAt = 0;
let visibilityRecoveryStarted = false;
let locationRuntimeStarted = false;
let tripModeSubscriptionStarted = false;
let idleRefreshId: number | null = null;

function publishLocationState(patch: Partial<SharedLocationState>, notify = true) {
    sharedLocationState = { ...sharedLocationState, ...patch };
    if (notify) listeners.forEach(listener => listener());
}

function subscribeLocation(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function getSecureContextState() {
    return typeof window === 'undefined' || window.isSecureContext;
}

function getBucketedHeading(deg: number, lineId?: string): Direction | 'UNKNOWN' {
    const d = (deg % 360 + 360) % 360;

    if (lineId === 'LRT2') {
        if (d >= 225 && d < 315) return 'WESTBOUND';
        if (d >= 45 && d < 135) return 'EASTBOUND';
        return 'UNKNOWN';
    }

    if (d >= 315 || d < 45) return 'NORTHBOUND';
    if (d >= 135 && d < 225) return 'SOUTHBOUND';
    return 'UNKNOWN';
}

function locationErrorMessage(err: GeolocationPositionError) {
    if (err.code === err.PERMISSION_DENIED) {
        return 'Location permission is blocked for this site. Allow location access in your browser settings, then try again.';
    }
    if (err.code === err.POSITION_UNAVAILABLE) {
        return 'Your device could not provide a GPS fix yet. Move near a window or turn location accuracy on, then retry.';
    }
    if (err.code === err.TIMEOUT) {
        return 'Still acquiring a GPS fix. Keep this screen open and try again if the prompt did not appear.';
    }
    return err.message || 'Unable to read your location.';
}

function locationErrorCode(err: GeolocationPositionError): GeoErrorCode {
    if (err.code === err.PERMISSION_DENIED) return 'permission_denied';
    if (err.code === err.POSITION_UNAVAILABLE) return 'position_unavailable';
    if (err.code === err.TIMEOUT) return 'timeout';
    return 'position_unavailable';
}

function handlePosition(pos: GeolocationPosition) {
    const { latitude, longitude, heading, accuracy } = pos.coords;
    const timestamp = pos.timestamp || Date.now();
    const decision = filterGpsPosition(lastPositionSample, {
        location: { latitude, longitude },
        timestamp,
        accuracyMeters: accuracy ?? 999,
    });
    if (!decision.accepted) return;

    const nextLocation = decision.fix.location;
    const resolvedSpeed = resolveSpeedKph(pos, nextLocation, timestamp);
    const nativeHeading = heading !== null && Number.isFinite(heading) ? heading : null;
    const resolvedHeading = nativeHeading ?? decision.inferredHeading ?? sharedLocationState.rawHeading;
    const movedMeters = sharedLocationState.location
        ? getDistanceKm(sharedLocationState.location, nextLocation) * 1000
        : Infinity;
    const speedChanged = Math.abs((sharedLocationState.speed ?? 0) - resolvedSpeed) >= 0.5;
    const accuracyChanged = Math.abs(sharedLocationState.gpsAccuracy - decision.fix.accuracyMeters) >= 5;
    const headingChanged = resolvedHeading !== null && sharedLocationState.rawHeading !== null
        ? Math.abs(((resolvedHeading - sharedLocationState.rawHeading + 540) % 360) - 180) >= 5
        : resolvedHeading !== sharedLocationState.rawHeading;
    const shouldNotify = movedMeters >= 2
        || speedChanged
        || accuracyChanged
        || headingChanged
        || timestamp - lastListenerPublishAt >= 5000
        || sharedLocationState.gpsError !== null;

    lastPositionSample = decision.fix;

    publishLocationState({
        location: nextLocation,
        rawHeading: resolvedHeading,
        speed: resolvedSpeed,
        gpsAccuracy: decision.fix.accuracyMeters,
        gpsTimestamp: timestamp,
        gpsError: null,
        gpsErrorCode: null,
        permissionState: 'granted',
        isRequestingLocation: false,
        isSecureContext: getSecureContextState(),
    }, shouldNotify);
    if (shouldNotify) lastListenerPublishAt = timestamp;
}
function isNearActiveJourneyStation(location: Coordinates): boolean {
    const { status, currentStation, nextStation } = useTripStore.getState();
    if (status !== 'TRANSIT' && status !== 'WAITING') return false;

    return [currentStation, nextStation]
        .filter((station): station is Station => !!station)
        .some((station) => getDistanceKm(location, station) <= ACTIVE_STATION_SPEED_RADIUS_KM);
}

function resolveSpeedKph(pos: GeolocationPosition, location: Coordinates, timestamp: number) {
    const accuracy = pos.coords.accuracy ?? 999;
    const deltaSeconds = lastPositionSample
        ? (timestamp - lastPositionSample.timestamp) / 1000
        : null;
    const displacementMeters = lastPositionSample
        ? getDistanceKm(lastPositionSample.location, location) * 1000
        : null;
    const nearStation = isNearActiveJourneyStation(location);
    const measurement = measureGpsSpeed({
        nativeSpeedMetersPerSecond: pos.coords.speed,
        displacementMeters,
        deltaSeconds,
        accuracyMeters: accuracy,
        previousAccuracyMeters: lastPositionSample?.accuracyMeters ?? null,
        nearStation,
    });

    lowMotionSampleCount = measurement.isLowMotion
        ? lowMotionSampleCount + 1
        : 0;

    return smoothGpsSpeed({
        previousSpeedKph: sharedLocationState.speed,
        measurement,
        nearStation,
        lowMotionSampleCount,
    });
}

function handlePositionError(err: GeolocationPositionError) {
    const permissionState: Partial<SharedLocationState> =
        err.code === err.PERMISSION_DENIED ? { permissionState: 'denied' } : {};

    console.warn('[SmartLocation] GPS error:', err);
    publishLocationState({
        ...permissionState,
        gpsError: locationErrorMessage(err),
        gpsErrorCode: locationErrorCode(err),
        isRequestingLocation: false,
        isSecureContext: getSecureContextState(),
    });
}

function probePermission() {
    if (permissionProbeStarted || typeof navigator === 'undefined') return;
    permissionProbeStarted = true;

    if (!navigator.permissions?.query) {
        publishLocationState({ permissionState: 'unknown' });
        return;
    }

    navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then(result => {
            publishLocationState({ permissionState: result.state });
            result.onchange = () => publishLocationState({ permissionState: result.state });
        })
        .catch(() => publishLocationState({ permissionState: 'unknown' }));
}

function needsActiveGpsWatch(): boolean {
    const state = useTripStore.getState();
    return !state.isGpsOverride && (state.status === 'WAITING' || state.status === 'TRANSIT');
}

function stopGeoWatch() {
    if (typeof navigator !== 'undefined' && watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
    }
    watchId = null;
    if (watchdogId !== null && typeof window !== 'undefined') {
        window.clearInterval(watchdogId);
        watchdogId = null;
    }
}

function scheduleIdleLocation() {
    if (typeof window === 'undefined') return;
    if (idleRefreshId !== null) window.clearTimeout(idleRefreshId);
    idleRefreshId = window.setTimeout(() => {
        idleRefreshId = null;
        if (!document.hidden) requestIdleLocation(true);
        else scheduleIdleLocation();
    }, IDLE_LOCATION_REFRESH_MS);
}

function requestIdleLocation(force = false) {
    if (typeof navigator === 'undefined' || !navigator.geolocation || useTripStore.getState().isGpsOverride) return;
    const ageMs = Date.now() - sharedLocationState.gpsTimestamp;
    if (!force && sharedLocationState.location && ageMs < IDLE_GEO_OPTIONS.maximumAge!) {
        scheduleIdleLocation();
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            handlePosition(position);
            scheduleIdleLocation();
        },
        (error) => {
            handlePositionError(error);
            scheduleIdleLocation();
        },
        IDLE_GEO_OPTIONS,
    );
}

function syncLocationRuntime(forceIdle = false) {
    if (needsActiveGpsWatch()) {
        if (idleRefreshId !== null && typeof window !== 'undefined') {
            window.clearTimeout(idleRefreshId);
            idleRefreshId = null;
        }
        startGeoWatch();
        return;
    }

    stopGeoWatch();
    requestIdleLocation(forceIdle);
}

function initializeLocationRuntime() {
    if (locationRuntimeStarted || typeof window === 'undefined') return;
    locationRuntimeStarted = true;
    probePermission();
    startVisibilityRecovery();
    if (!tripModeSubscriptionStarted) {
        tripModeSubscriptionStarted = true;
        useTripStore.subscribe((state, previous) => {
            if (state.status !== previous.status || state.isGpsOverride !== previous.isGpsOverride) {
                syncLocationRuntime(true);
            }
        });
    }
    syncLocationRuntime();
}

function startWatchdog() {
    if (watchdogId || typeof window === 'undefined') return;

    watchdogId = window.setInterval(() => {
        const { gpsTimestamp } = sharedLocationState;
        if (!gpsTimestamp || useTripStore.getState().isGpsOverride) return;

        const now = Date.now();
        const gpsAgeMs = now - gpsTimestamp;
        if (gpsAgeMs > 15000 && now - lastWatchRestartAt >= 15000) {
            console.warn('[SmartLocation] GPS watchdog restarting geolocation watcher');
            if (gpsAgeMs > LOCATION_STALE_MS) {
                publishLocationState({
                    gpsError: 'GPS signal went stale. Keep this screen open, move near a window, or retry location.',
                    gpsErrorCode: 'stale',
                    isRequestingLocation: false,
                });
            }
            lastWatchRestartAt = now;
            restartGeoWatch();
        }
    }, 5000);
}

function startVisibilityRecovery() {
    if (visibilityRecoveryStarted || typeof document === 'undefined') return;
    visibilityRecoveryStarted = true;

    document.addEventListener('visibilitychange', () => {
        if (document.hidden || useTripStore.getState().isGpsOverride) return;
        const gpsAgeMs = Date.now() - sharedLocationState.gpsTimestamp;
        if (!sharedLocationState.gpsTimestamp || gpsAgeMs > 5000) {
            restartGeoWatch();
            void requestSharedLocation();
        }
    });
}
function startGeoWatch() {
    if (typeof navigator === 'undefined') return;

    const isSecureContext = getSecureContextState();
    publishLocationState({ isSecureContext });

    if (!navigator.geolocation) {
        publishLocationState({
            gpsError: 'Geolocation is not supported by this browser.',
            gpsErrorCode: 'unsupported',
            permissionState: 'unsupported',
            isRequestingLocation: false,
        });
        return;
    }

    if (!isSecureContext) {
        publishLocationState({
            gpsError: SECURE_CONTEXT_MESSAGE,
            gpsErrorCode: 'insecure_context',
            isRequestingLocation: false,
        });
        return;
    }

    if (watchId !== null) return;

    publishLocationState({ isRequestingLocation: !sharedLocationState.location });
    watchId = navigator.geolocation.watchPosition(
        handlePosition,
        handlePositionError,
        ACTIVE_GEO_OPTIONS,
    );
    startWatchdog();
    startVisibilityRecovery();
}

function restartGeoWatch() {
    stopGeoWatch();
    syncLocationRuntime(true);
}

function requestSharedLocation() {
    if (typeof navigator === 'undefined') {
        return Promise.resolve(false);
    }

    const isSecureContext = getSecureContextState();
    publishLocationState({ isSecureContext });

    if (!navigator.geolocation) {
        publishLocationState({
            gpsError: 'Geolocation is not supported by this browser.',
            gpsErrorCode: 'unsupported',
            permissionState: 'unsupported',
            isRequestingLocation: false,
        });
        return Promise.resolve(false);
    }

    if (!isSecureContext) {
        publishLocationState({
            gpsError: SECURE_CONTEXT_MESSAGE,
            gpsErrorCode: 'insecure_context',
            isRequestingLocation: false,
        });
        return Promise.resolve(false);
    }

    publishLocationState({ isRequestingLocation: true, gpsError: null, gpsErrorCode: null });

    return new Promise<boolean>(resolve => {
        navigator.geolocation.getCurrentPosition(
            pos => {
                handlePosition(pos);
                syncLocationRuntime();
                resolve(true);
            },
            err => {
                handlePositionError(err);
                syncLocationRuntime();
                resolve(false);
            },
            { ...ACTIVE_GEO_OPTIONS, maximumAge: 0 },
        );
    });
}

export function useSmartLocation() {
    const isGpsOverride = useTripStore((state) => state.isGpsOverride);
    const simulatedLocation = useTripStore((state) => state.simulatedLocation);
    const simulatedHeading = useTripStore((state) => state.simulatedHeading);
    const simulatedSpeed = useTripStore((state) => state.simulatedSpeed);
    const isFallbackLocationActive = useTripStore((state) => state.isFallbackLocationActive);
    const fallbackLocation = useTripStore((state) => state.fallbackLocation);
    const fallbackHeading = useTripStore((state) => state.fallbackHeading);
    const fallbackSpeed = useTripStore((state) => state.fallbackSpeed);
    const currentStation = useTripStore((state) => state.currentStation);
    const setLocationRuntime = useLocationStore((state) => state.setLocationRuntime);

    const [snapshot, setSnapshot] = useState(() => sharedLocationState);

    useEffect(() => subscribeLocation(() => setSnapshot(sharedLocationState)), []);

    useEffect(() => {
        initializeLocationRuntime();
    }, []);

    const requestLocation = useCallback(() => requestSharedLocation(), []);
    const refreshLocation = useCallback(() => {
        restartGeoWatch();
        return requestSharedLocation();
    }, []);

    const rawLocationState: RawLocationState = useMemo(() => ({
        location: snapshot.location,
        rawHeading: snapshot.rawHeading,
        speedKph: snapshot.speed,
        accuracyMeters: snapshot.gpsAccuracy,
        timestamp: snapshot.gpsTimestamp || null,
        permissionState: snapshot.permissionState,
        isSecureContext: snapshot.isSecureContext,
        isRequestingLocation: snapshot.isRequestingLocation,
        errorMessage: snapshot.gpsError,
        errorCode: snapshot.gpsErrorCode,
    }), [snapshot]);

    const locationOverride = useMemo<LocationOverrideState | null>(() => {
        if (isGpsOverride && simulatedLocation) {
            return {
                active: true,
                source: 'simulation',
                location: simulatedLocation,
                rawHeading: simulatedHeading,
                speedKph: simulatedSpeed,
                accuracyMeters: 5,
            };
        }

        if (isFallbackLocationActive && fallbackLocation) {
            return {
                active: true,
                source: 'fallback',
                location: fallbackLocation,
                rawHeading: fallbackHeading,
                speedKph: fallbackSpeed,
                accuracyMeters: 25,
            };
        }

        return null;
    }, [
        fallbackHeading,
        fallbackLocation,
        fallbackSpeed,
        isFallbackLocationActive,
        isGpsOverride,
        simulatedHeading,
        simulatedLocation,
        simulatedSpeed,
    ]);

    const locationStatus = useMemo(
        () => diagnoseLocationStatus(rawLocationState, locationOverride),
        [rawLocationState, locationOverride],
    );
    const locationSample: LocationSample = useMemo(
        () => buildLocationSample(rawLocationState, locationOverride),
        [rawLocationState, locationOverride],
    );

    useEffect(() => {
        setLocationRuntime(locationSample, locationStatus);
    }, [locationSample, locationStatus, setLocationRuntime]);

    const effectiveLocation = locationSample.location;
    const effectiveRawHeading = locationSample.rawHeading;
    const effectiveSpeed = locationSample.speedKph;

    const bridge = useMemo(() => {
        if (!effectiveLocation) {
            return { status: 'MOVING' as const, bridgeName: null as string | null };
        }

        const inBridge = BRIDGE_ZONES.find(zone =>
            getDistanceKm(effectiveLocation, zone.center) <= zone.radiusKm
        );

        return {
            status: inBridge ? 'BRIDGE' as const : 'MOVING' as const,
            bridgeName: inBridge?.name ?? null,
        };
    }, [effectiveLocation]);

    return {
        location: effectiveLocation,
        locationSample,
        locationStatus,
        heading: effectiveRawHeading !== null
            ? getBucketedHeading(effectiveRawHeading, currentStation?.lineId)
            : 'UNKNOWN',
        rawHeading: effectiveRawHeading,
        speed: effectiveSpeed,
        gpsError: snapshot.gpsError,
        gpsErrorCode: snapshot.gpsErrorCode,
        gpsAccuracy: locationSample.accuracyMeters ?? snapshot.gpsAccuracy,
        gpsTimestamp: locationSample.timestamp ?? snapshot.gpsTimestamp,
        rawGpsLocation: snapshot.location,
        rawGpsSpeed: snapshot.speed,
        rawGpsAccuracy: snapshot.gpsAccuracy,
        rawGpsTimestamp: snapshot.gpsTimestamp || null,
        isOverride: isGpsOverride,
        status: bridge.status,
        bridgeName: bridge.bridgeName,
        permissionState: snapshot.permissionState,
        isRequestingLocation: snapshot.isRequestingLocation,
        isSecureContext: snapshot.isSecureContext,
        requestLocation,
        refreshLocation,
    };
}
