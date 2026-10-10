import type { Coordinates, LocationSample, Station } from '@/types';
import { getBearing, getDistanceKm } from '@/utils/geo';

export const WRONG_DIRECTION_CONFIG = {
    minSpeedKph: 20,
    maxGpsAccuracyMeters: 35,
    minAngleDeg: 135,
    persistenceCount: 10,
    minDistanceFromStationKm: 0.35,
    targetOvershootKm: 0.25,
    snoozeMs: 300_000,
} as const;

export function isWrongDirectionSampleEligible(sample: LocationSample, now = Date.now()): boolean {
    return sample.source === 'gps' && sample.location !== null
        && Number.isFinite(sample.location.latitude) && Number.isFinite(sample.location.longitude)
        && sample.timestamp !== null && Number.isFinite(sample.timestamp)
        && Math.abs(now - sample.timestamp) <= 5000
        && sample.rawHeading !== null && Number.isFinite(sample.rawHeading)
        && sample.speedKph !== null && Number.isFinite(sample.speedKph)
        && sample.speedKph >= WRONG_DIRECTION_CONFIG.minSpeedKph && sample.speedKph <= 180
        && sample.accuracyMeters !== null && sample.accuracyMeters >= 0
        && sample.accuracyMeters <= WRONG_DIRECTION_CONFIG.maxGpsAccuracyMeters;
}

export function angleDifference(left: number, right: number): number {
    const diff = Math.abs(left - right);
    return diff > 180 ? 360 - diff : diff;
}

export interface WrongDirectionEvidence {
    isOpposite: boolean;
    angleDifferenceDeg: number;
    expectedBearingDeg: number;
    reason: 'near_source' | 'near_target' | 'opposite' | 'aligned';
}

export function evaluateWrongDirectionEvidence(
    location: Coordinates,
    headingDeg: number,
    fromStation: Station,
    toStation: Station,
): WrongDirectionEvidence {
    const distFromFrom = getDistanceKm(location, fromStation);
    const distToTarget = getDistanceKm(location, toStation);

    if (distFromFrom < WRONG_DIRECTION_CONFIG.minDistanceFromStationKm) {
        return {
            isOpposite: false,
            angleDifferenceDeg: 0,
            expectedBearingDeg: getBearing(location, toStation),
            reason: 'near_source',
        };
    }

    if (distToTarget < WRONG_DIRECTION_CONFIG.targetOvershootKm) {
        return {
            isOpposite: false,
            angleDifferenceDeg: 0,
            expectedBearingDeg: getBearing(location, toStation),
            reason: 'near_target',
        };
    }

    const expectedBearingDeg = getBearing(location, toStation);
    const angleDifferenceDeg = angleDifference(headingDeg, expectedBearingDeg);
    const isOpposite = angleDifferenceDeg >= WRONG_DIRECTION_CONFIG.minAngleDeg;

    return {
        isOpposite,
        angleDifferenceDeg,
        expectedBearingDeg,
        reason: isOpposite ? 'opposite' : 'aligned',
    };
}
