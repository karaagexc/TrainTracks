import 'server-only';
import { loadServerConfig } from '@/domain/config/server';
import { API_CONFIG_DEFAULTS, type ConfigLoadResult } from '@/domain/config';
import { getPredictionResponse, type PredictionRequest } from './engine';

let cached: ConfigLoadResult | null = null;
let expiresAt = 0;
let inFlight: Promise<ConfigLoadResult> | null = null;
export const SERVER_CONFIG_TTL_MS = 5000;

export async function getServerApiConfiguration(): Promise<ConfigLoadResult> {
    if (cached && expiresAt > Date.now()) return cached;
    if (inFlight) return inFlight;
    inFlight = loadServerConfig().catch((error): ConfigLoadResult => ({
        status: 'error', config: null, error: error instanceof Error ? error.message : 'Configuration unavailable.',
    })).then((result) => {
        cached = result;
        expiresAt = Date.now() + SERVER_CONFIG_TTL_MS;
        return result;
    });
    try { return await inFlight; } finally { inFlight = null; }
}

export function peekConfiguredCorsOrigin(): string | null {
    return cached?.status === 'ready' ? cached.config?.api_config.corsOrigin ?? null : null;
}

export function publicApiConfigurationAccess(configuration: ConfigLoadResult) {
    if (configuration.status !== 'ready' || !configuration.config) return {
        ok: false as const, status: 503, code: 'api_config_unavailable' as const,
        message: 'Public API configuration is unavailable.',
    };
    if (!configuration.config.public_api_enabled) return {
        ok: false as const, status: 503, code: 'public_api_disabled' as const,
        message: 'The public API is currently disabled.',
    };
    return { ok: true as const, status: 200, code: 'ok' as const, message: 'Authorized.' };
}

export async function getConfiguredPredictionResponse(request: PredictionRequest) {
    const configuration = await getServerApiConfiguration();
    const config = configuration.config?.api_config ?? API_CONFIG_DEFAULTS;
    const response = getPredictionResponse({ ...request, config: config.prediction });
    response.sourceVersion += `/config-v${config.version}:${configuration.config?.updated_at ?? 'defaults'}:${JSON.stringify(config.prediction)}`;
    return response;
}
