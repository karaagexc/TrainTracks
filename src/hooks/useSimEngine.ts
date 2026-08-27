import { useState, useEffect, useRef, useCallback } from 'react';
import { Station, Coordinates, Direction } from '@/types';
import { getBearing } from '@/utils/geo';
import { useTripStore } from '@/store/useTripStore';
import { useTrainStore } from '@/store/useTrainStore';
import { getDirectionForStations, isRailLine } from '@/domain/railway';
import type { TrainPresence, TrainPresenceStatus } from '@/types/train';
import {
    buildSimulationRoute,
    getSimulationLegProfile,
    getSimulationPlaybackStatus,
    SIMULATION_CONSTANTS,
    stepSimulationLeg,
    toStationCoordinates,
} from '@/domain/simulation/engine';

const DWELL_TIME_MS = SIMULATION_CONSTANTS.dwellTimeMs;
const TICK_RATE_MS = 1000;
const SIM_SELF_TRAIN_ID = 'SIM-SELF-RIDE';
const APPROACHING_DISTANCE_METERS = 300;
const LEAVING_PROGRESS_PERCENT = 8;

type SimState = 'IDLE' | 'MOVING' | 'DWELLING' | 'WALKING';

function toCoordinates(station: Station): Coordinates {
    return toStationCoordinates(station);
}

function buildSimRouteForStations(origin: Station, destination: Station): Station[] {
    const { isDevMode, line7Mode } = useTripStore.getState();
    const mode = isDevMode ? 'sandbox' : 'live';
    return buildSimulationRoute(origin, destination, mode, line7Mode);
}

function getPlaybackStatus(nextRoute: Station[], stopIndex: number): SimState {
    return getSimulationPlaybackStatus(nextRoute, stopIndex);
}

function canEmitSimSelfPresence(): boolean {
    const store = useTripStore.getState();
    return store.isDevMode && store.isGpsOverride && store.transitMode === 'train';
}

function clearSimSelfPresence() {
    useTrainStore.getState().setSelfTrainPresence(null);
}

function resolveSimDirection(route: Station[], stopIndex: number): Direction | null {
    const from = route[stopIndex] ?? null;
    const to = route[stopIndex + 1] ?? null;
    const direct = getDirectionForStations(from, to);
    if (direct) return direct;

    const previous = route[stopIndex - 1] ?? null;
    const previousDirection = getDirectionForStations(previous, from);
    if (previousDirection) return previousDirection;

    return useTripStore.getState().direction;
}

function getMovingPresenceStatus(progress: number, remainingMeters: number): TrainPresenceStatus {
    if (remainingMeters <= APPROACHING_DISTANCE_METERS) return 'APPROACHING_STATION';
    if (progress <= LEAVING_PROGRESS_PERCENT) return 'LEAVING_STATION';
    return 'IN_TRANSIT';
}

function didArriveByRail(route: Station[], stopIndex: number): boolean {
    const previous = route[stopIndex - 1];
    const current = route[stopIndex];
    return !!previous && !!current && previous.lineId === current.lineId;
}

function isIntermediateStop(route: Station[], stopIndex: number): boolean {
    return stopIndex > 0 && stopIndex < route.length - 1;
}

function upsertSimSelfPresence(params: {
    route: Station[];
    stopIndex: number;
    location: Coordinates;
    speedKph: number;
    statusCode: TrainPresenceStatus;
}) {
    if (!canEmitSimSelfPresence()) {
        clearSimSelfPresence();
        return;
    }

    const { route, stopIndex, location, speedKph, statusCode } = params;
    const current = route[stopIndex] ?? null;
    const target = route[stopIndex + 1] ?? null;
    const direction = resolveSimDirection(route, stopIndex);

    if (!current || !direction || current.id === 'VIRTUAL_U_TURN' || !isRailLine(current.lineId)) {
        clearSimSelfPresence();
        return;
    }

    const anchor = statusCode === 'AT_STATION' || statusCode === 'LEAVING_STATION'
        ? current
        : target ?? current;

    const train: TrainPresence = {
        id: SIM_SELF_TRAIN_ID,
        lineId: current.lineId,
        direction,
        lat: location.latitude,
        lng: location.longitude,
        speedKph,
        statusCode,
        stationId: anchor.id,
        stationName: anchor.name,
        source: 'simulated',
        updatedAt: Date.now(),
        confidence: 1,
    };

    useTrainStore.getState().setSelfTrainPresence(train);
}

function syncSimDwellPresence(route: Station[], stopIndex: number, location: Coordinates) {
    if (isIntermediateStop(route, stopIndex) && didArriveByRail(route, stopIndex)) {
        upsertSimSelfPresence({
            route,
            stopIndex,
            location,
            speedKph: 0,
            statusCode: 'AT_STATION',
        });
        return;
    }

    clearSimSelfPresence();
}

