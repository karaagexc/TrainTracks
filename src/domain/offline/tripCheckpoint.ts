import type { JourneySnapshot } from '@/domain/journey/types';
import { getJourneyGraphForMode, getJourneyStationById } from '@/domain/journey/graph';
import type { Line7Mode, LineId, TicketType, TransitMode } from '@/types';

export const LEGACY_TRIP_CHECKPOINT_KEY = 'trip-checkpoint-v1';
export const TRIP_CHECKPOINT_KEY = 'trip-checkpoint-v2';
export const TRIP_PREFERENCES_KEY = 'trip-preferences-v1';
export const TRIP_CHECKPOINT_VERSION = 2;
export const AUTO_RESUME_MAX_AGE_MS = 20 * 60 * 1000;
export const RECOVERY_PROMPT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export type DataMode = 'auto' | 'standard' | 'saver';
export type ThemePreference = 'system' | 'light' | 'dark';

export interface PersistedTripPreferences {
    version: 1;
    favorites: Array<{ originId: string; destId: string }>;
    isMuted: boolean;
    notificationPreference: 'all' | 'destination' | 'none';
    themePreference: ThemePreference;
    showRushHour: boolean;
    dataMode: DataMode;
}

export interface ActiveTripCheckpoint {
    version: 2;
    ownerId: string | null;
    savedAt: number;
    tripStartedAt: number;
    originId: string;
    destinationId: string;
    transitMode: TransitMode;
    selectedLine: LineId | null;
    ticketType: TicketType | null;
    line7Mode: Line7Mode;
    isDevMode: boolean;
    runningFare: number;
    journeySnapshot: JourneySnapshot;
}

const LINE_IDS = new Set(['LRT1', 'LRT2', 'MRT3', 'MRT7', 'EDSA']);
const TICKET_TYPES = new Set(['SJT', 'SVC', 'CONCESSION', 'DEBIT', 'CREDIT', 'BUS_REGULAR']);
const ACTIVE_PHASES = new Set([
    'WAITING_AT_ORIGIN',
    'ONBOARD_DWELL',
    'ONBOARD_MOVING',
    'TRANSFER_WALK',
    'TRANSFER_WAIT',
]);
const STATUS_CODES = new Set([
    'WAITING_FOR_GPS',
    'AT_STATION',
    'LEAVING_STATION',
    'BETWEEN_STATIONS',
    'APPROACHING_STATION',
    'TRANSFER_ACTIVE',
]);

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isJourneySnapshot(value: unknown): value is JourneySnapshot {
    if (!isObject(value) || !isObject(value.route)) return false;
    const route = value.route;
    const stationIds = route.stationIds;
    if (!Array.isArray(stationIds) || stationIds.length < 2 || stationIds.length > 300
        || !stationIds.every((id) => typeof id === 'string' && getJourneyStationById(id))) {
        return false;
    }
    if (!Array.isArray(route.edges) || route.edges.length !== stationIds.length - 1) return false;
    if (!ACTIVE_PHASES.has(String(value.phase)) || !STATUS_CODES.has(String(value.statusCode))) return false;
    if (
        !Number.isInteger(value.activeEdgeIndex)
        || Number(value.activeEdgeIndex) < 0
        || Number(value.activeEdgeIndex) >= route.edges.length
    ) {
        return false;
    }
    const index = Number(value.activeEdgeIndex);
    if (value.currentStationId !== stationIds[index] || value.nextStationId !== stationIds[index + 1]) return false;
    if (route.originId !== stationIds[0] || route.destinationId !== stationIds.at(-1)) return false;
    const inRange = (key: string, maximum: number, nullable = false) => (
        (nullable && value[key] === null)
        || (isFiniteNumber(value[key]) && Number(value[key]) >= 0 && Number(value[key]) <= maximum)
    );
    if (!['legProgress', 'totalProgress', 'legProgressHighWater'].every((key) => inRange(key, 100))) return false;
    if (!['distanceToNextMeters', 'distanceToDestMeters', 'walkingDistanceMeters', 'projectedDistanceMeters',
        'projectedPathLengthMeters'].every((key) => inRange(key, 10_000_000, true))) return false;
    if (!inRange('estimatedSpeedKph', 250) || !inRange('uncertaintyMeters', 1_000_000)) return false;
    if (!['lastSampleAt', 'lastTrustedFixAt', 'lastEstimatorUpdateAt', 'stationCandidateSince', 'zeroSpeedSince',
        'recoveryStartedAt'].every((key) => inRange(key, 100_000_000_000_000, true))) return false;
    if (!Number.isInteger(value.stationCandidateSamples) || !inRange('stationCandidateSamples', 100_000)
        || ![0, 1, 2, 3].includes(value.statusLock as number)) return false;
    if (!['gpsFallbackActive', 'hasDepartedOrigin', 'hasDwelt'].every((key) => typeof value[key] === 'boolean')) return false;
    if (!['LIVE', 'COASTING', 'DEAD_RECKONING', 'STATION_DWELL', 'RECOVERING', 'UNCERTAIN'].includes(String(value.estimatorMode))
        || !['HIGH', 'MEDIUM', 'LOW'].includes(String(value.estimatorConfidence))) return false;
    if (value.direction !== null && !['NORTHBOUND', 'SOUTHBOUND', 'EASTBOUND', 'WESTBOUND'].includes(String(value.direction))) return false;
    if (!['displayStationId', 'visualOriginStationId', 'visualTargetStationId', 'stationCandidateId'].every((key) => (
        value[key] === null || (typeof value[key] === 'string' && stationIds.includes(value[key]))
    ))) return false;
    return ['lastLocation', 'estimatedLocation'].every((key) => {
        const coordinates = value[key];
        return coordinates === null || (isObject(coordinates)
            && isFiniteNumber(coordinates.latitude) && Math.abs(coordinates.latitude) <= 90
            && isFiniteNumber(coordinates.longitude) && Math.abs(coordinates.longitude) <= 180);
    });
}

