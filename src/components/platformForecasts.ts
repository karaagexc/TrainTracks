import type { Direction, Station } from '@/types';
import type { TrainPresence } from '@/types/train';
import type { PredictionConnectionState, PredictionSnapshot } from '@/domain/predictions/snapshot';
import { isForwardDirection } from '@/domain/railway';

export function forecastEtaSeconds(train: TrainPresence, now = Date.now()): number | null {
    if (train.predictionScope !== 'station') return null;
    const arrival = train.arrivalTime ? Date.parse(train.arrivalTime) : NaN;
    if (Number.isFinite(arrival)) return Math.max(0, Math.round((arrival - now) / 1000));
    return typeof train.etaSeconds === 'number' && Number.isFinite(train.etaSeconds)
        ? Math.max(0, Math.round(train.etaSeconds - (now - train.updatedAt) / 1000)) : null;
}

export function platformTrains(trains: TrainPresence[], forecasts: TrainPresence[], station: Station,
    lineStations: Station[], direction?: Direction | null, now = Date.now()): TrainPresence[] {
    const matchingForecasts = forecasts.filter((train) => train.lineId === station.lineId
        && train.stationId === station.id && (!direction || train.direction === direction)
        && train.predictionScope === 'station'
        && (train.validUntil == null || train.validUntil >= now || train.freshness === 'stale')
        && (!train.departureTime || Date.parse(train.departureTime) >= now - 30_000));
    const forecastDirections = new Set(matchingForecasts.map((train) => train.direction));
    const approaching = trains.filter((train) => {
        if (train.lineId !== station.lineId || (direction && train.direction !== direction)) return false;
        if (train.predictionScope === 'station') return false;
        if (train.source === 'predicted' && forecastDirections.has(train.direction)) return false;
        const trainStation = lineStations.find((candidate) => candidate.id === train.stationId);
        return trainStation && (isForwardDirection(train.direction)
            ? trainStation.order <= station.order : trainStation.order >= station.order);
    });
    const unique = new Map<string, TrainPresence>();
    for (const train of [...approaching, ...matchingForecasts]) {
        const key = train.source === 'predicted' ? train.dispatchId ?? train.id : train.id;
        if (!unique.has(key)) unique.set(key, train);
    }
    return [...unique.values()].sort((left, right) => {
        const truth = Number(left.source === 'predicted') - Number(right.source === 'predicted');
        const distance = (train: TrainPresence) => Math.abs((lineStations.find((candidate) => candidate.id === train.stationId)?.order ?? station.order) - station.order);
        return truth || (forecastEtaSeconds(left, now) ?? distance(left) * 120)
            - (forecastEtaSeconds(right, now) ?? distance(right) * 120) || right.confidence - left.confidence;
    });
}

export function platformEmptyMessage(state: PredictionConnectionState, error: string | null,
    snapshots: PredictionSnapshot[], stationId: string, direction?: Direction | null): string {
    if (state === 'loading' || state === 'idle') return 'Loading arrival estimates...';
    if (state === 'offline') return 'Offline - arrival estimates unavailable';
    if (state === 'error') return error || 'Arrival estimates temporarily unavailable';
    if (state === 'stale') return 'Arrival estimates are out of date';
    const matching = snapshots.filter(({ key }) => {
        const query = new URLSearchParams(key);
        return query.get('scope') === 'station' && query.get('stationId') === stationId
            && (!direction || !query.get('direction') || query.get('direction') === direction);
    });
    const service = matching[0]?.response.serviceState;
    if (service === 'not_yet_started') return 'Service has not started yet';
    if (service === 'service_closed' || service === 'last_train_passed') return 'Service has ended for this platform';
    if (service === 'service_suspended') return 'Service is suspended';
    if (service === 'unavailable' || service === 'invalid_request' || !matching.length) return 'Arrival estimates unavailable';
    return 'No matching arrivals in the forecast window';
}

export function formatForecastEta(train: TrainPresence): string {
    const seconds = forecastEtaSeconds(train);
    if (seconds === null) return 'ETA unavailable';
    if (seconds === 0) return 'Forecast due now';
    const window = train.etaWindowSeconds ?? 30;
    const low = Math.max(0, Math.floor((seconds - window) / 60));
    const high = Math.max(1, Math.ceil((seconds + window) / 60));
    return low === high ? `Forecast ~${high} min` : `Forecast ${low}-${high} min`;
}
