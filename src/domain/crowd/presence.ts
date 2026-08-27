import { createHash } from 'node:crypto';
import { STATIONS } from '@/data/stations';
import { isBuiltRailLine, normalizeDirection } from '@/domain/railway';
import { getDistanceFromLineTrackMeters } from '@/domain/predictions/trackGeometry';
import { getDistanceKm } from '@/utils/geo';
import type { Direction, LegacyDirection, RailLineId, Station } from '@/types';
import type { TrainPresence, TrainPresenceStatus } from '@/types/train';

export interface CrowdPresenceValidationResult {
    ok: boolean;
    status: number;
    code:
        | 'ok'
        | 'invalid_payload'
        | 'invalid_line'
        | 'invalid_direction'
        | 'invalid_status'
        | 'invalid_location'
        | 'invalid_device'
        | 'low_accuracy'
        | 'off_corridor';
    message: string;
    train?: TrainPresence;
    sampleId?: string;
    accuracyMeters?: number;
}

export interface CrowdPresenceValidationOptions {
    pseudonym?: string;
}

const VALID_STATUSES = new Set<TrainPresenceStatus>([
    'AT_STATION',
    'LEAVING_STATION',
    'IN_TRANSIT',
    'APPROACHING_STATION',
]);
const VALID_LINES = new Set<RailLineId>(['LRT1', 'LRT2', 'MRT3']);
const MAX_ACCURACY_METERS = 250;
const MAX_CORRIDOR_DISTANCE_METERS = 500;
const MAX_STATION_ANCHOR_METERS = 900;

const METRO_MANILA_BOUNDS = {
    minLat: 14.30,
    maxLat: 14.90,
    minLng: 120.80,
    maxLng: 121.30,
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object';
}

function readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function fallbackPseudonym(deviceId: string): string {
    return createHash('sha256').update(deviceId).digest('hex').slice(0, 20);
}

function isValidDirectionForLine(lineId: RailLineId, direction: Direction | null): direction is Direction {
    if (!direction) return false;
    if (lineId === 'LRT2') {
        return direction === 'EASTBOUND' || direction === 'WESTBOUND';
    }
    return direction === 'NORTHBOUND' || direction === 'SOUTHBOUND';
}

function isWithinLiveRailBounds(lat: number, lng: number): boolean {
    return lat >= METRO_MANILA_BOUNDS.minLat
        && lat <= METRO_MANILA_BOUNDS.maxLat
        && lng >= METRO_MANILA_BOUNDS.minLng
        && lng <= METRO_MANILA_BOUNDS.maxLng;
}

function nearestLineStation(lineId: RailLineId, lat: number, lng: number): Station | null {
    const location = { latitude: lat, longitude: lng };
    return STATIONS
        .filter((station) => station.lineId === lineId && isBuiltRailLine(station.lineId))
        .map((station) => ({ station, distance: getDistanceKm(location, station) * 1000 }))
        .sort((left, right) => left.distance - right.distance)[0]?.station ?? null;
}

function errorResult(
    status: number,
    code: CrowdPresenceValidationResult['code'],
    message: string,
): CrowdPresenceValidationResult {
    return { ok: false, status, code, message };
}

export function readCrowdPresenceDeviceId(payload: unknown): string | null {
    return isRecord(payload) ? readString(payload.deviceId) : null;
}

export function sanitizeCrowdPresencePayload(
    payload: unknown,
    now = Date.now(),
    options: CrowdPresenceValidationOptions = {},
): CrowdPresenceValidationResult {
    if (!isRecord(payload)) {
        return errorResult(400, 'invalid_payload', 'Crowd presence payload must be an object.');
    }

    const deviceId = readString(payload.deviceId);
    if (!deviceId || deviceId.length < 8 || deviceId.length > 128) {
        return errorResult(400, 'invalid_device', 'Crowd presence requires an anonymous device id.');
    }

    const lineId = readString(payload.lineId) as RailLineId | null;
    if (!lineId || !VALID_LINES.has(lineId) || !isBuiltRailLine(lineId)) {
        return errorResult(400, 'invalid_line', 'Crowd presence only accepts built public rail lines.');
    }

    const direction = normalizeDirection(
        readString(payload.direction) as Direction | LegacyDirection | null,
        lineId,
    );
    if (!isValidDirectionForLine(lineId, direction)) {
        return errorResult(400, 'invalid_direction', 'Crowd presence direction does not match the selected line.');
    }

    const lat = readNumber(payload.lat);
    const lng = readNumber(payload.lng);
    if (lat === null || lng === null || !isWithinLiveRailBounds(lat, lng)) {
        return errorResult(400, 'invalid_location', 'Crowd presence location is outside the supported rail service area.');
    }

    const accuracyMeters = clamp(readNumber(payload.accuracyMeters) ?? 250, 1, 1000);
    if (accuracyMeters > MAX_ACCURACY_METERS) {
        return errorResult(422, 'low_accuracy', 'GPS accuracy is too low to publish a trustworthy train position.');
    }

    const trackDistanceMeters = getDistanceFromLineTrackMeters(lineId, {
        latitude: lat,
        longitude: lng,
    });
    if (trackDistanceMeters === null || trackDistanceMeters > MAX_CORRIDOR_DISTANCE_METERS) {
        return errorResult(422, 'off_corridor', 'Position does not match the selected rail corridor.');
    }

    const statusCode = readString(payload.statusCode) as TrainPresenceStatus | null;
    if (!statusCode || !VALID_STATUSES.has(statusCode)) {
        return errorResult(400, 'invalid_status', 'Crowd presence status is invalid.');
    }

    const nearest = nearestLineStation(lineId, lat, lng);
    const requestedStationId = readString(payload.stationId);
    const requestedStation = requestedStationId
        ? STATIONS.find((station) => station.id === requestedStationId && station.lineId === lineId) ?? null
        : null;
    const requestedDistanceMeters = requestedStation
        ? getDistanceKm({ latitude: lat, longitude: lng }, requestedStation) * 1000
        : Number.POSITIVE_INFINITY;
    const station = requestedStation && requestedDistanceMeters <= MAX_STATION_ANCHOR_METERS
        ? requestedStation
        : nearest;

    const speedKph = clamp(readNumber(payload.speedKph) ?? 0, 0, 120);
    const pseudonym = options.pseudonym ?? fallbackPseudonym(deviceId);
    const sampleId = readString(payload.sampleId)?.slice(0, 128)
        ?? `${pseudonym}-${now}`;
    const accuracyScore = 1 - Math.min(1, accuracyMeters / MAX_ACCURACY_METERS);
    const corridorScore = 1 - Math.min(1, trackDistanceMeters / MAX_CORRIDOR_DISTANCE_METERS);
    const motionScore = speedKph <= 100 ? 1 : 0.6;
    const confidence = clamp(
        0.35 + accuracyScore * 0.3 + corridorScore * 0.25 + motionScore * 0.05,
        0.35,
        0.95,
    );

    return {
        ok: true,
        status: 200,
        code: 'ok',
        message: 'Crowd presence accepted.',
        sampleId,
        accuracyMeters,
        train: {
            id: `CROWD-${pseudonym}`,
            sampleId,
            deviceId: pseudonym,
            lineId,
            direction,
            lat,
            lng,
            speedKph,
            statusCode,
            stationId: station?.id ?? null,
            stationName: station?.name ?? null,
            source: 'crowd',
            updatedAt: now,
            confidence,
            sourceCount: 1,
        },
    };
}
