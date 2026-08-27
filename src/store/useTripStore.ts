import { create } from 'zustand';
import { Direction, LegacyDirection, Line7Mode, Station, LineId, TicketType, TransitMode } from '@/types';
import { getPrecisionFare } from "@/utils/fareNew";
import { buildJourneyRoute, getJourneyRouteStations } from '@/domain/journey/routeBuilder';
import {
    createIdleJourneySnapshot,
    createJourneySnapshot,
    getJourneyCompatibilityStatus,
    reduceJourneySnapshot,
} from '@/domain/journey/engine';
import { JourneySnapshot } from '@/domain/journey/types';
import { getJourneyStationById } from '@/domain/journey/graph';
import { getDirectionForStations, getOperationalMode, normalizeDirection } from '@/domain/railway';
import type { CongestionConfig } from '@/domain/congestion/engine';
import type {
    ActiveTripCheckpoint,
    DataMode,
    PersistedTripPreferences,
    ThemePreference,
} from '@/domain/offline/tripCheckpoint';
interface TripState {
    // Live Navigation State
    walkingDistance: number | null;

    // Selection
    transitMode: TransitMode;
    selectedLine: LineId | null;
    origin: Station | null;
    destination: Station | null;
    ticketType: TicketType | null;

    // Route-First Architecture
    computedRoute: Station[];  // Cached getRoute(origin, destination)
    routeIndex: number;        // Current position in computedRoute
    journeySnapshot: JourneySnapshot;

    // Dynamic State
    currentStation: Station | null;
    nextStation: Station | null;
    status: 'IDLE' | 'WAITING' | 'TRANSIT' | 'ARRIVED';
    direction: Direction | null;
    runningFare: number;
    tripStartedAt: number | null;

    // Favorites
    favorites: { originId: string; destId: string }[];
    pendingTripRecovery: ActiveTripCheckpoint | null;
    persistenceHydrated: boolean;
    // Actions
    setTransitMode: (mode: TransitMode) => void;
    selectLine: (lineId: LineId) => void;
    setOrigin: (station: Station) => void;
    updateOriginKeepTrip: (station: Station) => void;
    setDestination: (station: Station | null) => void;
    setNextStation: (station: Station | null) => void;
    setCurrentStation: (station: Station | null) => void;
    setTicketType: (type: TicketType) => void;
    startTrip: () => void;
    endTrip: () => void;
    setStatus: (status: 'IDLE' | 'WAITING' | 'TRANSIT' | 'ARRIVED') => void;
    setDirection: (dir: Direction | LegacyDirection) => void;
    recomputeRoute: () => void;         // Rebuild computedRoute from origin+destination
    advanceToStation: (stationId: string) => void;  // THE single atomic mutation
    syncJourneySnapshot: (snapshot: JourneySnapshot) => void;

    toggleFavorite: (originId: string, destId: string) => void;
    hydratePreferences: (preferences: PersistedTripPreferences) => void;
    restoreTripCheckpoint: (checkpoint: ActiveTripCheckpoint) => void;
    setPendingTripRecovery: (checkpoint: ActiveTripCheckpoint | null) => void;
    resumePendingTrip: () => void;
    discardPendingTrip: () => void;
    reset: () => void;
    // Dev Mode
    isDevMode: boolean;
    toggleDevMode: () => void;
    enableDevMode: () => void;
    disableDevMode: () => void;

    // GPS Override
    simulatedLocation: { latitude: number; longitude: number } | null;
    simulatedHeading: number | null;
    simulatedSpeed: number | null;
    fallbackLocation: { latitude: number; longitude: number } | null;
    fallbackHeading: number | null;
    fallbackSpeed: number | null;
    isFallbackLocationActive: boolean;
    setSimulatedLocation: (loc: { latitude: number; longitude: number } | null) => void;
    setSimulatedHeading: (h: number | null) => void;
    setSimulatedSpeed: (s: number | null) => void;
    setFallbackLocation: (loc: { latitude: number; longitude: number } | null) => void;
    setFallbackHeading: (h: number | null) => void;
    setFallbackSpeed: (s: number | null) => void;
    setFallbackLocationActive: (active: boolean) => void;
    isGpsOverride: boolean;
    setGpsOverride: (override: boolean) => void;
    setWalkingDistance: (dist: number | null) => void;

