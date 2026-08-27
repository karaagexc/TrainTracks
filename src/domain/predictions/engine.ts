import { getSegmentDistance } from '@/data/segmentDistances';
import { getLineStations, isBuiltLine, isForwardDirection, isRailLine } from '@/domain/railway';
import { getTrackGeometryPosition } from '@/domain/predictions/trackGeometry';
import { MANILA_TIMEZONE } from '@/domain/time/manila';
import type { Direction, OperationalMode, RailLineId, Station } from '@/types';
import type { TrainPresence, TrainPresenceStatus } from '@/types/train';
import { getDistanceKm } from '@/utils/geo';

export type PredictionScope = 'map' | 'station';
export type PredictionConfidence = 'high' | 'medium' | 'low' | 'unavailable';
export type PredictionServiceState =
    | 'active'
    | 'not_yet_started'
    | 'service_closed'
    | 'last_train_passed'
    | 'service_suspended'
    | 'unavailable'
    | 'invalid_request';

export type ServiceDayType =
    | 'weekday'
    | 'monday_am_peak'
    | 'friday_pm_peak'
    | 'saturday'
    | 'sunday_or_regular_holiday'
    | 'special_holiday'
    | 'major_maintenance';

export type PredictionReasonCode =
    | 'scheduled_dispatch'
    | 'daypart_headway'
    | 'time_based_dispatch'
    | 'capacity_cap'
    | 'station_propagation'
    | 'near_service_edge'
    | 'weekend_profile'
    | 'holiday_profile'
    | 'lrt2_variable_fleet'
    | 'service_closed'
    | 'service_suspended'
    | 'live_network_only';

export interface PredictedTrain extends TrainPresence {
    dispatchId: string;
    predictionScope: PredictionScope;
    predictionStatus: 'predicted_departing' | 'predicted_between_stations' | 'predicted_approaching' | 'predicted_arriving';
    etaSeconds: number | null;
    etaWindowSeconds: number;
    arrivalTime: string | null;
    departureTime: string | null;
    confidenceLevel: PredictionConfidence;
    reasonCodes: PredictionReasonCode[];
    validUntil: number;
}

export interface PredictionProvenance {
    category: 'schedule_model';
    realtimeVehicleFeed: false;
    inputs: Array<'service_window' | 'headway_profile' | 'track_geometry'>;
    sourceRefs: string[];
}

export interface PredictionResponse {
    generatedAt: string;
    validUntil: string;
    timezone: 'Asia/Manila';
    dayType: ServiceDayType;
    serviceState: PredictionServiceState;
    sourceVersion: string;
    provenance: PredictionProvenance;
    predictions: PredictedTrain[];
    message?: string;
}

export interface PredictionRequest {
    now?: Date;
    lineId?: RailLineId | null;
    direction?: Direction | null;
    stationId?: string | null;
    scope?: PredictionScope;
    mode?: OperationalMode;
    limit?: number;
}

interface ManilaParts {
    year: number;
    month: number;
    day: number;
    weekday: string;
    minutesOfDay: number;
    dateKey: string;
}

interface DirectionSchedule {
    weekday: { first: string; last: string };
    weekendHoliday: { first: string; last: string };
}

interface DaypartServiceProfile {
    name: string;
    headwayMinutes: number;
    etaWindowSeconds: number;
    maxActiveTrainsPerDirection: number;
    confidence: PredictionConfidence;
    reasonCodes: PredictionReasonCode[];
}

interface RouteStop {
    station: Station;
    arrivalSec: number;
    departureSec: number;
}

interface RouteSegment {
    from: Station;
    to: Station;
    startSec: number;
    endSec: number;
    distanceMeters: number;
}

interface PredictionMotionState {
    progress: number;
    speedKph: number;
    durationSec: number;
}

interface RouteTimeline {
    stations: Station[];
    stops: RouteStop[];
    segments: RouteSegment[];
    durationSec: number;
}

const SOURCE_VERSION = 'prediction-v1-dispatch-ledger-2026-05';
export const PREDICTION_PROVENANCE: PredictionProvenance = {
    category: 'schedule_model',
    realtimeVehicleFeed: false,
    inputs: ['service_window', 'headway_profile', 'track_geometry'],
    sourceRefs: [
        'https://lrmc.ph/',
        'https://www.lrta.gov.ph/train-operating-schedule/',
        'https://www.dotrmrt3.gov.ph/',
    ],
};const DEFAULT_LIMIT = 3;
const MAP_LOOKAHEAD_MS = 0;
const STATION_LOOKAHEAD_MS = 45 * 60_000;
const STATION_GRACE_MS = 45_000;
const API_VALID_MS = 25_000;
const MIN_HEADWAY_MINUTES = 2;
const PREDICTION_ACCELERATION_MPS2 = 0.9;
const PREDICTION_DECELERATION_MPS2 = 1.15;
const LIVE_LINES: RailLineId[] = ['LRT1', 'LRT2', 'MRT3'];
const ALL_PREDICTABLE_LINES: RailLineId[] = ['LRT1', 'LRT2', 'MRT3'];

