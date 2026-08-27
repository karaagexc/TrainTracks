import type { RailLineId } from '@/types';

export const PREDICTION_MAP_LIMIT = 20;
export const PREDICTION_STATION_LIMIT = 3;
export const PREDICTION_MAP_LINES: RailLineId[] = ['LRT1', 'LRT2', 'MRT3'];

export interface PredictionRequestUrl {
    key: string;
    jsonUrl: string;
    streamUrl: string;
}

function buildPredictionRequest(path: 'predictions' | 'predictions/stream', params: URLSearchParams): string {
    return `/api/${path}?${params.toString()}`;
}

function appendUniqueRequest(requests: PredictionRequestUrl[], params: URLSearchParams) {
    const key = params.toString();
    if (requests.some((request) => request.key === key)) return;
    requests.push({
        key,
        jsonUrl: buildPredictionRequest('predictions', params),
        streamUrl: buildPredictionRequest('predictions/stream', params),
    });
}

function appendUniqueStationRequest(
    requests: PredictionRequestUrl[],
    stationId: string | null | undefined,
    direction: string | null | undefined,
    mode: string,
) {
    if (!stationId) return;
    const params = new URLSearchParams({
        scope: 'station',
        mode,
        stationId,
        limit: String(PREDICTION_STATION_LIMIT),
    });
    if (direction) params.set('direction', direction);
    appendUniqueRequest(requests, params);
}

export function buildPredictionRequests(
    currentStationId: string | null | undefined,
    selectedStationCode: string | null,
    direction: string | null | undefined,
    mode: string,
): PredictionRequestUrl[] {
    const requests: PredictionRequestUrl[] = [];

    appendUniqueRequest(requests, new URLSearchParams({
        scope: 'map',
        mode,
        limit: String(PREDICTION_MAP_LIMIT),
    }));

    appendUniqueStationRequest(requests, currentStationId, direction, mode);
    appendUniqueStationRequest(requests, selectedStationCode, null, mode);
    return requests;
}
