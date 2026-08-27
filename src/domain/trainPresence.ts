import type { TrainFreshness, TrainPresence, TrainPresenceStatus } from '@/types/train';
import { getDistanceKm } from '@/utils/geo';

export const TRAIN_FRESH_MS = 15_000;
export const TRAIN_STALE_MS = 25_000;
export const TRAIN_EXPIRE_MS = 60_000;

const CROWD_CLUSTER_WINDOW_MS = 15_000;
const CROWD_CLUSTER_RADIUS_KM = 0.45;
const CROWD_CLUSTER_WEIGHT_FLOOR = 0.25;

const PUBLIC_LINE_IDS = new Set(['LRT1', 'LRT2', 'MRT3']);

type CrowdBucket = {
    id: string;
    members: TrainPresence[];
};

export interface StationDwellSummary {
    stationId: string;
    trains: TrainPresence[];
    trainCount: number;
    confirmedTrainCount: number;
    expectedTrainCount: number;
    signalCount: number;
    directions: TrainPresence['direction'][];
    hasFreshSignal: boolean;
    hasStaleSignal: boolean;
    lastSeenMs: number | null;
}

export interface StationDwellSnapshot {
    signature: string;
    byStation: Map<string, TrainPresence[]>;
}

export function getTrainFreshness(train: Pick<TrainPresence, 'updatedAt'>, now = Date.now()): TrainFreshness {
    const ageMs = now - train.updatedAt;
    if (ageMs <= TRAIN_FRESH_MS) return 'fresh';
    if (ageMs <= TRAIN_STALE_MS) return 'aging';
    return 'stale';
}

export function getTrainLastSeenMs(train: Pick<TrainPresence, 'updatedAt'>, now = Date.now()): number {
    return Math.max(0, now - train.updatedAt);
}

export function isTrainPresenceExpired(train: Pick<TrainPresence, 'updatedAt'>, now = Date.now()): boolean {
    return getTrainLastSeenMs(train, now) > TRAIN_EXPIRE_MS;
}

export function isPublicTrainPresence(train: Pick<TrainPresence, 'lineId'>): boolean {
    return PUBLIC_LINE_IDS.has(train.lineId);
}

export function getTrainPresenceIdentity(
    train: Pick<TrainPresence, 'id' | 'source' | 'deviceId'>,
): string {
    const deviceId = train.deviceId?.trim();
    if (train.source === 'crowd' && deviceId) {
        return 'crowd-device:' + deviceId;
    }
    return 'train-id:' + train.id;
}

export function deduplicateTrainPresenceByReporter(trains: TrainPresence[]): TrainPresence[] {
    const byIdentity = new Map<string, TrainPresence>();

    trains.forEach((train) => {
        const identity = getTrainPresenceIdentity(train);
        const existing = byIdentity.get(identity);
        if (!existing || train.updatedAt >= existing.updatedAt) {
            byIdentity.set(identity, train);
        }
    });

    return Array.from(byIdentity.values());
}

function isTruthSignal(train: TrainPresence): boolean {
    return train.source === 'crowd' || train.source === 'operator' || train.source === 'simulated';
}

function doesTruthOverridePrediction(prediction: TrainPresence, truth: TrainPresence, now: number): boolean {
    if (prediction.source !== 'predicted' || !isTruthSignal(truth)) return false;
    if (truth.lineId !== prediction.lineId || truth.direction !== prediction.direction) return false;
    if (isTrainPresenceExpired(truth, now)) return false;

    if (truth.stationId && prediction.stationId) {
        return truth.stationId === prediction.stationId;
    }

    return getDistanceKm(
        { latitude: truth.lat, longitude: truth.lng },
        { latitude: prediction.lat, longitude: prediction.lng },
    ) <= CROWD_CLUSTER_RADIUS_KM;
}

export function filterOverriddenPredictions(trains: TrainPresence[], now = Date.now()): TrainPresence[] {
    const truthSignals = trains.filter(isTruthSignal);
    return trains.filter((train) => (
        train.source !== 'predicted' ||
        !truthSignals.some((truth) => doesTruthOverridePrediction(train, truth, now))
    ));
}

export function decorateTrainPresence(train: TrainPresence, now = Date.now()): TrainPresence {
    const memberIds = train.memberIds?.length ? train.memberIds : [train.id];
    return {
        ...train,
        sourceCount: Math.max(1, train.sourceCount ?? memberIds.length),
        lastSeenMs: getTrainLastSeenMs(train, now),
        freshness: getTrainFreshness(train, now),
        memberIds,
    };
}