export function useSimEngine() {
    const {
        origin,
        destination,
        setSimulatedLocation,
        setSimulatedHeading,
        setSimulatedSpeed,
        endTrip,
        isDevMode,
        line7Mode,
    } = useTripStore();

    const [status, setStatus] = useState<SimState>('IDLE');
    const [route, setRoute] = useState<Station[]>([]);
    const [currentStopIndex, setCurrentStopIndex] = useState(0);
    const [ghostLocation, setGhostLocation] = useState<Coordinates | null>(null);
    const [eta, setEta] = useState<number | null>(null);
    const [progress, setProgress] = useState(0);
    const [dwellStartTime, setDwellStartTime] = useState<number | null>(null);
    const [multiplier, setMultiplier] = useState(1);
    const [isPlaying, setIsPlaying] = useState(false);

    const statusRef = useRef(status);
    const isPlayingRef = useRef(isPlaying);
    const locationRef = useRef(ghostLocation);
    const speedRef = useRef(0);

    statusRef.current = status;
    isPlayingRef.current = isPlaying;
    locationRef.current = ghostLocation;

    const primeRoute = useCallback((nextRoute: Station[], stationIndex = 0, initialLocation?: Coordinates | null) => {
        const safeIndex = Math.min(Math.max(0, stationIndex), Math.max(0, nextRoute.length - 1));
        const anchorStation = nextRoute[safeIndex];
        if (!anchorStation) return false;

        const nextLocation = initialLocation ?? toCoordinates(anchorStation);
        const targetStation = nextRoute[safeIndex + 1] ?? null;

        setRoute(nextRoute);
        setCurrentStopIndex(safeIndex);
        setGhostLocation(nextLocation);
        setSimulatedLocation(nextLocation);
        setSimulatedSpeed(0);
        speedRef.current = 0;
        setSimulatedHeading(targetStation ? getBearing(nextLocation, toCoordinates(targetStation)) : null);
        setDwellStartTime(null);
        setEta(null);
        setProgress(0);
        clearSimSelfPresence();
        return true;
    }, [setSimulatedHeading, setSimulatedLocation, setSimulatedSpeed]);

    useEffect(() => {
        if (origin && destination) {
            const nextRoute = buildSimRouteForStations(origin, destination);
            if (nextRoute.length > 0) {
                primeRoute(nextRoute);
                if (!isPlayingRef.current) setStatus('IDLE');
            }
        } else if (origin) {
            const nextLocation = toCoordinates(origin);
            setGhostLocation(nextLocation);
            setSimulatedLocation(nextLocation);
            setSimulatedSpeed(0);
            speedRef.current = 0;
            setRoute([]);
            clearSimSelfPresence();
        }
    }, [origin, destination, setSimulatedLocation, setSimulatedSpeed, isDevMode, line7Mode, primeRoute]);

    useEffect(() => {
        if (!isDevMode) {
            clearSimSelfPresence();
        }
    }, [isDevMode]);

    useEffect(() => () => clearSimSelfPresence(), []);

    useEffect(() => {
        if (!isPlaying || !ghostLocation || route.length === 0) return;

        const interval = setInterval(() => {
            const currentStatus = statusRef.current;
            const currentLocation = locationRef.current!;

            if (currentStatus === 'MOVING' || currentStatus === 'WALKING') {
                const targetStation = route[currentStopIndex + 1];
                const currentStationObj = route[currentStopIndex];
                if (!targetStation) {
                    clearSimSelfPresence();
                    setStatus('IDLE');
                    setIsPlaying(false);
                    return;
                }

                if (!currentStationObj) {
                    clearSimSelfPresence();
                    setStatus('IDLE');
                    setIsPlaying(false);
                    return;
                }

                const leg = getSimulationLegProfile(currentStationObj, targetStation);
                if (currentStatus !== leg.status) {
                    setStatus(leg.status);
                }
                if (leg.kind === 'transfer') {
                    clearSimSelfPresence();
                }

                const step = stepSimulationLeg(currentLocation, leg, TICK_RATE_MS, multiplier, speedRef.current);
                setGhostLocation(step.location);
                setSimulatedLocation(step.location);
                setSimulatedSpeed(step.speedKph);
                speedRef.current = step.speedKph;
                setSimulatedHeading(step.heading);
                setEta(step.speedKph > 0 ? step.remainingMeters / (step.speedKph / 3.6) : null);
                setProgress(step.progress);

                if (step.arrived) {
                    const nextStopIndex = currentStopIndex + 1;
                    setGhostLocation(leg.targetLocation);
                    setSimulatedLocation(leg.targetLocation);
                    setSimulatedSpeed(0);
                    speedRef.current = 0;
                    setSimulatedHeading(null);
                    setCurrentStopIndex(nextStopIndex);
                    setStatus('DWELLING');
                    setDwellStartTime(Date.now());
                    setProgress(100);
                    syncSimDwellPresence(route, nextStopIndex, leg.targetLocation);
                    return;
                }

                if (leg.kind === 'rail') {
                    upsertSimSelfPresence({
                        route,
                        stopIndex: currentStopIndex,
                        location: step.location,
                        speedKph: step.speedKph,
                        statusCode: getMovingPresenceStatus(step.progress, step.remainingMeters),
                    });
                }

                return;
            }

            if (currentStatus === 'DWELLING') {
                const startedAt = dwellStartTime ?? Date.now();
                if (!dwellStartTime) {
                    setDwellStartTime(startedAt);
                    syncSimDwellPresence(route, currentStopIndex, currentLocation);
                    return;
                }

                setSimulatedLocation({ ...currentLocation });
                setSimulatedSpeed(0);
                speedRef.current = 0;
                syncSimDwellPresence(route, currentStopIndex, currentLocation);

                const elapsed = Date.now() - startedAt;
                if (elapsed >= (DWELL_TIME_MS / multiplier)) {
                    if (currentStopIndex >= route.length - 1) {
                        clearSimSelfPresence();
                        setStatus('IDLE');
                        setIsPlaying(false);
                        endTrip();
                    } else {
                        const nextStatus = getPlaybackStatus(route, currentStopIndex);
                        if (nextStatus === 'WALKING') {
                            clearSimSelfPresence();
                        }
                        setStatus(nextStatus);
                        setDwellStartTime(null);
                        setProgress(0);
                    }
                }
            }
        }, TICK_RATE_MS);

        return () => clearInterval(interval);
    }, [isPlaying, route, currentStopIndex, multiplier, ghostLocation, dwellStartTime, endTrip, setSimulatedHeading, setSimulatedLocation, setSimulatedSpeed]);

    const play = (routeOverride?: Station[]) => {
        const store = useTripStore.getState();
        let playableRoute = routeOverride ?? route;

        const routeBelongsToCurrentTrip = playableRoute.length > 1
            && (
                playableRoute[0]?.id === store.origin?.id
                || playableRoute[0]?.id === 'VIRTUAL_U_TURN'
            )
            && (
                playableRoute[playableRoute.length - 1]?.id === store.destination?.id
                || playableRoute[0]?.id === 'VIRTUAL_U_TURN'
            );

        if ((!routeBelongsToCurrentTrip || playableRoute.length < 2) && store.origin && store.destination) {
            playableRoute = buildSimRouteForStations(store.origin, store.destination);
        }

        if (playableRoute.length < 2) {
            clearSimSelfPresence();
            setIsPlaying(false);
            return false;
        }

        const shouldRestart = statusRef.current === 'IDLE' || currentStopIndex >= playableRoute.length - 1;
        const startIndex = shouldRestart ? 0 : currentStopIndex;
        const startLocation = shouldRestart
            ? toCoordinates(playableRoute[0])
            : ghostLocation ?? toCoordinates(playableRoute[startIndex]);

        store.setGpsOverride(true);
        primeRoute(playableRoute, startIndex, startLocation);

        if (store.status === 'IDLE' || store.status === 'ARRIVED' || !store.journeySnapshot.route) {
            store.startTrip();
        }

        setStatus(getPlaybackStatus(playableRoute, startIndex));
        setIsPlaying(true);
        return true;
    };

    const startScenario = (scenarioOrigin: Station, scenarioDestination: Station) => {
        const nextRoute = buildSimRouteForStations(scenarioOrigin, scenarioDestination);
        if (nextRoute.length < 2) return false;

        const store = useTripStore.getState();
        const scenarioTransitMode = scenarioOrigin.lineId === 'EDSA' || scenarioDestination.lineId === 'EDSA'
            ? 'bus'
            : 'train';
        setIsPlaying(false);
        if (store.transitMode !== scenarioTransitMode) {
            store.setTransitMode(scenarioTransitMode);
        }
        store.setGpsOverride(true);
        store.setOrigin(scenarioOrigin);
        store.setDestination(scenarioDestination);
        store.setTicketType(scenarioTransitMode === 'bus' ? 'BUS_REGULAR' : 'SJT');
        primeRoute(nextRoute);
        store.startTrip();
        setStatus(getPlaybackStatus(nextRoute, 0));
        setIsPlaying(true);
        return true;
    };

    const pause = () => setIsPlaying(false);

    const teleport = (stationIndex: number) => {
        if (!route[stationIndex]) return;

        const station = route[stationIndex];
        const nextLocation = { latitude: station.latitude, longitude: station.longitude };
        setGhostLocation(nextLocation);
        setSimulatedLocation(nextLocation);
        setSimulatedSpeed(0);
        speedRef.current = 0;
        setSimulatedHeading(null);
        setCurrentStopIndex(stationIndex);
        setStatus('DWELLING');
        setDwellStartTime(Date.now());
        setProgress(100);
        syncSimDwellPresence(route, stationIndex, nextLocation);
    };

    return {
        status,
        ghostLocation,
        progress,
        eta,
        isPlaying,
        play,
        startScenario,
        pause,
        setMultiplier,
        multiplier,
        teleport,
        route,
        currentStopIndex,
        overrideRoute: (newRoute: Station[]) => {
            setRoute(newRoute);
            setCurrentStopIndex(0);
            if (newRoute[0]) {
                const nextLocation = { latitude: newRoute[0].latitude, longitude: newRoute[0].longitude };
                setGhostLocation(nextLocation);
                setSimulatedLocation(nextLocation);
                setSimulatedSpeed(0);
                speedRef.current = 0;
                setProgress(0);
            }
            clearSimSelfPresence();
        }
    };
}
