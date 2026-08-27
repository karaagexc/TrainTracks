import type { Coordinates, Station } from '@/types';
import { getDistanceKm } from '@/utils/geo';

export const STALL_CONFIG = {
    sampleIntervalMs: 15_000,
    thresholdKm: 0.12,
    windowDurationMs: 4 * 60_000,
    windowSamples: 17,
    activationDistKm: 0.2,
    rearmCooldownMs: 3 * 60_000,
    maxStationAccuracyMeters: 140,
} as const;

export function hasStallActivation(originLocation: Coordinates | null, currentLocation: Coordinates | null): boolean {
    if (!originLocation || !currentLocation) return false;
    return getDistanceKm(originLocation, currentLocation) >= STALL_CONFIG.activationDistKm;
}

export function shouldSkipStallAtStation(station: Station | null): boolean {
    return Boolean(station && 'isUnderground' in station && station.isUnderground);
}

export function getSampleWindowMovementKm(samples: Coordinates[]): number {
    if (samples.length < 2) return 0;
    return getDistanceKm(samples[0], samples[samples.length - 1]);
}

export function isStalledSampleWindow(samples: Coordinates[]): boolean {
    if (samples.length < STALL_CONFIG.windowSamples) return false;
    return getSampleWindowMovementKm(samples.slice(-STALL_CONFIG.windowSamples)) < STALL_CONFIG.thresholdKm;
}

export interface StallEvidenceSample {
    timestamp: number;
    routeDistanceMeters: number;
    speedKph: number;
}

export function isRouteStalledWindow(samples: StallEvidenceSample[]): boolean {
    if (samples.length < 2) return false;
    const ordered = samples.slice().sort((left, right) => left.timestamp - right.timestamp);
    const durationMs = ordered[ordered.length - 1].timestamp - ordered[0].timestamp;
    if (durationMs < STALL_CONFIG.windowDurationMs) return false;

    const routeMovementMeters = Math.abs(
        ordered[ordered.length - 1].routeDistanceMeters - ordered[0].routeDistanceMeters,
    );
    const averageSpeedKph = ordered.reduce((sum, sample) => sum + sample.speedKph, 0)
        / ordered.length;

    return routeMovementMeters < STALL_CONFIG.thresholdKm * 1000
        && averageSpeedKph < 3;
}

export function trimStallEvidenceWindow(
    samples: StallEvidenceSample[],
    now: number,
): StallEvidenceSample[] {
    const cutoff = now - STALL_CONFIG.windowDurationMs - STALL_CONFIG.sampleIntervalMs * 2;

    return samples.filter((sample) => sample.timestamp >= cutoff);
}