export function parseActiveTripCheckpoint(value: unknown): ActiveTripCheckpoint | null {
    if (!isObject(value)) return null;
    const valid = (value.version === TRIP_CHECKPOINT_VERSION || value.version === 1)
        && isFiniteNumber(value.savedAt)
        && value.savedAt > 0
        && isFiniteNumber(value.tripStartedAt)
        && value.tripStartedAt > 0
        && value.tripStartedAt <= value.savedAt + 5 * 60_000
        && typeof value.originId === 'string'
        && typeof value.destinationId === 'string'
        && (value.transitMode === 'train' || value.transitMode === 'bus')
        && (value.selectedLine === null || LINE_IDS.has(String(value.selectedLine)))
        && (value.ticketType === null || TICKET_TYPES.has(String(value.ticketType)))
        && (value.line7Mode === 'OFF' || value.line7Mode === 'WITH_NA' || value.line7Mode === 'WITHOUT_NA')
        && typeof value.isDevMode === 'boolean'
        && isFiniteNumber(value.runningFare)
        && value.runningFare >= 0
        && value.runningFare <= 10_000;
    if (!valid || value.isDevMode) return null;
    if (value.version === 2 && value.ownerId !== null
        && (typeof value.ownerId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.ownerId))) return null;
    const snapshot = value.journeySnapshot;
    if (!isJourneySnapshot(snapshot) || !snapshot.route
        || snapshot.route.originId !== value.originId || snapshot.route.destinationId !== value.destinationId
        || snapshot.route.operationalMode !== 'live') return null;
    const allowedStatuses = snapshot.phase === 'ONBOARD_MOVING'
        ? ['LEAVING_STATION', 'BETWEEN_STATIONS', 'APPROACHING_STATION']
        : snapshot.phase === 'TRANSFER_WALK' ? ['TRANSFER_ACTIVE'] : ['AT_STATION'];
    if (snapshot.statusCode !== 'WAITING_FOR_GPS' && !allowedStatuses.includes(snapshot.statusCode)) return null;
    if (snapshot.phase === 'WAITING_AT_ORIGIN' && snapshot.activeEdgeIndex !== 0) return null;
    if (snapshot.stationCandidateId !== null && snapshot.stationCandidateId !== snapshot.currentStationId
        && snapshot.stationCandidateId !== snapshot.nextStationId) return null;
    if ((snapshot.stationCandidateId === null) !== (snapshot.stationCandidateSamples === 0)
        || (snapshot.stationCandidateId === null) !== (snapshot.stationCandidateSince === null)) return null;
    const timestampKeys = ['lastSampleAt', 'lastTrustedFixAt', 'lastEstimatorUpdateAt', 'stationCandidateSince',
        'zeroSpeedSince', 'recoveryStartedAt'] as const;
    if (timestampKeys.some((key) => snapshot[key] !== null && snapshot[key]! > Number(value.savedAt) + 5 * 60_000)) return null;
    if (snapshot.lastSampleAt !== null && snapshot.lastTrustedFixAt !== null && snapshot.lastTrustedFixAt > snapshot.lastSampleAt) return null;
    if (snapshot.stationCandidateSince !== null && (snapshot.lastSampleAt === null
        || snapshot.stationCandidateSince > snapshot.lastSampleAt)) return null;
    if (value.version === 2 && (typeof snapshot.tripId !== 'string' || snapshot.tripId.length > 160
        || snapshot.tripId.length < 1 || snapshot.startedAt !== value.tripStartedAt || snapshot.completedAt !== null
        || !Number.isInteger(snapshot.routeVersion) || snapshot.routeVersion < 1
        || !isFiniteNumber(snapshot.completedDistanceMeters) || snapshot.completedDistanceMeters < 0
        || snapshot.completedDistanceMeters > 10_000_000)) return null;
    const graph = getJourneyGraphForMode('live', value.line7Mode as Line7Mode, value.transitMode as TransitMode);
    const stationIds = snapshot.route.stationIds;
    const edges = stationIds.slice(0, -1).map((from, index) => (
        graph.adjacency[from]?.find((edge) => edge.toStationId === stationIds[index + 1])
    ));
    if (edges.some((edge) => !edge)) return null;
    const rebuiltEdges = edges.filter((edge): edge is NonNullable<typeof edge> => Boolean(edge));
    if (snapshot.phase === 'TRANSFER_WALK' && rebuiltEdges[snapshot.activeEdgeIndex].type !== 'transfer') return null;
    const totalDistanceMeters = rebuiltEdges.reduce((sum, edge) => sum + edge.distanceMeters, 0);
    const completedDistanceMeters = rebuiltEdges.slice(0, snapshot.activeEdgeIndex).reduce((sum, edge) => sum + edge.distanceMeters, 0)
        + rebuiltEdges[snapshot.activeEdgeIndex].distanceMeters * snapshot.legProgress / 100;
    const repairedSnapshot: JourneySnapshot = {
        ...snapshot,
        tripId: value.version === 2 ? snapshot.tripId : `legacy-${value.tripStartedAt}-${value.originId}`,
        startedAt: value.tripStartedAt as number,
        completedAt: null,
        routeVersion: value.version === 2 ? snapshot.routeVersion : 1,
        completedDistanceMeters,
        totalProgress: totalDistanceMeters > 0 ? completedDistanceMeters / totalDistanceMeters * 100 : 0,
        distanceToDestMeters: Math.max(0, totalDistanceMeters - completedDistanceMeters),
        route: { ...snapshot.route, edges: rebuiltEdges, totalDistanceMeters,
            totalTransferCount: rebuiltEdges.filter((edge) => edge.type === 'transfer').length,
            transitMode: value.transitMode as TransitMode },
    };
    return { ...(value as unknown as ActiveTripCheckpoint), version: 2,
        ownerId: value.version === 2 ? value.ownerId as string | null : null, journeySnapshot: repairedSnapshot };
}

