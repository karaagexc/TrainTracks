import type { JourneySnapshot } from '@/domain/journey/types';
import type { Line7Mode, LineId, TicketType, TransitMode } from '@/types';

export const TRIP_CHECKPOINT_KEY = 'trip-checkpoint-v1';
export const TRIP_PREFERENCES_KEY = 'trip-preferences-v1';
export const TRIP_CHECKPOINT_VERSION = 1;
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
    version: 1;
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
    return Boolean(value) && typeof value === 'object';
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isJourneySnapshot(value: unknown): value is JourneySnapshot {
    if (!isObject(value) || !isObject(value.route)) return false;
    const route = value.route;
    const stationIds = route.stationIds;
    if (!Array.isArray(stationIds) || stationIds.length < 2 || !stationIds.every((id) => typeof id === 'string')) {
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
    if (typeof value.currentStationId !== 'string' || !stationIds.includes(value.currentStationId)) return false;
    return value.nextStationId === null
        || (typeof value.nextStationId === 'string' && stationIds.includes(value.nextStationId));
}

export function isActiveTripCheckpoint(value: unknown): value is ActiveTripCheckpoint {
    if (!isObject(value)) return false;
    const valid = value.version === TRIP_CHECKPOINT_VERSION
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
    if (!valid) return false;
    const snapshot = value.journeySnapshot;
    if (!isJourneySnapshot(snapshot)) return false;
    return snapshot.route?.originId === value.originId
        && snapshot.route?.destinationId === value.destinationId;
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