import { API_CONFIG_DEFAULTS, validateApiConfig, type ApiConfig } from './index';

const paths = {
    defaultLimit: ['prediction', 'defaultLimit'], validWindowS: ['prediction', 'validWindowS'],
    stationLookaheadMin: ['prediction', 'stationLookaheadMin'], corsOrigin: ['', 'corsOrigin'],
    crowdIntervalMs: ['crowd', 'intervalMs'], crowdMinSpeedKph: ['crowd', 'minSpeedKph'], crowdRequiredSamples: ['crowd', 'requiredSamples'],
    stallSampleIntervalMs: ['stall', 'sampleIntervalMs'], stallThresholdKm: ['stall', 'thresholdKm'],
    stallWindowSamples: ['stall', 'windowSamples'], stallActivationDistKm: ['stall', 'activationDistKm'],
    stallDeviceCooldownMs: ['stall', 'deviceCooldownMs'], stallMaxStationDistKm: ['stall', 'maxStationDistKm'],
    stallMaxReportsPerHour: ['stall', 'maxReportsPerHour'], stallMinDurationMin: ['stall', 'minDurationMin'],
} as const;

export function configToConsoleValues(config: Readonly<ApiConfig> = API_CONFIG_DEFAULTS): Record<keyof typeof paths, string> {
    return Object.fromEntries(Object.entries(paths).map(([key, [group, field]]) => [key,
        String(group ? (config[group as 'prediction' | 'crowd' | 'stall'] as unknown as Record<string, number>)[field] : config.corsOrigin),
    ])) as Record<keyof typeof paths, string>;
}

export function configFromConsoleValues(values: Record<string, string>, base: ApiConfig) {
    const config = structuredClone(base);
    for (const [key, value] of Object.entries(values)) {
        const path = paths[key as keyof typeof paths];
        if (!path) return { ok: false as const, error: `Unknown setting: ${key}.` };
        const [group, field] = path;
        if (!group) config.corsOrigin = value.trim();
        else (config[group] as unknown as Record<string, number>)[field] = value.trim() ? Number(value) : NaN;
    }
    return validateApiConfig(config);
}