const LINE_DIRECTIONS: Partial<Record<RailLineId, Direction[]>> = {
    LRT1: ['SOUTHBOUND', 'NORTHBOUND'],
    LRT2: ['EASTBOUND', 'WESTBOUND'],
    MRT3: ['SOUTHBOUND', 'NORTHBOUND'],
    MRT7: ['SOUTHBOUND', 'NORTHBOUND'],
};

const SCHEDULES: Partial<Record<RailLineId, Partial<Record<Direction, DirectionSchedule>>>> = {
    LRT1: {
        SOUTHBOUND: {
            weekday: { first: '04:30', last: '22:45' },
            weekendHoliday: { first: '05:00', last: '21:45' },
        },
        NORTHBOUND: {
            weekday: { first: '04:30', last: '22:30' },
            weekendHoliday: { first: '05:00', last: '21:30' },
        },
    },
    LRT2: {
        EASTBOUND: {
            weekday: { first: '05:00', last: '21:30' },
            weekendHoliday: { first: '05:00', last: '21:30' },
        },
        WESTBOUND: {
            weekday: { first: '05:00', last: '21:00' },
            weekendHoliday: { first: '05:00', last: '21:00' },
        },
    },
    MRT3: {
        SOUTHBOUND: {
            weekday: { first: '04:30', last: '21:30' },
            weekendHoliday: { first: '04:30', last: '21:30' },
        },
        NORTHBOUND: {
            weekday: { first: '05:05', last: '22:11' },
            weekendHoliday: { first: '05:18', last: '22:09' },
        },
    },
};

const HOLIDAY_DATES = new Set([
    '2026-01-01',
    '2026-04-09',
    '2026-05-01',
    '2026-05-27',
    '2026-06-12',
    '2026-08-31',
    '2026-11-30',
    '2026-12-25',
    '2026-12-30',
]);

const MAJOR_MAINTENANCE_DATES = new Set([
    '2026-04-02',
    '2026-04-03',
    '2026-04-04',
    '2026-04-05',
]);

function pad(value: number): string {
    return String(value).padStart(2, '0');
}

function getManilaParts(date: Date): ManilaParts {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: MANILA_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).formatToParts(date);

    const byType = new Map(parts.map((part) => [part.type, part.value]));
    const year = Number(byType.get('year'));
    const month = Number(byType.get('month'));
    const day = Number(byType.get('day'));
    const rawHour = Number(byType.get('hour'));
    const hour = rawHour === 24 ? 0 : rawHour;
    const minute = Number(byType.get('minute'));
    const dateKey = `${year}-${pad(month)}-${pad(day)}`;

    return {
        year,
        month,
        day,
        weekday: byType.get('weekday') ?? 'Mon',
        minutesOfDay: hour * 60 + minute,
        dateKey,
    };
}

function manilaTimeToMs(parts: ManilaParts, time: string): number {
    const [hourText, minuteText] = time.split(':');
    const hour = Number(hourText);
    const minute = Number(minuteText);
    return Date.parse(`${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(hour)}:${pad(minute)}:00+08:00`);
}

function iso(ms: number | null): string | null {
    return ms === null ? null : new Date(ms).toISOString();
}

function resolveDayType(parts: ManilaParts): ServiceDayType {
    if (MAJOR_MAINTENANCE_DATES.has(parts.dateKey)) return 'major_maintenance';
    if (parts.weekday === 'Sat') return 'saturday';
    if (parts.weekday === 'Sun') return 'sunday_or_regular_holiday';
    if (HOLIDAY_DATES.has(parts.dateKey)) return 'special_holiday';
    if (parts.weekday === 'Mon' && parts.minutesOfDay >= 7 * 60 && parts.minutesOfDay <= 9 * 60) return 'monday_am_peak';
    if (parts.weekday === 'Fri' && parts.minutesOfDay >= 16 * 60 && parts.minutesOfDay <= 22 * 60) return 'friday_pm_peak';
    return 'weekday';
}

function isWeekendOrHoliday(dayType: ServiceDayType): boolean {
    return dayType === 'saturday' || dayType === 'sunday_or_regular_holiday' || dayType === 'special_holiday';
}

function lowerConfidence(confidence: PredictionConfidence): PredictionConfidence {
    if (confidence === 'high') return 'medium';
    if (confidence === 'medium') return 'low';
    return confidence;
}

function confidenceScore(confidence: PredictionConfidence): number {
    switch (confidence) {
        case 'high':
            return 0.82;
        case 'medium':
            return 0.62;
        case 'low':
            return 0.42;
        default:
            return 0;
    }
}

function getSchedule(lineId: RailLineId, direction: Direction, dayType: ServiceDayType): DirectionSchedule['weekday'] | null {
    const schedule = SCHEDULES[lineId]?.[direction];
    if (!schedule || dayType === 'major_maintenance') return null;
    return isWeekendOrHoliday(dayType) ? schedule.weekendHoliday : schedule.weekday;
}