function statusRank(status: TrainPresenceStatus): number {
    switch (status) {
        case 'AT_STATION':
            return 4;
        case 'APPROACHING_STATION':
            return 3;
        case 'LEAVING_STATION':
            return 2;
        case 'IN_TRANSIT':
        default:
            return 1;
    }
}

function weightedAverage(values: number[], weights: number[]): number {
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    if (totalWeight <= 0) return values[0] ?? 0;
    return values.reduce((sum, value, index) => sum + value * weights[index], 0) / totalWeight;
}

function chooseStation(members: TrainPresence[]): Pick<TrainPresence, 'stationId' | 'stationName'> {
    const stationCounts = new Map<string, { count: number; train: TrainPresence }>();

    members.forEach((train) => {
        if (!train.stationId) return;
        const existing = stationCounts.get(train.stationId);
        if (!existing || train.updatedAt > existing.train.updatedAt) {
            stationCounts.set(train.stationId, {
                count: (existing?.count ?? 0) + 1,
                train,
            });
        } else {
            existing.count += 1;
        }
    });

    const selected = Array.from(stationCounts.values())
        .sort((left, right) => right.count - left.count || right.train.updatedAt - left.train.updatedAt)[0]?.train;

    return {
        stationId: selected?.stationId ?? null,
        stationName: selected?.stationName ?? null,
    };
}

function chooseStatus(members: TrainPresence[]): TrainPresenceStatus {
    const statusCounts = new Map<TrainPresenceStatus, { count: number; newest: number }>();
    members.forEach((train) => {
        const current = statusCounts.get(train.statusCode);
        statusCounts.set(train.statusCode, {
            count: (current?.count ?? 0) + 1,
            newest: Math.max(current?.newest ?? 0, train.updatedAt),
        });
    });

    return Array.from(statusCounts.entries())
        .sort((left, right) => right[1].count - left[1].count || statusRank(right[0]) - statusRank(left[0]) || right[1].newest - left[1].newest)[0]?.[0]
        ?? 'IN_TRANSIT';
}

function roundCoord(value: number): string {
    return value.toFixed(3);
}

function canJoinBucket(bucket: CrowdBucket, train: TrainPresence, now: number): boolean {
    const anchor = bucket.members[0];
    if (!anchor) return false;
    if (anchor.lineId !== train.lineId || anchor.direction !== train.direction) return false;
    if (Math.abs(anchor.updatedAt - train.updatedAt) > CROWD_CLUSTER_WINDOW_MS) return false;
    if (isTrainPresenceExpired(train, now)) return false;

    const anchorStation = anchor.stationId ?? null;
    const trainStation = train.stationId ?? null;
    if (anchorStation || trainStation) {
        return anchorStation === trainStation;
    }

    return bucket.members.some((member) => getDistanceKm(
        { latitude: member.lat, longitude: member.lng },
        { latitude: train.lat, longitude: train.lng },
    ) <= CROWD_CLUSTER_RADIUS_KM);
}

function buildCrowdCluster(bucket: CrowdBucket, now: number): TrainPresence {
    const members = bucket.members;
    if (members.length === 1) {
        return decorateTrainPresence(members[0], now);
    }

    const newest = members.reduce((latest, train) => train.updatedAt > latest.updatedAt ? train : latest, members[0]);
    const weights = members.map((train) => Math.max(CROWD_CLUSTER_WEIGHT_FLOOR, train.confidence));
    const station = chooseStation(members);
    const statusCode = chooseStatus(members);
    const lat = weightedAverage(members.map((train) => train.lat), weights);
    const lng = weightedAverage(members.map((train) => train.lng), weights);
    const speedKph = weightedAverage(members.map((train) => train.speedKph), weights);
    const confidence = Math.min(0.98, weightedAverage(members.map((train) => train.confidence), weights) + Math.min(0.12, members.length * 0.025));
    const memberIds = members.map((train) => train.id).sort();
    const stationKey = station.stationId ?? `${roundCoord(lat)}-${roundCoord(lng)}`;
    const clusterId = `CROWD-${newest.lineId}-${newest.direction}-${statusCode}-${stationKey}`;

    return decorateTrainPresence({
        id: clusterId,
        clusterId,
        lineId: newest.lineId,
        direction: newest.direction,
        lat,
        lng,
        speedKph,
        statusCode,
        stationId: station.stationId,
        stationName: station.stationName,
        source: 'crowd',
        updatedAt: newest.updatedAt,
        confidence,
        sourceCount: members.length,
        memberIds,
    }, now);
}

