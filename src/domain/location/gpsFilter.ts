import type { Coordinates } from '@/types';
import { getBearing, getDistanceKm } from '@/utils/geo';

export const GPS_POSITION_CONFIG = {
    maxUsefulAccuracyMeters: 250,
    preserveBetterFixMs: 12_000,
    outlierWindowMs: 20_000,
    maxPlausibleSpeedMps: 45,
    stationaryFloorMeters: 4,
    stationaryCeilingMeters: 28,
    headingMinDisplacementMeters: 8,
} as const;

export interface GpsPositionFix {
    location: Coordinates;
    timestamp: number;
    accuracyMeters: number;
}

export type GpsPositionRejection = 'invalid' | 'stale' | 'inferior_accuracy' | 'outlier';

export interface GpsPositionDecision {
    accepted: boolean;
    fix: GpsPositionFix;
    inferredHeading: number | null;
    rejection: GpsPositionRejection | null;
}

function isValidFix(fix: GpsPositionFix): boolean {
    return Number.isFinite(fix.location.latitude)
        && Number.isFinite(fix.location.longitude)
        && Math.abs(fix.location.latitude) <= 90
        && Math.abs(fix.location.longitude) <= 180
        && Number.isFinite(fix.timestamp)
        && Number.isFinite(fix.accuracyMeters)
        && fix.accuracyMeters >= 0;
}

function reject(fix: GpsPositionFix, rejection: GpsPositionRejection): GpsPositionDecision {
    return { accepted: false, fix, inferredHeading: null, rejection };
}

export function filterGpsPosition(previous: GpsPositionFix | null, candidate: GpsPositionFix): GpsPositionDecision {
    if (!isValidFix(candidate)) return reject(candidate, 'invalid');
    if (!previous) return { accepted: true, fix: candidate, inferredHeading: null, rejection: null };
    if (candidate.timestamp <= previous.timestamp) return reject(candidate, 'stale');

    const deltaMs = candidate.timestamp - previous.timestamp;
    const displacementMeters = getDistanceKm(previous.location, candidate.location) * 1000;
    const previousIsFresh = deltaMs <= GPS_POSITION_CONFIG.preserveBetterFixMs;

    if (
        previousIsFresh
        && candidate.accuracyMeters > GPS_POSITION_CONFIG.maxUsefulAccuracyMeters
        && previous.accuracyMeters <= GPS_POSITION_CONFIG.maxUsefulAccuracyMeters / 2
    ) {
        return reject(candidate, 'inferior_accuracy');
    }

    const accuracyEnvelope = Math.max(25, previous.accuracyMeters + candidate.accuracyMeters);
    const plausibleTravelMeters = GPS_POSITION_CONFIG.maxPlausibleSpeedMps * (deltaMs / 1000) + accuracyEnvelope;
    if (
        deltaMs <= GPS_POSITION_CONFIG.outlierWindowMs
        && displacementMeters > plausibleTravelMeters
        && candidate.accuracyMeters >= previous.accuracyMeters * 0.75
    ) {
        return reject(candidate, 'outlier');
    }

    const stationaryRadiusMeters = Math.max(
        GPS_POSITION_CONFIG.stationaryFloorMeters,
        Math.min(
            GPS_POSITION_CONFIG.stationaryCeilingMeters,
            Math.min(previous.accuracyMeters, candidate.accuracyMeters) * 0.55,
        ),
    );
    const keepPreviousCoordinates = displacementMeters <= stationaryRadiusMeters
        && previous.accuracyMeters <= candidate.accuracyMeters;
    const fix = keepPreviousCoordinates
        ? { ...candidate, location: previous.location, accuracyMeters: previous.accuracyMeters }
        : candidate;
    const inferredHeading = displacementMeters >= Math.max(
        GPS_POSITION_CONFIG.headingMinDisplacementMeters,
        Math.min(previous.accuracyMeters, candidate.accuracyMeters) * 0.45,
    )
        ? getBearing(previous.location, candidate.location)
        : null;

    return { accepted: true, fix, inferredHeading, rejection: null };
}