function getServiceProfile(lineId: RailLineId, dayType: ServiceDayType, minutesOfDay: number): DaypartServiceProfile {
    const weekend = dayType === 'saturday' || dayType === 'sunday_or_regular_holiday' || dayType === 'special_holiday';
    const holiday = dayType === 'special_holiday' || dayType === 'sunday_or_regular_holiday';
    const fridayPm = dayType === 'friday_pm_peak';
    const mondayAm = dayType === 'monday_am_peak';

    if (lineId === 'MRT3') {
        if (weekend) {
            if (minutesOfDay >= 19 * 60) {
                return { name: 'weekend_evening', headwayMinutes: 7, etaWindowSeconds: 180, maxActiveTrainsPerDirection: 6, confidence: 'medium', reasonCodes: ['weekend_profile'] };
            }
            return { name: holiday ? 'holiday' : 'saturday', headwayMinutes: 6, etaWindowSeconds: 150, maxActiveTrainsPerDirection: 8, confidence: 'medium', reasonCodes: holiday ? ['holiday_profile'] : ['weekend_profile'] };
        }
        if ((minutesOfDay >= 7 * 60 && minutesOfDay <= 9 * 60) || (minutesOfDay >= 17 * 60 && minutesOfDay <= 19 * 60) || mondayAm || fridayPm) {
            return { name: 'weekday_peak', headwayMinutes: 3.5, etaWindowSeconds: 90, maxActiveTrainsPerDirection: 10, confidence: 'high', reasonCodes: ['daypart_headway'] };
        }
        if (minutesOfDay >= 19 * 60 && minutesOfDay <= 21 * 60 + 30) {
            return { name: 'weekday_night', headwayMinutes: 8, etaWindowSeconds: 210, maxActiveTrainsPerDirection: 7, confidence: 'medium', reasonCodes: ['daypart_headway'] };
        }
        if (minutesOfDay > 21 * 60 + 30) {
            return { name: 'weekday_extended', headwayMinutes: 15, etaWindowSeconds: 360, maxActiveTrainsPerDirection: 3, confidence: 'low', reasonCodes: ['daypart_headway'] };
        }
        return { name: 'weekday_offpeak', headwayMinutes: 5.5, etaWindowSeconds: 150, maxActiveTrainsPerDirection: 7, confidence: 'medium', reasonCodes: ['daypart_headway'] };
    }

    if (lineId === 'LRT1') {
        if (weekend) {
            const isSundayLike = dayType === 'sunday_or_regular_holiday' || dayType === 'special_holiday';
            return {
                name: isSundayLike ? 'sunday_holiday' : 'saturday',
                headwayMinutes: isSundayLike ? 7 : 6,
                etaWindowSeconds: isSundayLike ? 240 : 180,
                maxActiveTrainsPerDirection: isSundayLike ? 7 : 9,
                confidence: isSundayLike ? 'medium' : 'medium',
                reasonCodes: isSundayLike ? ['holiday_profile'] : ['weekend_profile'],
            };
        }
        if ((minutesOfDay >= 6 * 60 + 30 && minutesOfDay <= 9 * 60) || (minutesOfDay >= 16 * 60 + 30 && minutesOfDay <= 20 * 60) || mondayAm || fridayPm) {
            return { name: 'weekday_peak', headwayMinutes: 4, etaWindowSeconds: 120, maxActiveTrainsPerDirection: 12, confidence: 'high', reasonCodes: ['daypart_headway'] };
        }
        if (minutesOfDay >= 20 * 60) {
            return { name: 'weekday_night', headwayMinutes: 8, etaWindowSeconds: 240, maxActiveTrainsPerDirection: 5, confidence: 'medium', reasonCodes: ['daypart_headway'] };
        }
        if (minutesOfDay < 6 * 60 + 30) {
            return { name: 'weekday_startup', headwayMinutes: 4, etaWindowSeconds: 150, maxActiveTrainsPerDirection: 5, confidence: 'medium', reasonCodes: ['daypart_headway'] };
        }
        return { name: 'weekday_offpeak', headwayMinutes: 6, etaWindowSeconds: 180, maxActiveTrainsPerDirection: 8, confidence: 'medium', reasonCodes: ['daypart_headway'] };
    }

    if (lineId === 'LRT2') {
        if (weekend) {
            return {
                name: holiday ? 'holiday_variable_fleet' : 'weekend_variable_fleet',
                headwayMinutes: 11,
                etaWindowSeconds: 360,
                maxActiveTrainsPerDirection: 4,
                confidence: 'low',
                reasonCodes: [holiday ? 'holiday_profile' : 'weekend_profile', 'lrt2_variable_fleet'],
            };
        }
        if ((minutesOfDay >= 6 * 60 + 30 && minutesOfDay <= 9 * 60) || (minutesOfDay >= 16 * 60 + 30 && minutesOfDay <= 20 * 60) || mondayAm || fridayPm) {
            return { name: 'weekday_peak_variable_fleet', headwayMinutes: 7.5, etaWindowSeconds: 300, maxActiveTrainsPerDirection: 5, confidence: 'medium', reasonCodes: ['daypart_headway', 'lrt2_variable_fleet'] };
        }
        if (minutesOfDay >= 20 * 60) {
            return { name: 'weekday_night_variable_fleet', headwayMinutes: 12, etaWindowSeconds: 420, maxActiveTrainsPerDirection: 3, confidence: 'low', reasonCodes: ['daypart_headway', 'lrt2_variable_fleet'] };
        }
        return { name: 'weekday_offpeak_variable_fleet', headwayMinutes: 10, etaWindowSeconds: 360, maxActiveTrainsPerDirection: 4, confidence: 'low', reasonCodes: ['daypart_headway', 'lrt2_variable_fleet'] };
    }

    return { name: 'unavailable', headwayMinutes: 10, etaWindowSeconds: 600, maxActiveTrainsPerDirection: 0, confidence: 'unavailable', reasonCodes: [] };
}

