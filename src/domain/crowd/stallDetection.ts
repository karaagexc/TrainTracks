import type { StallEvidenceSample } from '@/domain/alerts/stall';

export interface StallDetectionConfig {
    sampleIntervalMs: number;
    thresholdKm: number;
    windowSamples: number;
    activationDistKm: number;
}

export function isReliableStallWindow(samples: StallEvidenceSample[], config: StallDetectionConfig): boolean {
    if (samples.length < config.windowSamples) return false;
    const ordered = samples.slice(-config.windowSamples);
    const minimumDurationMs = (config.windowSamples - 1) * config.sampleIntervalMs;
    if (ordered[ordered.length - 1].timestamp - ordered[0].timestamp < minimumDurationMs) return false;
    if (ordered.some((sample, index) => !Number.isFinite(sample.timestamp)
        || !Number.isFinite(sample.routeDistanceMeters) || !Number.isFinite(sample.speedKph)
        || (index > 0 && (sample.timestamp <= ordered[index - 1].timestamp
            || sample.timestamp - ordered[index - 1].timestamp > config.sampleIntervalMs * 2)))) return false;
    const movementMeters = Math.max(...ordered.map((sample) => sample.routeDistanceMeters))
        - Math.min(...ordered.map((sample) => sample.routeDistanceMeters));
    return ordered[0].routeDistanceMeters >= config.activationDistKm * 1000
        && movementMeters < config.thresholdKm * 1000
        && ordered.reduce((sum, sample) => sum + sample.speedKph, 0) / ordered.length < 3;
}