export function clusterTrainPresence(trains: TrainPresence[], now = Date.now()): TrainPresence[] {
    const active = deduplicateTrainPresenceByReporter(
        trains.filter((train) => !isTrainPresenceExpired(train, now)),
    );
    const nonCrowd = active
        .filter((train) => train.source !== 'crowd')
        .map((train) => decorateTrainPresence(train, now));

    const buckets: CrowdBucket[] = [];
    active
        .filter((train) => train.source === 'crowd')
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .forEach((train) => {
            const bucket = buckets.find((candidate) => canJoinBucket(candidate, train, now));
            if (bucket) {
                bucket.members.push(train);
            } else {
                buckets.push({
                    id: train.id,
                    members: [train],
                });
            }
        });

    return [
        ...nonCrowd,
        ...buckets.map((bucket) => buildCrowdCluster(bucket, now)),
    ].sort((left, right) => {
        const lineCompare = left.lineId.localeCompare(right.lineId);
        if (lineCompare !== 0) return lineCompare;
        const stationCompare = (left.stationId ?? '').localeCompare(right.stationId ?? '');
        if (stationCompare !== 0) return stationCompare;
        return right.updatedAt - left.updatedAt;
    });
}

function getStationDwellSignaturePart(train: TrainPresence, now: number): string {
    const memberCount = Math.max(1, train.sourceCount ?? train.memberIds?.length ?? 1);
    return [
        train.stationId ?? '',
        train.id,
        train.lineId,
        train.direction,
        train.source,
        train.statusCode,
        memberCount,
        getTrainFreshness(train, now),
        train.predictionScope ?? '',
    ].join(':');
}

export function buildStationDwellSnapshot(trains: TrainPresence[], now = Date.now()): StationDwellSnapshot {
    const byStation = new Map<string, TrainPresence[]>();
    const signatureParts: string[] = [];

    trains
        .filter((train) => train.statusCode === 'AT_STATION' && !!train.stationId)
        .map((train) => decorateTrainPresence(train, now))
        .sort((left, right) => {
            const stationCompare = (left.stationId ?? '').localeCompare(right.stationId ?? '');
            if (stationCompare !== 0) return stationCompare;
            return left.id.localeCompare(right.id);
        })
        .forEach((train) => {
            const stationId = train.stationId as string;
            const existing = byStation.get(stationId);
            if (existing) {
                existing.push(train);
            } else {
                byStation.set(stationId, [train]);
            }
            signatureParts.push(getStationDwellSignaturePart(train, now));
        });

    return {
        signature: signatureParts.join('|'),
        byStation,
    };
}

export function getStationDwellSummary(
    trains: TrainPresence[],
    stationId: string,
    now = Date.now(),
): StationDwellSummary {
    const dwellingTrains = trains
        .filter((train) => train.stationId === stationId && train.statusCode === 'AT_STATION')
        .map((train) => decorateTrainPresence(train, now));
    const confirmedTrains = dwellingTrains.filter((train) => train.source !== 'predicted');
    const expectedTrains = dwellingTrains.filter((train) => train.source === 'predicted');
    const directions = Array.from(new Set(dwellingTrains.map((train) => train.direction)));
    const lastSeenValues = dwellingTrains.map((train) => train.lastSeenMs ?? getTrainLastSeenMs(train, now));

    return {
        stationId,
        trains: dwellingTrains,
        trainCount: dwellingTrains.length,
        confirmedTrainCount: confirmedTrains.length,
        expectedTrainCount: expectedTrains.length,
        signalCount: confirmedTrains.reduce((sum, train) => sum + (train.sourceCount ?? 1), 0),
        directions,
        hasFreshSignal: dwellingTrains.some((train) => train.freshness === 'fresh' || train.freshness === 'aging'),
        hasStaleSignal: dwellingTrains.some((train) => train.freshness === 'stale'),
        lastSeenMs: lastSeenValues.length > 0 ? Math.min(...lastSeenValues) : null,
    };
}
