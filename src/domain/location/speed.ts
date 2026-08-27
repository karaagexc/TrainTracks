export const GPS_SPEED_CONFIG = {
    maxSpeedKph: 90,
    maxEstimatedSpeedKph: 120,
    minEstimateIntervalSeconds: 0.75,
    maxEstimateIntervalSeconds: 60,
    maxEstimateAccuracyMeters: 65,
    maxLowMotionAccuracyMeters: 70,
    immediateStopSpeedKph: 2.5,
    lowMotionSamplesToStop: 2,
} as const;

export type GpsSpeedSource = 'native' | 'displacement' | 'unavailable';

export interface GpsSpeedMeasurement {
    speedKph: number | null;
    source: GpsSpeedSource;
    isLowMotion: boolean;
}

interface MeasureGpsSpeedInput {
    nativeSpeedMetersPerSecond: number | null | undefined;
    displacementMeters: number | null;
    deltaSeconds: number | null;
    accuracyMeters: number | null;
    previousAccuracyMeters: number | null;
    nearStation: boolean;
}

interface SmoothGpsSpeedInput {
    previousSpeedKph: number | null;
    measurement: GpsSpeedMeasurement;
    nearStation: boolean;
    lowMotionSampleCount: number;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function isFiniteNonNegative(value: number | null | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function measureGpsSpeed({
    nativeSpeedMetersPerSecond,
    displacementMeters,
    deltaSeconds,
    accuracyMeters,
    previousAccuracyMeters,
    nearStation,
}: MeasureGpsSpeedInput): GpsSpeedMeasurement {
    const canEstimateFromDisplacement =
        isFiniteNonNegative(displacementMeters) &&
        isFiniteNonNegative(deltaSeconds) &&
        deltaSeconds >= GPS_SPEED_CONFIG.minEstimateIntervalSeconds &&
        deltaSeconds <= GPS_SPEED_CONFIG.maxEstimateIntervalSeconds;
    const motionAccuracy = Math.max(
        accuracyMeters ?? Number.POSITIVE_INFINITY,
        previousAccuracyMeters ?? Number.POSITIVE_INFINITY,
    );
    const noiseFloorMeters = clamp(motionAccuracy * 0.4, 5, 18);
    const isLowMotion =
        nearStation &&
        canEstimateFromDisplacement &&
        motionAccuracy <= GPS_SPEED_CONFIG.maxLowMotionAccuracyMeters &&
        displacementMeters <= noiseFloorMeters;

    if (isFiniteNonNegative(nativeSpeedMetersPerSecond)) {
        return {
            speedKph: clamp(nativeSpeedMetersPerSecond * 3.6, 0, GPS_SPEED_CONFIG.maxSpeedKph),
            source: 'native',
            isLowMotion,
        };
    }

    if (
        canEstimateFromDisplacement &&
        motionAccuracy <= GPS_SPEED_CONFIG.maxEstimateAccuracyMeters
    ) {
        const estimatedSpeedKph = (displacementMeters / 1000) / (deltaSeconds / 3600);
        if (Number.isFinite(estimatedSpeedKph) && estimatedSpeedKph <= GPS_SPEED_CONFIG.maxEstimatedSpeedKph) {
            return {
                speedKph: clamp(estimatedSpeedKph, 0, GPS_SPEED_CONFIG.maxSpeedKph),
                source: 'displacement',
                isLowMotion,
            };
        }
    }

    return {
        speedKph: null,
        source: 'unavailable',
        isLowMotion: false,
    };
}

export function smoothGpsSpeed({
    previousSpeedKph,
    measurement,
    nearStation,
    lowMotionSampleCount,
}: SmoothGpsSpeedInput): number {
    const previous = clamp(previousSpeedKph ?? 0, 0, GPS_SPEED_CONFIG.maxSpeedKph);

    if (
        measurement.source === 'native' &&
        measurement.speedKph !== null &&
        measurement.speedKph <= GPS_SPEED_CONFIG.immediateStopSpeedKph
    ) {
        return 0;
    }

    if (
        nearStation &&
        measurement.isLowMotion &&
        lowMotionSampleCount >= GPS_SPEED_CONFIG.lowMotionSamplesToStop
    ) {
        return 0;
    }

    if (measurement.speedKph === null) {
        const decayed = previous * (nearStation ? 0.45 : 0.9);
        return decayed < 1 ? 0 : Math.round(decayed * 10) / 10;
    }

    const measured = clamp(measurement.speedKph, 0, GPS_SPEED_CONFIG.maxSpeedKph);
    if (previousSpeedKph === null) {
        return measured < 1 ? 0 : Math.round(measured * 10) / 10;
    }

    const measurementWeight = measured < previous
        ? nearStation ? 0.9 : 0.72
        : 0.55;
    const smoothed = previous * (1 - measurementWeight) + measured * measurementWeight;

    return smoothed < 1 ? 0 : Math.round(smoothed * 10) / 10;
}