function getRouteStations(lineId: RailLineId, direction: Direction, mode: OperationalMode): Station[] {
    const stations = getLineStations(lineId, mode, mode === 'sandbox' ? 'WITH_NA' : 'OFF');
    return isForwardDirection(direction) ? stations : [...stations].reverse();
}

function getSegmentSeconds(from: Station, to: Station): number {
    const knownDistance = getSegmentDistance(from.id, to.id);
    const distanceMeters = knownDistance ?? getDistanceKm(from, to) * 1000;
    const lineId = isRailLine(from.lineId) ? from.lineId : 'LRT1';
    return Math.max(1, Math.round(getPredictionMotionState(lineId, distanceMeters, Number.MAX_SAFE_INTEGER).durationSec));
}

function getSegmentMeters(from: Station, to: Station): number {
    return getSegmentDistance(from.id, to.id) ?? Math.round(getDistanceKm(from, to) * 1000);
}

function getDwellSeconds(station: Station, profile: DaypartServiceProfile): number {
    if (station.transfers?.length) return profile.confidence === 'high' ? 42 : 50;
    if (profile.name.includes('peak')) return 35;
    return 28;
}

function buildTimeline(stations: Station[], profile: DaypartServiceProfile): RouteTimeline {
    let cursorSec = 0;
    const stops: RouteStop[] = [{ station: stations[0], arrivalSec: 0, departureSec: 0 }];
    const segments: RouteSegment[] = [];

    for (let index = 1; index < stations.length; index += 1) {
        const from = stations[index - 1];
        const to = stations[index];
        const travelSec = getSegmentSeconds(from, to);
        const startSec = cursorSec;
        const arrivalSec = cursorSec + travelSec;
        const dwellSec = index === stations.length - 1 ? 0 : getDwellSeconds(to, profile);
        const departureSec = arrivalSec + dwellSec;

        segments.push({
            from,
            to,
            startSec,
            endSec: arrivalSec,
            distanceMeters: getSegmentMeters(from, to),
        });
        stops.push({ station: to, arrivalSec, departureSec });
        cursorSec = departureSec;
    }

    return {
        stations,
        stops,
        segments,
        durationSec: cursorSec,
    };
}

function buildDispatches(parts: ManilaParts, lineId: RailLineId, direction: Direction, dayType: ServiceDayType, untilMs: number): number[] {
    const schedule = getSchedule(lineId, direction, dayType);
    if (!schedule) return [];

    const firstMs = manilaTimeToMs(parts, schedule.first);
    const lastMs = manilaTimeToMs(parts, schedule.last);
    const dispatches: number[] = [];
    let cursorMs = firstMs;
    let guard = 0;

    while (cursorMs <= lastMs && cursorMs <= untilMs && guard < 600) {
        dispatches.push(cursorMs);
        const cursorParts = getManilaParts(new Date(cursorMs));
        const profile = getServiceProfile(lineId, dayType, cursorParts.minutesOfDay);
        const headwayMs = Math.max(MIN_HEADWAY_MINUTES, profile.headwayMinutes) * 60_000;
        cursorMs += headwayMs;
        guard += 1;
    }

    return dispatches;
}

function getLineServiceState(
    parts: ManilaParts,
    lineId: RailLineId,
    direction: Direction,
    dayType: ServiceDayType,
    nowMs: number,
    routeDurationSec: number,
): PredictionServiceState {
    if (dayType === 'major_maintenance') return 'service_suspended';
    if (!isBuiltLine(lineId)) return 'unavailable';
    const schedule = getSchedule(lineId, direction, dayType);
    if (!schedule) return 'unavailable';

    const firstMs = manilaTimeToMs(parts, schedule.first);
    const lastMs = manilaTimeToMs(parts, schedule.last);
    if (nowMs < firstMs) return 'not_yet_started';
    if (nowMs > lastMs + routeDurationSec * 1000) return 'last_train_passed';
    if (nowMs > lastMs) return 'service_closed';
    return 'active';
}

