import type { TrainPresence } from '@/types/train';
import { STATIONS } from '@/data/stations';

export function isReceivedCrowdPresence(value: unknown, now = Date.now()): value is TrainPresence {
    if (!value || typeof value !== 'object') return false;
    const train = value as Partial<TrainPresence>;
    return train.source === 'crowd' && typeof train.id === 'string' && train.id.length > 0 && train.id.length <= 160
        && typeof train.sampleId === 'string' && train.sampleId.length > 0 && train.sampleId.length <= 128
        && ['LRT1', 'LRT2', 'MRT3'].includes(String(train.lineId))
        && (train.lineId === 'LRT2' ? ['EASTBOUND', 'WESTBOUND'] : ['NORTHBOUND', 'SOUTHBOUND']).includes(String(train.direction))
        && ['AT_STATION', 'LEAVING_STATION', 'IN_TRANSIT', 'APPROACHING_STATION'].includes(String(train.statusCode))
        && [train.lat, train.lng, train.speedKph, train.confidence, train.updatedAt].every(
            (number) => typeof number === 'number' && Number.isFinite(number),
        ) && train.speedKph! >= 0 && train.speedKph! <= 180 && train.confidence! >= 0 && train.confidence! <= 1
        && (train.stationId === null || STATIONS.some((station) => station.id === train.stationId && station.lineId === train.lineId))
        && train.updatedAt! <= now + 5000 && train.updatedAt! >= now - 60_000
        && train.lat! >= 14.3 && train.lat! <= 14.9 && train.lng! >= 120.8 && train.lng! <= 121.3;
}

export function createCrowdSampleReceiver(limit = 500) {
    const samples = new Map<string, number>();
    return (train: TrainPresence, now = Date.now()) => {
        for (const [key, expiresAt] of samples) if (expiresAt < now) samples.delete(key);
        const key = `${train.id}:${train.sampleId}`;
        if (samples.has(key)) return false;
        if (samples.size >= limit) samples.delete(samples.keys().next().value!);
        samples.set(key, Math.max(now, train.updatedAt) + 60_000);
        return true;
    };
}
