export type RailLineId = 'LRT1' | 'LRT2' | 'MRT3' | 'MRT7';
export type BuiltRailLineId = Exclude<RailLineId, 'MRT7'>;
export type LineId = RailLineId | 'EDSA';
export type BuiltLineId = BuiltRailLineId;
export type TransitMode = 'train' | 'bus';
export type LineKind = 'rail' | 'bus';
export type OperationalMode = 'live' | 'sandbox';
export type Line7Mode = 'OFF' | 'WITH_NA' | 'WITHOUT_NA';
export type Direction = 'NORTHBOUND' | 'SOUTHBOUND' | 'EASTBOUND' | 'WESTBOUND';
export type LegacyDirection = 'NORTH' | 'SOUTH';
export type CrowdPresenceConsent = 'unknown' | 'granted' | 'denied';
export type TicketType = 'SJT' | 'SVC' | 'CONCESSION' | 'DEBIT' | 'CREDIT' | 'BUS_REGULAR';
export type StopType = 'median' | 'curbside' | 'terminal' | 'concourse';
export type DirectionAvailability = 'both' | 'northbound_only' | 'southbound_only';
export type CoordinateConfidence = 'verified' | 'approximate';
export type LocationStatusCode =
    | 'checking'
    | 'needs_permission'
    | 'denied'
    | 'insecure_context'
    | 'timeout'
    | 'unavailable'
    | 'low_accuracy'
    | 'stale'
    | 'ready';

export interface Station {
    id: string;
    name: string;
    lineId: LineId;
    order: number;
    latitude: number;
    longitude: number;
    transfers?: LineId[];
    isUnderground?: boolean;
    stopType?: StopType;
    directionAvailability?: DirectionAvailability;
    coordinateConfidence?: CoordinateConfidence;
    landmarkAliases?: string[];
    sourceRefs?: string[];
}

export interface Coordinates {
    latitude: number;
    longitude: number;
}

export interface LocationSample {
    location: Coordinates | null;
    rawHeading: number | null;
    speedKph: number | null;
    accuracyMeters: number | null;
    timestamp: number | null;
    source: 'gps' | 'simulation' | 'fallback';
}

export interface LocationStatus {
    code: LocationStatusCode;
    title: string;
    message: string;
    permissionState: PermissionState | 'unsupported' | 'unknown';
    isSecureContext: boolean;
    isBlocking: boolean;
    isUsable: boolean;
    canRequest: boolean;
    accuracyMeters: number | null;
    ageMs: number | null;
}
