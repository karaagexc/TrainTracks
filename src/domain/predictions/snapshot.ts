import type { PredictionResponse, PredictedTrain } from './engine';

export interface PredictionSnapshot {
    key: string;
    response: PredictionResponse;
    receivedAt: number;
}

export type PredictionConnectionState = 'idle' | 'loading' | 'fresh' | 'stale' | 'offline' | 'error';
export const OFFLINE_FORECAST_HORIZON_MS = 5 * 60_000;
export const OFFLINE_FORECAST_LIMIT = 60;

export function isPredictionResponse(value: unknown): value is PredictionResponse {
    if (!value || typeof value !== 'object') return false;
    const response = value as Partial<PredictionResponse>;
    return response.timezone === 'Asia/Manila'
        && ['active', 'not_yet_started', 'service_closed', 'last_train_passed', 'service_suspended', 'unavailable', 'invalid_request'].includes(String(response.serviceState))
        && ['weekday', 'monday_am_peak', 'friday_pm_peak', 'saturday', 'sunday_or_regular_holiday', 'special_holiday', 'major_maintenance'].includes(String(response.dayType))
        && typeof response.generatedAt === 'string' && Number.isFinite(Date.parse(response.generatedAt))
        && typeof response.validUntil === 'string' && Number.isFinite(Date.parse(response.validUntil))
        && Date.parse(response.validUntil) >= Date.parse(response.generatedAt)
        && typeof response.sourceVersion === 'string' && response.sourceVersion.length > 0
        && response.provenance?.category === 'schedule_model'
        && response.provenance.realtimeVehicleFeed === false
        && Array.isArray(response.provenance.inputs) && Array.isArray(response.provenance.sourceRefs)
        && Array.isArray(response.predictions) && response.predictions.length <= 120
        && response.predictions.every((train) => train && typeof train === 'object' && train.source === 'predicted'
            && typeof train.id === 'string' && train.id.length > 0 && Number.isFinite(train.updatedAt)
            && Number.isFinite(train.lat) && Number.isFinite(train.lng)
            && Math.abs(train.lat) <= 90 && Math.abs(train.lng) <= 180
            && ['LRT1', 'LRT2', 'MRT3'].includes(train.lineId)
            && (train.lineId === 'LRT2' ? ['EASTBOUND', 'WESTBOUND'] : ['NORTHBOUND', 'SOUTHBOUND']).includes(train.direction)
            && ['AT_STATION', 'LEAVING_STATION', 'IN_TRANSIT', 'APPROACHING_STATION'].includes(train.statusCode)
            && Number.isFinite(train.speedKph) && train.speedKph >= 0 && train.speedKph <= 180
            && Number.isFinite(train.confidence) && train.confidence >= 0 && train.confidence <= 1
            && Number.isFinite(train.validUntil)
            && (train.predictionScope === 'map' || train.predictionScope === 'station'));
}

/** Cached station forecasts only. Never invent vehicles or advance observation timestamps. */
export function deriveOfflineForecasts(snapshots: PredictionSnapshot[], now: number): PredictedTrain[] {
    return snapshots.flatMap(({ response }) => {
        const age = now - Date.parse(response.generatedAt);
        if (age < 0 || age > OFFLINE_FORECAST_HORIZON_MS) return [];
        return response.predictions.filter((train) => train.predictionScope === 'station'
            && train.arrivalTime && Date.parse(train.departureTime ?? train.arrivalTime) >= now)
            .map((train) => ({
                ...train,
                etaSeconds: Math.max(0, Math.round((Date.parse(train.arrivalTime!) - now) / 1000)),
                confidenceLevel: 'low' as const,
                freshness: 'stale' as const,
            }));
    }).slice(0, OFFLINE_FORECAST_LIMIT);
}