function applyServiceEdgeConfidence(
    confidence: PredictionConfidence,
    dispatchMs: number,
    firstMs: number,
    lastMs: number,
): { confidence: PredictionConfidence; nearEdge: boolean } {
    const edgeWindowMs = 12 * 60_000;
    const nearEdge = dispatchMs - firstMs <= edgeWindowMs || lastMs - dispatchMs <= edgeWindowMs;
    return {
        confidence: nearEdge ? lowerConfidence(confidence) : confidence,
        nearEdge,
    };
}

function interpolate(from: Station, to: Station, progress: number): { lat: number; lng: number } {
    const clamped = Math.max(0, Math.min(1, progress));
    return {
        lat: from.latitude + (to.latitude - from.latitude) * clamped,
        lng: from.longitude + (to.longitude - from.longitude) * clamped,
    };
}

function getPredictionCruiseSpeedKph(lineId: RailLineId): number {
    if (lineId === 'LRT2') return 80;
    return 60;
}

function getPredictionMotionState(lineId: RailLineId, distanceMeters: number, elapsedSec: number): PredictionMotionState {
    const cruiseMps = getPredictionCruiseSpeedKph(lineId) / 3.6;
    const accel = PREDICTION_ACCELERATION_MPS2;
    const decel = PREDICTION_DECELERATION_MPS2;
    const accelDistance = (cruiseMps * cruiseMps) / (2 * accel);
    const decelDistance = (cruiseMps * cruiseMps) / (2 * decel);
    const hasCruise = distanceMeters > accelDistance + decelDistance;

    let durationSec: number;
    let coveredMeters: number;
    let speedMps: number;

    if (hasCruise) {
        const accelTime = cruiseMps / accel;
        const cruiseDistance = distanceMeters - accelDistance - decelDistance;
        const cruiseTime = cruiseDistance / cruiseMps;
        const decelTime = cruiseMps / decel;
        durationSec = accelTime + cruiseTime + decelTime;
        const t = Math.max(0, Math.min(elapsedSec, durationSec));

        if (t <= accelTime) {
            speedMps = accel * t;
            coveredMeters = 0.5 * accel * t * t;
        } else if (t <= accelTime + cruiseTime) {
            speedMps = cruiseMps;
            coveredMeters = accelDistance + cruiseMps * (t - accelTime);
        } else {
            const brakeTime = t - accelTime - cruiseTime;
            speedMps = Math.max(0, cruiseMps - decel * brakeTime);
            coveredMeters = accelDistance + cruiseDistance + cruiseMps * brakeTime - 0.5 * decel * brakeTime * brakeTime;
        }
    } else {
        const peakMps = Math.sqrt((2 * distanceMeters * accel * decel) / (accel + decel));
        const accelTime = peakMps / accel;
        const decelTime = peakMps / decel;
        const peakDistance = (peakMps * peakMps) / (2 * accel);
        durationSec = accelTime + decelTime;
        const t = Math.max(0, Math.min(elapsedSec, durationSec));

        if (t <= accelTime) {
            speedMps = accel * t;
            coveredMeters = 0.5 * accel * t * t;
        } else {
            const brakeTime = t - accelTime;
            speedMps = Math.max(0, peakMps - decel * brakeTime);
            coveredMeters = peakDistance + peakMps * brakeTime - 0.5 * decel * brakeTime * brakeTime;
        }
    }

    return {
        progress: Math.max(0, Math.min(1, coveredMeters / Math.max(1, distanceMeters))),
        speedKph: Math.round(speedMps * 3.6),
        durationSec,
    };
}

function buildDispatchId(lineId: RailLineId, direction: Direction, dispatchMs: number): string {
    return `${lineId}-${direction}-${new Date(dispatchMs).toISOString().replace(/[-:.]/g, '')}`;
}

function buildBasePrediction({
    id,
    dispatchId,
    lineId,
    direction,
    nowMs,
    validUntil,
    profile,
    confidence,
    reasonCodes,
    predictionScope,
    predictionStatus,
    etaSeconds,
    arrivalMs,
    departureMs,
    lat,
    lng,
    speedKph,
    statusCode,
    station,
}: {
    id: string;
    dispatchId: string;
    lineId: RailLineId;
    direction: Direction;
    nowMs: number;
    validUntil: number;
    profile: DaypartServiceProfile;
    confidence: PredictionConfidence;
    reasonCodes: PredictionReasonCode[];
    predictionScope: PredictionScope;
    predictionStatus: PredictedTrain['predictionStatus'];
    etaSeconds: number | null;
    arrivalMs: number | null;
    departureMs: number | null;
    lat: number;
    lng: number;
    speedKph: number;
    statusCode: TrainPresenceStatus;
    station: Station | null;
}): PredictedTrain {
    return {
        id,
        dispatchId,
        lineId,
        direction,
        lat,
        lng,
        speedKph,
        statusCode,
        stationId: station?.id ?? null,
        stationName: station?.name ?? null,
        source: 'predicted',
        updatedAt: nowMs,
        confidence: confidenceScore(confidence),
        sourceCount: 1,
        predictionScope,
        predictionStatus,
        etaSeconds,
        etaWindowSeconds: profile.etaWindowSeconds,
        arrivalTime: iso(arrivalMs),
        departureTime: iso(departureMs),
        confidenceLevel: confidence,
        reasonCodes: Array.from(new Set(reasonCodes)),
        validUntil,
    };
}

