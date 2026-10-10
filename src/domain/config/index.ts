import type { SupabaseClient } from '@supabase/supabase-js';
import type { CongestionConfig } from '@/domain/congestion/engine';
import { STATIONS } from '@/data/stations';

export interface ApiConfig {
    version: 1;
    prediction: { defaultLimit: number; validWindowS: number; stationLookaheadMin: number };
    corsOrigin: string;
    crowd: { intervalMs: number; minSpeedKph: number; requiredSamples: number };
    stall: {
        sampleIntervalMs: number; thresholdKm: number; windowSamples: number; activationDistKm: number;
        deviceCooldownMs: number; maxStationDistKm: number; maxReportsPerHour: number; minDurationMin: number;
    };
}

export const API_CONFIG_DEFAULTS: Readonly<ApiConfig> = {
    version: 1,
    prediction: { defaultLimit: 3, validWindowS: 25, stationLookaheadMin: 45 },
    corsOrigin: '*',
    crowd: { intervalMs: 3000, minSpeedKph: 5, requiredSamples: 2 },
    stall: {
        sampleIntervalMs: 30000, thresholdKm: 0.1, windowSamples: 14, activationDistKm: 0.2,
        deviceCooldownMs: 300000, maxStationDistKm: 1.5, maxReportsPerHour: 6, minDurationMin: 3,
    },
};

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };
export function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isExplicitOrigin(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    try {
        const url = new URL(value);
        return (url.protocol === 'https:' || url.protocol === 'http:')
            && !url.username && !url.password && !url.hostname.includes('*') && url.origin === value;
    } catch { return false; }
}

const bounds = {
    prediction: { defaultLimit: [1, 20], validWindowS: [5, 120], stationLookaheadMin: [5, 120] },
    crowd: { intervalMs: [3000, 30000], minSpeedKph: [5, 50], requiredSamples: [2, 10] },
    stall: {
        sampleIntervalMs: [10000, 120000], thresholdKm: [0.01, 1], windowSamples: [5, 30],
        activationDistKm: [0.05, 1], deviceCooldownMs: [300000, 900000], maxStationDistKm: [0.5, 1.5],
        maxReportsPerHour: [1, 6], minDurationMin: [3, 15],
    },
} as const;
const fractional = new Set(['minSpeedKph', 'thresholdKm', 'activationDistKm', 'maxStationDistKm', 'minDurationMin']);

export function validateApiConfig(value: unknown): ValidationResult<ApiConfig> {
    if (!isRecord(value) || value.version !== 1
        || Object.keys(value).some(key => !['version', 'prediction', 'corsOrigin', 'crowd', 'stall'].includes(key))) {
        return { ok: false, error: 'Unsupported API configuration version or fields.' };
    }
    if (value.corsOrigin !== '*' && !isExplicitOrigin(value.corsOrigin)) {
        return { ok: false, error: 'corsOrigin must be * or an exact HTTP(S) origin without a path.' };
    }
    for (const group of ['prediction', 'crowd', 'stall'] as const) {
        const candidate = value[group];
        const rules = bounds[group];
        if (!isRecord(candidate) || Object.keys(candidate).some(key => !(key in rules))) {
            return { ok: false, error: `Invalid ${group} configuration fields.` };
        }
        for (const [key, [min, max]] of Object.entries(rules)) {
            const num = candidate[key];
            if (typeof num !== 'number' || !Number.isFinite(num) || num < min || num > max
                || (!fractional.has(key) && !Number.isInteger(num))) {
                return { ok: false, error: `${group}.${key} must be ${fractional.has(key) ? 'a number' : 'an integer'} between ${min} and ${max}.` };
            }
        }
    }
    return { ok: true, value: structuredClone(value) as unknown as ApiConfig };
}