    // Notifications
    isMuted: boolean;
    setIsMuted: (muted: boolean) => void;
    notificationPreference: 'all' | 'destination' | 'none';
    setNotificationPreference: (pref: 'all' | 'destination' | 'none') => void;

    // Phase 87: Wrong Direction Safe Mode
    ignoreWrongDirection: boolean;
    setIgnoreWrongDirection: (ignore: boolean) => void;

    // GPS Fallback Intelligence
    lastManualEntryTime: number;
    setLastManualEntryTime: (time: number) => void;
    gpsReconnecting: boolean;
    setGpsReconnecting: (val: boolean) => void;

    // Appearance
    isDarkMode: boolean;
    darkModeOverride: boolean | null;
    themePreference: ThemePreference;
    setThemePreference: (preference: ThemePreference) => void;
    dataMode: DataMode;
    setDataMode: (mode: DataMode) => void;
    toggleDarkMode: () => void;
    setDarkMode: (val: boolean) => void;
    showRushHour: boolean;
    toggleShowRushHour: () => void;

    // DevOpts: Line 7 Mode
    line7Mode: Line7Mode;
    setLine7Mode: (mode: Line7Mode) => void;

    // DevOpts: Maintenance Mode
    maintenanceMode: boolean;
    setMaintenanceMode: (val: boolean) => void;
    congestionConfig: CongestionConfig;
    setCongestionConfig: (config: CongestionConfig) => void;
}

function buildRouteData(
    origin: Station | null,
    destination: Station | null,
    isDevMode = false,
    line7Mode: Line7Mode = 'OFF',
    transitMode: TransitMode = 'train',
) {
    if (!origin || !destination) {
        return { journeyRoute: null, stationRoute: [] as Station[] };
    }

    const mode = getOperationalMode(isDevMode, line7Mode);
    const journeyRoute = buildJourneyRoute(origin, destination, mode, line7Mode, transitMode);
    return {
        journeyRoute,
        stationRoute: getJourneyRouteStations(journeyRoute),
    };
}

function getJourneySyncPatch(
    snapshot: JourneySnapshot,
    state?: Pick<TripState, 'origin' | 'ticketType' | 'runningFare'>,
) {
    const currentRouteIndex = snapshot.route && snapshot.currentStationId
        ? Math.max(0, snapshot.route.stationIds.findIndex((stationId) => stationId === snapshot.currentStationId))
        : snapshot.activeEdgeIndex;
    const currentStation = snapshot.currentStationId ? getJourneyStationById(snapshot.currentStationId) : null;
    const nextStation = snapshot.nextStationId ? getJourneyStationById(snapshot.nextStationId) : null;
    const runningFare = state?.origin && state.ticketType && currentStation
        ? getPrecisionFare(state.origin, currentStation, state.ticketType)
        : state?.runningFare;

    return {
        journeySnapshot: snapshot,
        computedRoute: snapshot.route ? getJourneyRouteStations(snapshot.route) : [],
        routeIndex: currentRouteIndex,
        currentStation,
        nextStation,
        status: getJourneyCompatibilityStatus(snapshot),
        direction: snapshot.direction,
        walkingDistance: snapshot.walkingDistanceMeters,
        ...(runningFare !== undefined ? { runningFare } : {}),
    } satisfies Partial<TripState>;
}

function resolveThemePreference(preference: ThemePreference): boolean {
    if (preference === 'dark') return true;
    if (preference === 'light') return false;
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}