function mapPredictionForDispatch(
    timeline: RouteTimeline,
    lineId: RailLineId,
    direction: Direction,
    dispatchMs: number,
    nowMs: number,
    validUntil: number,
    profile: DaypartServiceProfile,
    firstMs: number,
    lastMs: number,
): PredictedTrain | null {
    const elapsedSec = (nowMs - dispatchMs) / 1000;
    if (elapsedSec < 0 || elapsedSec > timeline.durationSec) return null;

    const dispatchId = buildDispatchId(lineId, direction, dispatchMs);
    const edgeConfidence = applyServiceEdgeConfidence(profile.confidence, dispatchMs, firstMs, lastMs);
    const reasonCodes: PredictionReasonCode[] = [
        'scheduled_dispatch',
        'time_based_dispatch',
        'station_propagation',
        ...profile.reasonCodes,
    ];
    if (edgeConfidence.nearEdge) reasonCodes.push('near_service_edge');

    const dwellStop = timeline.stops.find((stop, index) => (
        index > 0 &&
        index < timeline.stops.length - 1 &&
        elapsedSec >= stop.arrivalSec &&
        elapsedSec <= stop.departureSec
    ));

    if (dwellStop) {
        return buildBasePrediction({
            id: `PRED-MAP-${dispatchId}`,
            dispatchId,
            lineId,
            direction,
            nowMs,
            validUntil,
            profile,
            confidence: edgeConfidence.confidence,
            reasonCodes,
            predictionScope: 'map',
            predictionStatus: 'predicted_arriving',
            etaSeconds: 0,
            arrivalMs: dispatchMs + dwellStop.arrivalSec * 1000,
            departureMs: dispatchMs + dwellStop.departureSec * 1000,
            lat: dwellStop.station.latitude,
            lng: dwellStop.station.longitude,
            speedKph: 0,
            statusCode: 'AT_STATION',
            station: dwellStop.station,
        });
    }

    const segment = timeline.segments.find((candidate) => elapsedSec >= candidate.startSec && elapsedSec <= candidate.endSec);
    if (!segment) {
        const terminal = elapsedSec <= 0 ? timeline.stops[0] : timeline.stops[timeline.stops.length - 1];
        return buildBasePrediction({
            id: `PRED-MAP-${dispatchId}`,
            dispatchId,
            lineId,
            direction,
            nowMs,
            validUntil,
            profile,
            confidence: edgeConfidence.confidence,
            reasonCodes,
            predictionScope: 'map',
            predictionStatus: elapsedSec <= 0 ? 'predicted_departing' : 'predicted_arriving',
            etaSeconds: elapsedSec <= 0 ? 0 : null,
            arrivalMs: dispatchMs + terminal.arrivalSec * 1000,
            departureMs: dispatchMs + terminal.departureSec * 1000,
            lat: terminal.station.latitude,
            lng: terminal.station.longitude,
            speedKph: 0,
            statusCode: elapsedSec <= 0 ? 'LEAVING_STATION' : 'APPROACHING_STATION',
            station: terminal.station,
        });
    }

    const motion = getPredictionMotionState(lineId, segment.distanceMeters, elapsedSec - segment.startSec);
    const progress = motion.progress;
    const trackLocation = getTrackGeometryPosition(lineId, segment.from, segment.to, progress);
    const location = trackLocation
        ? { lat: trackLocation.latitude, lng: trackLocation.longitude }
        : interpolate(segment.from, segment.to, progress);
    const targetStop = timeline.stops.find((stop) => stop.station.id === segment.to.id) ?? null;
    const etaSeconds = targetStop ? Math.max(0, Math.round(dispatchMs / 1000 + targetStop.arrivalSec - nowMs / 1000)) : null;
    const speedKph = motion.speedKph;
    const statusCode: TrainPresenceStatus = progress < 0.18
        ? 'LEAVING_STATION'
        : progress > 0.72
            ? 'APPROACHING_STATION'
            : 'IN_TRANSIT';
    const station = statusCode === 'LEAVING_STATION' ? segment.from : segment.to;

    return buildBasePrediction({
        id: `PRED-MAP-${dispatchId}`,
        dispatchId,
        lineId,
        direction,
        nowMs,
        validUntil,
        profile,
        confidence: edgeConfidence.confidence,
        reasonCodes,
        predictionScope: 'map',
        predictionStatus: statusCode === 'LEAVING_STATION'
            ? 'predicted_departing'
            : statusCode === 'APPROACHING_STATION'
                ? 'predicted_approaching'
                : 'predicted_between_stations',
        etaSeconds,
        arrivalMs: targetStop ? dispatchMs + targetStop.arrivalSec * 1000 : null,
        departureMs: targetStop ? dispatchMs + targetStop.departureSec * 1000 : null,
        lat: location.lat,
        lng: location.lng,
        speedKph,
        statusCode,
        station,
    });
}

