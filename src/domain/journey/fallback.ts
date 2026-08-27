import type { Coordinates, Station } from '@/types';
import { JOURNEY_CONSTANTS } from './constants';
import { getDistanceKm, getBearing, moveTowards } from '@/utils/geo';

export interface FallbackEvidenceInput {
    now: number;
    gpsTimestamp: number | null;
    gpsAccuracy: number | null;
    lastKnownSpeedKph: number;
    lastGoodAccuracyMeters: number;
    lastGpsLocation: Coordinates | null;
    currentStation: Station | null;
    fallbackCandidateSince: number | null;
}

export interface FallbackDecision {
    shouldStart: boolean;
    nextCandidateSince: number | null;
    reason:
        | 'active'
        | 'gps_fresh'
        | 'weak_evidence'
        | 'missing_location'
        | 'stationary_at_station'
        | 'dwell_pending'
        | 'start';
}

export function decideFallbackStart(input: FallbackEvidenceInput): FallbackDecision {
    const gpsAge = input.now - (input.gpsTimestamp ?? 0);
    const hasStableEvidence =
        gpsAge >= JOURNEY_CONSTANTS.fallbackGpsSilenceMs &&
        input.lastKnownSpeedKph >= JOURNEY_CONSTANTS.fallbackMinPriorSpeedKph &&
        !!input.lastGpsLocation &&
        input.lastGoodAccuracyMeters < JOURNEY_CONSTANTS.fallbackMaxPriorAccuracyMeters;

    if (gpsAge < JOURNEY_CONSTANTS.fallbackGpsSilenceMs) {
        return { shouldStart: false, nextCandidateSince: null, reason: 'gps_fresh' };
    }

    if (!hasStableEvidence) {
        return { shouldStart: false, nextCandidateSince: null, reason: 'weak_evidence' };
    }

    if (!input.lastGpsLocation) {
        return { shouldStart: false, nextCandidateSince: null, reason: 'missing_location' };
    }

    if (input.currentStation) {
        const distanceToCurrent = getDistanceKm(input.lastGpsLocation, input.currentStation);
        if (
            distanceToCurrent < JOURNEY_CONSTANTS.stationZoneKm &&
            input.lastKnownSpeedKph < JOURNEY_CONSTANTS.dwellMinSpeedKph
        ) {
            return { shouldStart: false, nextCandidateSince: null, reason: 'stationary_at_station' };
        }
    }

    if (!input.fallbackCandidateSince) {
        return { shouldStart: false, nextCandidateSince: input.now, reason: 'dwell_pending' };
    }

    if (input.now - input.fallbackCandidateSince < JOURNEY_CONSTANTS.fallbackDwellMs) {
        return { shouldStart: false, nextCandidateSince: input.fallbackCandidateSince, reason: 'dwell_pending' };
    }

    return { shouldStart: true, nextCandidateSince: null, reason: 'start' };
}

export interface FallbackStepInput {
    currentLocation: Coordinates;
    targetStation: Station;
    currentSpeedKph: number;
    fallbackSpeedFloorKph?: number;
    deltaSec: number;
}

export interface FallbackStep {
    location: Coordinates;
    speedKph: number;
    heading: number | null;
    arrivedAtTarget: boolean;
}

export function stepFallbackLocation({
    currentLocation,
    targetStation,
    currentSpeedKph,
    fallbackSpeedFloorKph = 10,
    deltaSec,
}: FallbackStepInput): FallbackStep {
    const distanceToTargetKm = getDistanceKm(currentLocation, targetStation);
    if (distanceToTargetKm < JOURNEY_CONSTANTS.captureRadiusKm) {
        return {
            location: { latitude: targetStation.latitude, longitude: targetStation.longitude },
            speedKph: 0,
            heading: null,
            arrivedAtTarget: true,
        };
    }

    if (currentSpeedKph <= 0) {
        return {
            location: currentLocation,
            speedKph: 0,
            heading: getBearing(currentLocation, targetStation),
            arrivedAtTarget: false,
        };
    }

    let effectiveSpeedKph = currentSpeedKph;
    if (distanceToTargetKm < 0.5) {
        const decelerationFactor =
            (distanceToTargetKm - JOURNEY_CONSTANTS.captureRadiusKm) /
            (0.5 - JOURNEY_CONSTANTS.captureRadiusKm);
        effectiveSpeedKph = Math.max(fallbackSpeedFloorKph, currentSpeedKph * Math.max(0.1, decelerationFactor));
    }

    const targetCoordinates = {
        latitude: targetStation.latitude,
        longitude: targetStation.longitude,
    };
    const distanceStepKm = effectiveSpeedKph * (deltaSec / 3600);
    const location = moveTowards(currentLocation, targetCoordinates, distanceStepKm);

    return {
        location,
        speedKph: effectiveSpeedKph,
        heading: getBearing(currentLocation, targetCoordinates),
        arrivedAtTarget: false,
    };
}
