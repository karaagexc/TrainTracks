import type { Coordinates, LocationSample, LocationStatus, LocationStatusCode, OperationalMode, Line7Mode, Station } from '@/types';

export type LocationSource = LocationSample['source'];

export type LocationDiagnosisCode = LocationStatusCode;

export type {
    Coordinates,
    LocationSample,
    LocationStatus,
    LocationStatusCode,
    OperationalMode,
    Line7Mode,
    Station,
};

export interface RawLocationState {
    location: Coordinates | null;
    rawHeading: number | null;
    speedKph: number | null;
    accuracyMeters: number | null;
    timestamp: number | null;
    permissionState: PermissionState | 'unsupported' | 'unknown';
    isSecureContext: boolean;
    isRequestingLocation: boolean;
    errorMessage: string | null;
    errorCode:
        | 'permission_denied'
        | 'position_unavailable'
        | 'timeout'
        | 'unsupported'
        | 'insecure_context'
        | 'stale'
        | null;
}

export interface LocationOverrideState {
    active: boolean;
    source: Extract<LocationSource, 'simulation' | 'fallback'>;
    location: Coordinates | null;
    rawHeading: number | null;
    speedKph: number | null;
    accuracyMeters?: number | null;
    timestamp?: number | null;
}

export interface StationProximity {
    station: Station;
    distance: number;
}

export interface StationProximityResult {
    nearest: StationProximity | null;
    closest: StationProximity | null;
    conflicts: StationProximity[];
    nearby: StationProximity[];
    isWithinRadius: boolean;
    radiusKm: number;
    confidence: 'high' | 'medium' | 'low';
    ambiguityReason: 'gps_overlap' | 'multi_line' | null;
}