function stationPredictionForDispatch(
    timeline: RouteTimeline,
    station: Station,
    lineId: RailLineId,
    direction: Direction,
    dispatchMs: number,
    nowMs: number,
    validUntil: number,
    profile: DaypartServiceProfile,
    firstMs: number,
    lastMs: number,
): PredictedTrain | null {
    const stop = timeline.stops.find((candidate) => candidate.station.id === station.id);
    if (!stop) return null;

    const arrivalMs = dispatchMs + stop.arrivalSec * 1000;
    const departureMs = dispatchMs + stop.departureSec * 1000;
    if (departureMs < nowMs - STATION_GRACE_MS) return null;
    if (arrivalMs > nowMs + STATION_LOOKAHEAD_MS) return null;

    const dispatchId = buildDispatchId(lineId, direction, dispatchMs);
    const edgeConfidence = applyServiceEdgeConfidence(profile.confidence, dispatchMs, firstMs, lastMs);
    const reasonCodes: PredictionReasonCode[] = [
        'scheduled_dispatch',
        'time_based_dispatch',
        'station_propagation',
        ...profile.reasonCodes,
    ];
    if (edgeConfidence.nearEdge) reasonCodes.push('near_service_edge');

    const etaSeconds = Math.max(0, Math.round((arrivalMs - nowMs) / 1000));
    const statusCode: TrainPresenceStatus = arrivalMs <= nowMs && departureMs >= nowMs
        ? 'AT_STATION'
        : etaSeconds <= 90
            ? 'APPROACHING_STATION'
            : 'IN_TRANSIT';

    return buildBasePrediction({
        id: `PRED-STATION-${station.id}-${dispatchId}`,
        dispatchId,
        lineId,
        direction,
        nowMs,
        validUntil,
        profile,
        confidence: edgeConfidence.confidence,
        reasonCodes,
        predictionScope: 'station',
        predictionStatus: arrivalMs <= nowMs && departureMs >= nowMs
            ? 'predicted_arriving'
            : etaSeconds <= 90
                ? 'predicted_approaching'
                : 'predicted_between_stations',
        etaSeconds,
        arrivalMs,
        departureMs,
        lat: station.latitude,
        lng: station.longitude,
        speedKph: 0,
        statusCode,
        station,
    });
}

function getDirectionPredictions({
    parts,
    dayType,
    lineId,
    direction,
    station,
    scope,
    mode,
    limit,
    nowMs,
    validUntil,
}: {
    parts: ManilaParts;
    dayType: ServiceDayType;
    lineId: RailLineId;
    direction: Direction;
    station: Station | null;
    scope: PredictionScope;
    mode: OperationalMode;
    limit: number;
    nowMs: number;
    validUntil: number;
}): { predictions: PredictedTrain[]; serviceState: PredictionServiceState } {
    const profile = getServiceProfile(lineId, dayType, parts.minutesOfDay);
    const stations = getRouteStations(lineId, direction, mode);
    if (!stations.length || profile.confidence === 'unavailable') {
        return { predictions: [], serviceState: 'unavailable' };
    }

    const timeline = buildTimeline(stations, profile);
    const serviceState = getLineServiceState(parts, lineId, direction, dayType, nowMs, timeline.durationSec);
    if (serviceState === 'service_suspended' || serviceState === 'not_yet_started' || serviceState === 'last_train_passed' || serviceState === 'unavailable') {
        return { predictions: [], serviceState };
    }

    const schedule = getSchedule(lineId, direction, dayType);
    if (!schedule) return { predictions: [], serviceState: 'unavailable' };
    const firstMs = manilaTimeToMs(parts, schedule.first);
    const lastMs = manilaTimeToMs(parts, schedule.last);
    const lookaheadMs = scope === 'station' ? STATION_LOOKAHEAD_MS : MAP_LOOKAHEAD_MS;
    const dispatches = buildDispatches(parts, lineId, direction, dayType, nowMs + lookaheadMs);

    if (scope === 'map') {
        const active = dispatches
            .filter((dispatchMs) => dispatchMs <= nowMs && dispatchMs + timeline.durationSec * 1000 >= nowMs)
            .map((dispatchMs) => mapPredictionForDispatch(timeline, lineId, direction, dispatchMs, nowMs, validUntil, profile, firstMs, lastMs))
            .filter((prediction): prediction is PredictedTrain => !!prediction)
            .sort((left, right) => left.dispatchId.localeCompare(right.dispatchId));

        const capped = active.length > profile.maxActiveTrainsPerDirection
            ? active.slice(active.length - profile.maxActiveTrainsPerDirection)
            : active;

        return {
            predictions: capped.slice(0, Math.max(1, limit)),
            serviceState,
        };
    }

    if (!station) return { predictions: [], serviceState: 'invalid_request' };

    const stationPredictions = dispatches
        .map((dispatchMs) => stationPredictionForDispatch(timeline, station, lineId, direction, dispatchMs, nowMs, validUntil, profile, firstMs, lastMs))
        .filter((prediction): prediction is PredictedTrain => !!prediction)
        .sort((left, right) => (left.etaSeconds ?? Number.MAX_SAFE_INTEGER) - (right.etaSeconds ?? Number.MAX_SAFE_INTEGER))
        .slice(0, Math.max(1, limit));

    return {
        predictions: stationPredictions,
        serviceState,
    };
}