export function isActiveTripCheckpoint(value: unknown): value is ActiveTripCheckpoint {
    return isObject(value) && value.version === 2 && parseActiveTripCheckpoint(value) !== null;
}

export function isPersistedTripPreferences(value: unknown): value is PersistedTripPreferences {
    if (!isObject(value) || value.version !== 1 || !Array.isArray(value.favorites)) return false;
    const validFavorites = value.favorites.length <= 100 && value.favorites.every((favorite) => (
        isObject(favorite)
        && typeof favorite.originId === 'string'
        && typeof favorite.destId === 'string'
    ));
    return validFavorites
        && typeof value.isMuted === 'boolean'
        && typeof value.showRushHour === 'boolean'
        && (value.notificationPreference === 'all'
            || value.notificationPreference === 'destination'
            || value.notificationPreference === 'none')
        && (value.themePreference === 'system'
            || value.themePreference === 'light'
            || value.themePreference === 'dark')
        && (value.dataMode === 'auto' || value.dataMode === 'standard' || value.dataMode === 'saver');
}

export function getCheckpointDisposition(
    checkpoint: ActiveTripCheckpoint,
    now = Date.now(),
): 'auto_resume' | 'prompt' | 'expired' {
    if (checkpoint.isDevMode) return 'expired';
    if (checkpoint.savedAt > now + 5 * 60_000) return 'expired';
    const ageMs = Math.max(0, now - checkpoint.savedAt);
    if (ageMs <= AUTO_RESUME_MAX_AGE_MS) return 'auto_resume';
    if (ageMs <= RECOVERY_PROMPT_MAX_AGE_MS) return 'prompt';
    return 'expired';
}