export function validateCongestionConfig(value: unknown): ValidationResult<CongestionConfig> {
    const groups = ['calendar', 'stationWindows', 'lineWindows', 'advisories'];
    if (!isRecord(value) || Object.keys(value).some(key => !groups.includes(key) && key !== 'updatedAt')) {
        return { ok: false, error: 'Invalid congestion configuration.' };
    }
    if ('updatedAt' in value && (typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt)))) {
        return { ok: false, error: 'Invalid congestion updatedAt.' };
    }
    const modes = ['holiday', 'school_day', 'special_event', 'normal_weekday'];
    const sources = ['forecast', 'local_fallback', 'supabase', 'crowd', 'operator', 'simulated', 'predicted'];
    const fields = ['id', 'mode', 'date', 'startAt', 'endAt', 'stationIds', 'lineIds', 'multiplier', 'boost', 'dampen', 'scoreDelta', 'label', 'reason', 'tip', 'source'];
    for (const group of groups) {
        if (!(group in value)) continue;
        const entries = value[group];
        if (!Array.isArray(entries) || entries.length > 100) return { ok: false, error: `Invalid ${group} list.` };
        for (const entry of entries) {
            if (!isRecord(entry) || Object.keys(entry).some(key => !fields.includes(key))) return { ok: false, error: `Invalid ${group} entry.` };
            for (const [key, item] of Object.entries(entry)) {
                let valid = true;
                if (['multiplier', 'boost', 'dampen', 'scoreDelta'].includes(key)) {
                    const min = key === 'scoreDelta' ? -100 : 0;
                    const max = key === 'multiplier' ? 10 : 100;
                    valid = typeof item === 'number' && Number.isFinite(item) && item >= min && item <= max;
                } else if (key === 'stationIds') {
                    valid = Array.isArray(item) && item.length <= 100 && item.every(id => STATIONS.some(station => station.id === id));
                } else if (key === 'lineIds') {
                    valid = Array.isArray(item) && item.length <= 5 && item.every(id => ['LRT1', 'LRT2', 'MRT3', 'MRT7', 'EDSA'].includes(id));
                } else if (key === 'mode') valid = modes.includes(item as string);
                else if (key === 'source') valid = sources.includes(item as string);
                else if (key === 'date') {
                    const date = typeof item === 'string' && /^\d{2}-\d{2}$/.test(item) ? `2000-${item}` : item;
                    valid = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
                        && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
                }
                else if (key === 'startAt' || key === 'endAt') valid = typeof item === 'string' && Number.isFinite(Date.parse(item));
                else valid = typeof item === 'string' && item.length <= 240;
                if (!valid) return { ok: false, error: `Invalid congestion field: ${key}.` };
            }
            if (typeof entry.startAt === 'string' && typeof entry.endAt === 'string' && Date.parse(entry.startAt) >= Date.parse(entry.endAt)) {
                return { ok: false, error: 'Congestion endAt must follow startAt.' };
            }
        }
    }
    return { ok: true, value: structuredClone(value) as CongestionConfig };
}

export interface AppConfig {
    id: number; maintenance_mode: boolean; maintenance_message: string | null;
    congestion_config: CongestionConfig; api_config: ApiConfig; public_api_enabled: boolean; updated_at: string | null;
}
export type ConfigLoadResult = {
    status: 'ready' | 'degraded' | 'error'; config: AppConfig | null; error: string | null;
};
export const APP_CONFIG_COLUMNS = 'id,maintenance_mode,maintenance_message,congestion_config,api_config,public_api_enabled,updated_at';

export function parseAppConfig(data: unknown): ConfigLoadResult {
    if (!isRecord(data) || data.id !== 1 || typeof data.maintenance_mode !== 'boolean'
        || typeof data.public_api_enabled !== 'boolean'
        || (data.maintenance_message !== null && typeof data.maintenance_message !== 'string')) {
        return { status: 'error', config: null, error: 'Invalid app configuration row.' };
    }
    const api = validateApiConfig(data.api_config);
    const congestion = validateCongestionConfig(data.congestion_config);
    if (!api.ok || !congestion.ok) return { status: 'error', config: null, error: !api.ok ? api.error : !congestion.ok ? congestion.error : null };
    return {
        status: 'ready', error: null,
        config: { id: 1, maintenance_mode: data.maintenance_mode, maintenance_message: data.maintenance_message as string | null,
            public_api_enabled: data.public_api_enabled, api_config: api.value, congestion_config: congestion.value,
            updated_at: typeof data.updated_at === 'string' ? data.updated_at : null },
    };
}

export async function readAppConfig(client: Pick<SupabaseClient, 'from'>): Promise<ConfigLoadResult> {
    try {
        const result = await client.from('app_config').select(APP_CONFIG_COLUMNS).eq('id', 1).single();
        if (!result.error) return parseAppConfig(result.data);
        if (result.error.code !== '42703' && result.error.code !== 'PGRST204') {
            return { status: 'error', config: null, error: result.error.message };
        }
        // Legacy schemas must still deliver maintenance flags, never pretend the new settings loaded.
        const fallback = await client.from('app_config').select('id,maintenance_mode,maintenance_message,updated_at').eq('id', 1).single();
        if (fallback.error) return { status: 'error', config: null, error: fallback.error.message };
        if (!fallback.data || typeof fallback.data.maintenance_mode !== 'boolean') {
            return { status: 'error', config: null, error: 'Maintenance state is unknown.' };
        }
        return { status: 'degraded', error: 'Configuration schema is incomplete; apply the reviewed API/auth repair migration.',
            config: { ...fallback.data, congestion_config: {}, api_config: structuredClone(API_CONFIG_DEFAULTS), public_api_enabled: true } as AppConfig };
    } catch (error) {
        return { status: 'error', config: null, error: error instanceof Error ? error.message : 'Configuration unavailable.' };
    }
}