function combineServiceState(states: PredictionServiceState[]): PredictionServiceState {
    if (states.includes('active')) return 'active';
    if (states.includes('service_closed')) return 'service_closed';
    if (states.includes('not_yet_started')) return 'not_yet_started';
    if (states.includes('last_train_passed')) return 'last_train_passed';
    if (states.includes('service_suspended')) return 'service_suspended';
    if (states.includes('invalid_request')) return 'invalid_request';
    return states[0] ?? 'unavailable';
}

export function getPredictionResponse(request: PredictionRequest = {}): PredictionResponse {
    const now = request.now ?? new Date();
    const nowMs = now.getTime();
    const validUntil = nowMs + API_VALID_MS;
    const parts = getManilaParts(now);
    const dayType = resolveDayType(parts);
    const scope = request.scope ?? 'station';
    const mode = request.mode ?? 'live';
    const limit = Math.min(Math.max(1, request.limit ?? DEFAULT_LIMIT), 20);
    const station = request.stationId
        ? getLineStations(request.lineId ?? 'LRT1', mode, mode === 'sandbox' ? 'WITH_NA' : 'OFF').find((candidate) => candidate.id === request.stationId)
            ?? getLineStations('LRT2', mode, mode === 'sandbox' ? 'WITH_NA' : 'OFF').find((candidate) => candidate.id === request.stationId)
            ?? getLineStations('MRT3', mode, mode === 'sandbox' ? 'WITH_NA' : 'OFF').find((candidate) => candidate.id === request.stationId)
            ?? getLineStations('MRT7', mode, mode === 'sandbox' ? 'WITH_NA' : 'OFF').find((candidate) => candidate.id === request.stationId)
            ?? null
        : null;

    if (dayType === 'major_maintenance') {
        return {
            generatedAt: now.toISOString(),
            validUntil: iso(validUntil)!,
            timezone: MANILA_TIMEZONE,
            dayType,
            serviceState: 'service_suspended',
            sourceVersion: SOURCE_VERSION,
            provenance: PREDICTION_PROVENANCE,
            predictions: [],
            message: 'Rail predictions are disabled for the configured major maintenance window.',
        };
    }

    const requestedLines = request.lineId
        ? [request.lineId]
        : scope === 'station' && station
            ? isRailLine(station.lineId) ? [station.lineId] : []
            : mode === 'live'
                ? LIVE_LINES
                : ALL_PREDICTABLE_LINES;

    const predictions: PredictedTrain[] = [];
    const serviceStates: PredictionServiceState[] = [];

    requestedLines.forEach((lineId) => {
        if (!isRailLine(lineId)) {
            serviceStates.push('unavailable');
            return;
        }
        if (mode === 'live' && !isBuiltLine(lineId)) {
            serviceStates.push('unavailable');
            return;
        }
        if (!ALL_PREDICTABLE_LINES.includes(lineId)) {
            serviceStates.push('unavailable');
            return;
        }
        const directions = request.direction
            ? [request.direction]
            : LINE_DIRECTIONS[lineId] ?? [];

        directions.forEach((direction) => {
            const result = getDirectionPredictions({
                parts,
                dayType,
                lineId,
                direction,
                station: station?.lineId === lineId ? station : null,
                scope,
                mode,
                limit,
                nowMs,
                validUntil,
            });
            predictions.push(...result.predictions);
            serviceStates.push(result.serviceState);
        });
    });

    const sorted = predictions.sort((left, right) => {
        const etaLeft = left.etaSeconds ?? Number.MAX_SAFE_INTEGER;
        const etaRight = right.etaSeconds ?? Number.MAX_SAFE_INTEGER;
        return etaLeft - etaRight || left.lineId.localeCompare(right.lineId) || left.direction.localeCompare(right.direction);
    });

    return {
        generatedAt: now.toISOString(),
        validUntil: iso(validUntil)!,
        timezone: MANILA_TIMEZONE,
        dayType,
        serviceState: combineServiceState(serviceStates),
        sourceVersion: SOURCE_VERSION,
        provenance: PREDICTION_PROVENANCE,
        predictions: scope === 'map' && !request.lineId && !request.direction
            ? sorted
            : sorted.slice(0, limit),
    };
}