function buildCheckpointRestorePatch(
    checkpoint: ActiveTripCheckpoint,
): Partial<TripState> | null {
    if (checkpoint.isDevMode) return null;

    const origin = getJourneyStationById(checkpoint.originId);
    const destination = getJourneyStationById(checkpoint.destinationId);
    if (!origin || !destination || checkpoint.tripStartedAt <= 0) return null;

    const { journeyRoute } = buildRouteData(
        origin,
        destination,
        checkpoint.isDevMode,
        checkpoint.line7Mode,
        checkpoint.transitMode,
    );
    if (!journeyRoute) return null;

    const stored = checkpoint.journeySnapshot;
    const storedIds = stored.route?.stationIds ?? [];
    const routeMatches = storedIds.length === journeyRoute.stationIds.length
        && storedIds.every((stationId, index) => stationId === journeyRoute.stationIds[index]);
    if (!routeMatches || !stored.currentStationId || !journeyRoute.stationIds.includes(stored.currentStationId)) {
        return null;
    }
    if (stored.phase === 'IDLE' || stored.phase === 'ARRIVED') return null;

    const snapshot: JourneySnapshot = {
        ...createJourneySnapshot(journeyRoute),
        ...stored,
        route: journeyRoute,
        estimatorMode: stored.estimatorMode ?? 'UNCERTAIN',
        estimatorConfidence: stored.estimatorConfidence ?? 'LOW',
        uncertaintyMeters: stored.uncertaintyMeters ?? 0,
    };
    const syncPatch = getJourneySyncPatch(snapshot, {
        origin,
        ticketType: checkpoint.ticketType,
        runningFare: checkpoint.runningFare,
    });

    return {
        ...syncPatch,
        origin,
        destination,
        transitMode: checkpoint.transitMode,
        selectedLine: checkpoint.selectedLine ?? origin.lineId,
        ticketType: checkpoint.ticketType,
        line7Mode: checkpoint.line7Mode,
        isDevMode: checkpoint.isDevMode,
        runningFare: syncPatch.runningFare ?? checkpoint.runningFare,
        tripStartedAt: checkpoint.tripStartedAt,
        status: getJourneyCompatibilityStatus(snapshot),
        pendingTripRecovery: null,
        isGpsOverride: false,
        simulatedLocation: null,
        simulatedHeading: null,
        simulatedSpeed: null,
        isFallbackLocationActive: false,
        fallbackLocation: null,
        fallbackHeading: null,
        fallbackSpeed: null,
        gpsReconnecting: snapshot.gpsFallbackActive,
    };
}

