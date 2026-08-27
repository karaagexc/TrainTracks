import type { Direction, RailLineId } from '@/types';
import { formatDirection } from '@/domain/railway';

export type TrainPresenceSource = 'crowd' | 'simulated' | 'operator' | 'predicted';
export type TrainFreshness = 'fresh' | 'aging' | 'stale';
export type SelfTrainPresencePhase = 'inactive' | 'waiting_at_origin' | 'moving' | 'dwelling';

export type TrainPresenceStatus =
    | 'AT_STATION'
    | 'LEAVING_STATION'
    | 'IN_TRANSIT'
    | 'APPROACHING_STATION';

export interface TrainPresence {
    id: string;
    sampleId?: string;
    lineId: RailLineId;
    direction: Direction;
    lat: number;
    lng: number;
    speedKph: number;
    statusCode: TrainPresenceStatus;
    stationId: string | null;
    stationName: string | null;
    source: TrainPresenceSource;
    updatedAt: number;
    confidence: number;
    deviceId?: string;
    clusterId?: string;
    sourceCount?: number;
    lastSeenMs?: number;
    freshness?: TrainFreshness;
    memberIds?: string[];
    dispatchId?: string;
    predictionScope?: 'map' | 'station';
    predictionStatus?: 'predicted_departing' | 'predicted_between_stations' | 'predicted_approaching' | 'predicted_arriving';
    etaSeconds?: number | null;
    etaWindowSeconds?: number;
    arrivalTime?: string | null;
    departureTime?: string | null;
    confidenceLevel?: 'high' | 'medium' | 'low' | 'unavailable';
    reasonCodes?: string[];
    validUntil?: number;
}

export const LINE_DISPLAY_NAMES: Record<RailLineId, string> = {
    LRT1: 'LRT-1',
    LRT2: 'LRT-2',
    MRT3: 'MRT-3',
    MRT7: 'MRT-7',
};

export const LINE_ID_FROM_DISPLAY: Record<string, RailLineId> = {
    'LRT-1': 'LRT1',
    'LRT1': 'LRT1',
    'LRT-2': 'LRT2',
    'LRT2': 'LRT2',
    'MRT-3': 'MRT3',
    'MRT3': 'MRT3',
    'MRT-7': 'MRT7',
    'MRT7': 'MRT7',
};

export function getTrainLineLabel(train: Pick<TrainPresence, 'lineId'>): string {
    return LINE_DISPLAY_NAMES[train.lineId] ?? train.lineId;
}

export function getTrainDirectionLabel(train: Pick<TrainPresence, 'direction'>): string {
    return formatDirection(train.direction ?? null);
}

export function getTrainSpeedLabel(train: Pick<TrainPresence, 'speedKph'>): string {
    return `${Math.round(train.speedKph)} km/h`;
}

export function getTrainSignalCount(train: Pick<TrainPresence, 'sourceCount' | 'memberIds'>): number {
    return Math.max(1, train.sourceCount ?? train.memberIds?.length ?? 1);
}

export function getTrainSignalLabel(train: Pick<TrainPresence, 'sourceCount' | 'memberIds' | 'source'>): string {
    if (train.source === 'predicted') return 'forecast';
    const count = getTrainSignalCount(train);
    return count === 1 ? '1 signal' : `${count} signals`;
}

export function getTrainFreshnessLabel(train: Pick<TrainPresence, 'freshness' | 'updatedAt'>, now = Date.now()): string {
    const ageSeconds = Math.max(0, Math.round((now - train.updatedAt) / 1000));
    if (train.freshness === 'stale') return `stale ${ageSeconds}s`;
    if (train.freshness === 'aging') return `seen ${ageSeconds}s`;
    return 'fresh';
}

export function getTrainStatusLabel(train: Pick<TrainPresence, 'statusCode'>): string {
    switch (train.statusCode) {
        case 'AT_STATION':
            return 'CURRENT STATION';
        case 'LEAVING_STATION':
            return 'NOW LEAVING';
        case 'APPROACHING_STATION':
            return 'NOW APPROACHING';
        case 'IN_TRANSIT':
        default:
            return 'IN TRANSIT';
    }
}

export function getTrainTelemetryText(train: Pick<TrainPresence, 'statusCode' | 'stationId' | 'stationName'>): string {
    const station = train.stationId && train.stationName
        ? `[${train.stationId}] ${train.stationName}`
        : train.stationName ?? 'Unknown';

    switch (train.statusCode) {
        case 'AT_STATION':
            return `CURRENT STATION: ${station}`;
        case 'LEAVING_STATION':
            return `NOW LEAVING: ${station}`;
        case 'APPROACHING_STATION':
            return `NOW APPROACHING: ${station}`;
        case 'IN_TRANSIT':
        default:
            return `IN TRANSIT TO: ${station}`;
    }
}
