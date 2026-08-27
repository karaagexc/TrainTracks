import { normalizeDirection } from '@/domain/railway';
import type { PredictionRequest, PredictionScope } from '@/domain/predictions/engine';
import type { Direction, LegacyDirection, OperationalMode, RailLineId } from '@/types';

const VALID_LINES = new Set<RailLineId>(['LRT1', 'LRT2', 'MRT3', 'MRT7']);
const VALID_SCOPES = new Set<PredictionScope>(['map', 'station']);
const VALID_MODES = new Set<OperationalMode>(['live', 'sandbox']);

export function parsePredictionLine(value: string | null): RailLineId | null {
    if (!value) return null;
    const normalized = value.replace('-', '').toUpperCase() as RailLineId;
    return VALID_LINES.has(normalized) ? normalized : null;
}

export function parsePredictionScope(value: string | null): PredictionScope {
    return value && VALID_SCOPES.has(value as PredictionScope)
        ? value as PredictionScope
        : 'station';
}

export function parsePredictionMode(value: string | null): OperationalMode {
    return value && VALID_MODES.has(value as OperationalMode)
        ? value as OperationalMode
        : 'live';
}

export function parsePredictionLimit(value: string | null): number {
    if (!value) return 3;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 3;
}

export function parsePredictionRequestFromUrl(url: URL): PredictionRequest {
    const params = url.searchParams;
    const lineId = parsePredictionLine(params.get('lineId'));
    const rawDirection = params.get('direction') as Direction | LegacyDirection | null;

    return {
        lineId,
        direction: normalizeDirection(rawDirection, lineId),
        stationId: params.get('stationId'),
        scope: parsePredictionScope(params.get('scope')),
        mode: parsePredictionMode(params.get('mode')),
        limit: parsePredictionLimit(params.get('limit')),
    };
}