export const useTripStore = create<TripState>((set, get) => ({
    // Initial State
    transitMode: 'train',
    selectedLine: null,
    origin: null,
    destination: null,
    ticketType: null,
    computedRoute: [],
    routeIndex: 0,
    journeySnapshot: createIdleJourneySnapshot(),
    currentStation: null,
    nextStation: null,
    status: 'IDLE',
    direction: null,
    runningFare: 0,
    tripStartedAt: null,
    favorites: [],
    pendingTripRecovery: null,
    persistenceHydrated: false,

    // Dev Mode
    isDevMode: false,
    toggleDevMode: () => set((state) => ({ isDevMode: !state.isDevMode })),
    enableDevMode: () => set({ isDevMode: true }),
    disableDevMode: () => set({ isDevMode: false }),

    // GPS Override Defaults
    isGpsOverride: false,
    simulatedLocation: null,
    simulatedHeading: null,
    simulatedSpeed: null,
    fallbackLocation: null,
    fallbackHeading: null,
    fallbackSpeed: null,
    isFallbackLocationActive: false,
    walkingDistance: null,

    // Phase 87
    ignoreWrongDirection: false,
    setIgnoreWrongDirection: (ignore) => set({ ignoreWrongDirection: ignore }),

    // GPS Fallback Intelligence
    lastManualEntryTime: 0,
    setLastManualEntryTime: (time) => set({ lastManualEntryTime: time }),
    gpsReconnecting: false,
    setGpsReconnecting: (val) => set({ gpsReconnecting: val }),


    setTransitMode: (mode) => {
        const nextMode: TransitMode = mode === 'bus' && !get().isDevMode ? 'train' : mode;
        const selectedLine: LineId | null = nextMode === 'bus' ? 'EDSA' : null;
        set({
            transitMode: nextMode,
            selectedLine,
            origin: null,
            destination: null,
            computedRoute: [],
            routeIndex: 0,
            journeySnapshot: createIdleJourneySnapshot(),
            currentStation: null,
            nextStation: null,
            status: 'IDLE',
            ticketType: null,
            runningFare: 0,
            direction: null,
            tripStartedAt: null,
            walkingDistance: null,
            fallbackLocation: null,
            fallbackHeading: null,
            fallbackSpeed: null,
            isFallbackLocationActive: false,
            ignoreWrongDirection: false,
        });
    },

    selectLine: (lineId) => set((state) => {
        const nextLine = state.transitMode === 'bus' ? 'EDSA' : lineId === 'EDSA' ? null : lineId;
        return { selectedLine: nextLine, origin: null, destination: null };
    }),

    setOrigin: (station) => {
        set({
            origin: station,
            selectedLine: station.lineId,
            destination: null, // Clear stale destination
            journeySnapshot: createIdleJourneySnapshot(),
            status: 'IDLE',
            currentStation: station,
            nextStation: null,
            computedRoute: [],
            routeIndex: 0,
            runningFare: 0,
            direction: null,
            walkingDistance: null,
            fallbackLocation: null,
            fallbackHeading: null,
            fallbackSpeed: null,
            isFallbackLocationActive: false,
            ignoreWrongDirection: false, // Reset on new trip
            lastManualEntryTime: Date.now() // Stamp for GPS Fallback grace period
        });
    },

    // Mid-trip origin correction: updates origin WITHOUT clearing destination/status/direction
    // Used by WrongDirectionAlert to avoid nuking the user's trip
    updateOriginKeepTrip: (station) => {
        const { destination, ticketType } = get();
        let newFare = 0;
        let newDirection: Direction | null = get().direction;

        if (destination) {
            // 1. Recalculate Fare
            if (ticketType) {
                newFare = getPrecisionFare(station, destination, ticketType);
            }

            // 2. Recalculate Direction (CRITICAL FIX)
            // If origin changes, the relative direction to destination might flip.
            // We must update it to prevent immediate "Wrong Direction" alerts.
            const route = buildRouteData(station, destination, get().isDevMode, get().line7Mode, get().transitMode).stationRoute;
            if (route.length >= 2) {
                const first = route[0];
                const second = route[1];
                newDirection = getDirectionForStations(first, second);
            } else if (station.lineId === destination.lineId) {
                newDirection = getDirectionForStations(station, destination);
            }
        }

        set({
            origin: station,
            selectedLine: station.lineId,
            currentStation: station,
            runningFare: newFare,
            direction: newDirection
            // destination PRESERVED
            // status PRESERVED
        });

        // BUG-5 FIX: Recompute route from the new origin so computedRoute,
        // routeIndex, stopsRemaining, and stopsToTransfer all stay in sync.
        const dest = get().destination;
        if (dest) {
            const { journeyRoute } = buildRouteData(station, dest, get().isDevMode, get().line7Mode, get().transitMode);
            if (journeyRoute) {
                const nextSnapshot = reduceJourneySnapshot(get().journeySnapshot, {
                    type: 'SYNC_ROUTE',
                    route: journeyRoute,
                    anchorStationId: station.id,
                    preserveDeparture: true,
                });
                set(getJourneySyncPatch(nextSnapshot, get()));
            } else {
                set({
                    computedRoute: [],
                    routeIndex: 0,
                    journeySnapshot: createIdleJourneySnapshot(),
                    nextStation: null,
                });
            }
        }
    },

    setDestination: (station) => {
        const wasIdle = get().status === 'IDLE';
        set({ destination: station });
        const origin = get().origin;
        if (origin && station) {
            const { journeyRoute, stationRoute } = buildRouteData(origin, station, get().isDevMode, get().line7Mode, get().transitMode);
            if (journeyRoute) {
                const nextSnapshot = reduceJourneySnapshot(get().journeySnapshot, {
                    type: 'SYNC_ROUTE',
                    route: journeyRoute,
                    anchorStationId: origin.id,
                });
                set({
                    ...getJourneySyncPatch(nextSnapshot, get()),
                    status: wasIdle ? 'IDLE' : getJourneyCompatibilityStatus(nextSnapshot),
                });
            }
            if (stationRoute.length > 1) {
                const current = stationRoute[0];
                const next = stationRoute[1];
                const dir = getDirectionForStations(current, next);
                if (dir) {
                    set({ direction: dir });
                }
            }
        }
    },

    setCurrentStation: (station) => {
        if (!station) {
            if (!get().journeySnapshot.route) {
                set({ currentStation: null, nextStation: null });
            }
            return;
        }

        const state = get();
        const nextSnapshot = reduceJourneySnapshot(state.journeySnapshot, {
            type: 'SNAP_TO_STATION',
            stationId: station.id,
        });
        const acceptedStation = nextSnapshot.displayStationId
            ? getJourneyStationById(nextSnapshot.displayStationId)
            : null;
        const newFare = state.origin && state.ticketType && acceptedStation
            ? getPrecisionFare(state.origin, acceptedStation, state.ticketType)
            : state.runningFare;

        set({
            ...getJourneySyncPatch(nextSnapshot, get()),
            runningFare: newFare,
        });
    },

    setNextStation: (station) => set({ nextStation: station }),

    setTicketType: (type) => {
        const { origin, currentStation } = get();
        let newFare = 0;
        if (origin && currentStation) {
            newFare = getPrecisionFare(origin, currentStation, type);
        }
        set({ ticketType: type, runningFare: newFare });
    },

    startTrip: () => {

        // Build computed route on trip start
        const { origin, destination } = get();
        const { journeyRoute } = buildRouteData(origin, destination, get().isDevMode, get().line7Mode, get().transitMode);
        const journeySnapshot = createJourneySnapshot(journeyRoute);
        set({
            ...getJourneySyncPatch(journeySnapshot, get()),
            status: 'WAITING',
            ignoreWrongDirection: false,
            tripStartedAt: Date.now(),
        });
    },

    endTrip: () => set({ status: 'ARRIVED' }),

    setStatus: (status) => set({ status }),

    // Pure label setter — NO side effects, NO nextStation recalculation
    setDirection: (dir) => {
        const normalized = normalizeDirection(dir, get().currentStation?.lineId ?? get().origin?.lineId ?? null);
        if (get().direction === normalized) return;
        set({ direction: normalized });
    },

    // Rebuild computedRoute (call when origin/destination changes mid-trip)
    recomputeRoute: () => {
        const { origin, destination, currentStation, isDevMode, line7Mode, transitMode } = get();
        if (!origin || !destination) {
            set({
                computedRoute: [],
                routeIndex: 0,
                journeySnapshot: createIdleJourneySnapshot(),
            });
            return;
        }
        const { journeyRoute } = buildRouteData(origin, destination, isDevMode, line7Mode, transitMode);
        if (!journeyRoute) {
            set({
                computedRoute: [],
                routeIndex: 0,
                journeySnapshot: createIdleJourneySnapshot(),
            });
            return;
        }

        const nextSnapshot = reduceJourneySnapshot(get().journeySnapshot, {
            type: 'SYNC_ROUTE',
            route: journeyRoute,
            anchorStationId: currentStation?.id ?? origin.id,
            preserveDeparture: true,
        });
        set(getJourneySyncPatch(nextSnapshot, get()));
    },

    // THE single atomic mutation for station advancement
    advanceToStation: (stationId) => {
        const nextSnapshot = reduceJourneySnapshot(get().journeySnapshot, {
            type: 'SNAP_TO_STATION',
            stationId,
        });
        set(getJourneySyncPatch(nextSnapshot, get()));
    },

    syncJourneySnapshot: (snapshot) => {
        set(getJourneySyncPatch(snapshot, get()));
    },

    toggleFavorite: (originId, destId) => {
        const { favorites } = get();
        const exists = favorites.find(f => f.originId === originId && f.destId === destId);
        if (exists) {
            set({ favorites: favorites.filter(f => f !== exists) });
        } else {
            set({ favorites: [...favorites, { originId, destId }] });
        }
    },

    hydratePreferences: (preferences) => {
        const favorites = preferences.favorites.filter((favorite) => (
            Boolean(getJourneyStationById(favorite.originId))
            && Boolean(getJourneyStationById(favorite.destId))
        ));
        const isDarkMode = resolveThemePreference(preferences.themePreference);
        set({
            favorites,
            isMuted: preferences.isMuted,
            notificationPreference: preferences.notificationPreference,
            themePreference: preferences.themePreference,
            darkModeOverride: preferences.themePreference === 'system' ? null : isDarkMode,
            isDarkMode,
            showRushHour: preferences.showRushHour,
            dataMode: preferences.dataMode,
            persistenceHydrated: true,
        });
    },
    restoreTripCheckpoint: (checkpoint) => {
        const patch = buildCheckpointRestorePatch(checkpoint);
        if (patch) set(patch);
    },
    setPendingTripRecovery: (checkpoint) => set({ pendingTripRecovery: checkpoint }),
    resumePendingTrip: () => {
        const checkpoint = get().pendingTripRecovery;
        if (!checkpoint) return;
        const patch = buildCheckpointRestorePatch(checkpoint);
        set(patch ? { ...patch, pendingTripRecovery: null } : { pendingTripRecovery: null });
    },
    discardPendingTrip: () => set({ pendingTripRecovery: null }),

    setWalkingDistance: (dist) => set({ walkingDistance: dist }),
    reset: () => set({
        transitMode: 'train',
        selectedLine: null,
        origin: null,
        destination: null,
        computedRoute: [],
        routeIndex: 0,
        journeySnapshot: createIdleJourneySnapshot(),
        currentStation: null,
        nextStation: null,
        status: 'IDLE',
        ticketType: null,
        runningFare: 0,
        direction: null,
        tripStartedAt: null,
        isGpsOverride: false,
        simulatedLocation: null,
        fallbackLocation: null,
        fallbackHeading: null,
        fallbackSpeed: null,
        isFallbackLocationActive: false,
        walkingDistance: null,
        simulatedHeading: null,
        simulatedSpeed: null,
        ignoreWrongDirection: false,
        gpsReconnecting: false,
        lastManualEntryTime: 0,
    }),

    setGpsOverride: (val) => set({ isGpsOverride: val }),
    setSimulatedLocation: (loc) => set({ simulatedLocation: loc }),
    setSimulatedHeading: (h) => set({ simulatedHeading: h }),
    setSimulatedSpeed: (s) => set({ simulatedSpeed: s }),
    setFallbackLocation: (loc) => set({ fallbackLocation: loc }),
    setFallbackHeading: (h) => set({ fallbackHeading: h }),
    setFallbackSpeed: (s) => set({ fallbackSpeed: s }),
    setFallbackLocationActive: (active) => set({ isFallbackLocationActive: active }),

    // Notifications
    isMuted: false,
    setIsMuted: (muted) => set({ isMuted: muted }),
    notificationPreference: 'all',
    setNotificationPreference: (pref) => set({ notificationPreference: pref }),

    // Appearance
    isDarkMode: false,
    darkModeOverride: null, // null = follow system preference
    themePreference: 'system',
    setThemePreference: (preference) => {
        const isDarkMode = resolveThemePreference(preference);
        set({
            themePreference: preference,
            isDarkMode,
            darkModeOverride: preference === 'system' ? null : isDarkMode,
        });
    },
    dataMode: 'auto',
    setDataMode: (mode) => set({ dataMode: mode }),
    toggleDarkMode: () => set((state) => {
        const newVal = !state.isDarkMode;
        return {
            isDarkMode: newVal,
            darkModeOverride: newVal,
            themePreference: newVal ? 'dark' : 'light',
        };
    }),
    setDarkMode: (val) => set({ isDarkMode: val }),
    showRushHour: true, // Enabled by default
    toggleShowRushHour: () => set((state) => ({ showRushHour: !state.showRushHour })),

    // DevOpts: Line 7 Mode
    line7Mode: 'OFF' as const,
    setLine7Mode: (mode) => set({ line7Mode: mode }),

    // DevOpts: Maintenance Mode
    maintenanceMode: false,
    setMaintenanceMode: (val) => set({ maintenanceMode: val }),
    congestionConfig: {},
    setCongestionConfig: (config) => set({ congestionConfig: config }),
}));
