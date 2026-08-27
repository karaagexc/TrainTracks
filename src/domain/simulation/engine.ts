import type { Coordinates, Line7Mode, LineId, OperationalMode, Station } from '@/types';
import { getEdsaLegPath, getPolylineDistanceKm, getProjectedDistanceAlongPath, interpolateAlongPath } from '@/data/edsaGeometry';
import { getTransferDetails } from '@/data/transfers';
import { getSegmentData } from '@/data/segmentDistances';
import { buildRoutingResult } from '@/domain/routing';
import { getBearing, getDistanceKm, moveTowards } from '@/utils/geo';

export type SimulationLegKind = 'rail' | 'transfer';
export type SimulationPlaybackStatus = 'IDLE' | 'MOVING' | 'DWELLING' | 'WALKING';

export const SIMULATION_CONSTANTS = {
    dwellTimeMs: 30_000,
    walkingSpeedKph: 4.5,
    railCruiseSpeedsKph: {
        LRT1: 60,
        LRT2: 80,
        MRT3: 60,
        MRT7: 60,
        EDSA: 50,
    } satisfies Record<LineId, number>,
    accelerationMps2: 0.9,
    decelerationMps2: 1.15,
    arrivalRadiusMeters: 8,
    stationStopSnapRadiusMeters: 36,
    stationStopSnapSpeedKph: 4,
} as const;

export interface SimulationLegProfile {
    kind: SimulationLegKind;
    status: Exclude<SimulationPlaybackStatus, 'IDLE' | 'DWELLING'>;
    from: Station;
    to: Station;
    targetLocation: Coordinates;
    distanceKm: number;
    path?: Coordinates[];
    speedKph: number;
    travelTimeSec: number;
}

export interface SimulationStep {
    location: Coordinates;
    speedKph: number;
    heading: number | null;
    arrived: boolean;
    remainingMeters: number;
    progress: number;
}

export function toStationCoordinates(station: Station): Coordinates {
    return { latitude: station.latitude, longitude: station.longitude };
}

export function buildSimulationRoute(
    origin: Station,
    destination: Station,
    mode: OperationalMode,
    line7Mode: Line7Mode,
): Station[] {
    return buildRoutingResult(origin, destination, mode, line7Mode).stations;
}

export function getSimulationCruiseSpeedKph(lineId: LineId): number {
    return SIMULATION_CONSTANTS.railCruiseSpeedsKph[lineId] ?? 60;
}

export function getSimulationLegProfile(from: Station, to: Station): SimulationLegProfile {
    const isTransfer = from.lineId !== to.lineId;

    if (isTransfer) {
        const transfer = getTransferDetails(from.lineId, to.lineId, from.name);
        const targetLocation = transfer?.targetCoordinates ?? toStationCoordinates(to);
        const distanceKm = Math.max((transfer?.distanceMeters ?? Math.round(getDistanceKm(from, targetLocation) * 1000)) / 1000, 0.001);
        const speedKph = SIMULATION_CONSTANTS.walkingSpeedKph;

        return {
            kind: 'transfer',
            status: 'WALKING',
            from,
            to,
            targetLocation,
            distanceKm,
            speedKph,
            travelTimeSec: Math.max(1, Math.round((distanceKm / speedKph) * 3600)),
        };
    }

    const isBusLeg = from.lineId === 'EDSA' && to.lineId === 'EDSA';
    const segment = isBusLeg ? null : getSegmentData(from.id, to.id);
    const path = isBusLeg ? getEdsaLegPath(from, to) : undefined;
    const targetLocation = path && path.length > 1 ? path[path.length - 1] : toStationCoordinates(to);
    const pathDistanceKm = path && path.length > 1 ? getPolylineDistanceKm(path) : null;
    const distanceKm = Math.max((pathDistanceKm ?? (segment?.distanceMeters ?? Math.round(getDistanceKm(from, to) * 1000)) / 1000), 0.001);
    const speedKph = getSimulationCruiseSpeedKph(from.lineId);
    const travelTimeSec = Math.max(1, Math.round((distanceKm / speedKph) * 3600));

    return {
        kind: 'rail',
        status: 'MOVING',
        from,
        to,
        targetLocation,
        distanceKm,
        path,
        speedKph,
        travelTimeSec,
    };
}

export function getSimulationPlaybackStatus(route: Station[], stopIndex: number): SimulationPlaybackStatus {
    const from = route[stopIndex];
    const to = route[stopIndex + 1];
    if (!from || !to) return 'IDLE';
    return getSimulationLegProfile(from, to).status;
}

export function stepSimulationLeg(
    currentLocation: Coordinates,
    leg: SimulationLegProfile,
    deltaMs: number,
    multiplier: number,
    currentSpeedKph = 0,
): SimulationStep {
    const path = leg.path && leg.path.length > 1 ? leg.path : null;
    const pathDistanceKm = path ? getPolylineDistanceKm(path) : leg.distanceKm;
    const currentPathDistanceKm = path
        ? Math.max(0, Math.min(pathDistanceKm, getProjectedDistanceAlongPath(currentLocation, path)))
        : Math.max(0, leg.distanceKm - getDistanceKm(currentLocation, leg.targetLocation));
    const remainingBeforeKm = path
        ? Math.max(0, pathDistanceKm - currentPathDistanceKm)
        : getDistanceKm(currentLocation, leg.targetLocation);
    const remainingBeforeMeters = remainingBeforeKm * 1000;
    const elapsedSeconds = Math.max(0, (deltaMs * multiplier) / 1000);
    let nextSpeedKph = leg.speedKph;
    let distanceStepKm = leg.speedKph * ((deltaMs * multiplier) / 3600_000);
    let shouldSnapToStation = false;

    if (leg.kind === 'rail') {
        const currentSpeedMps = Math.max(0, currentSpeedKph / 3.6);
        const cruiseSpeedMps = leg.speedKph / 3.6;
        const brakingDistanceMeters = currentSpeedMps > 0
            ? (currentSpeedMps * currentSpeedMps) / (2 * SIMULATION_CONSTANTS.decelerationMps2)
            : 0;
        const shouldBrake = currentSpeedMps > 0 && remainingBeforeMeters <= brakingDistanceMeters + 24;
        const nextSpeedMps = shouldBrake
            ? Math.max(0, currentSpeedMps - SIMULATION_CONSTANTS.decelerationMps2 * elapsedSeconds)
            : Math.min(cruiseSpeedMps, currentSpeedMps + SIMULATION_CONSTANTS.accelerationMps2 * elapsedSeconds);
        const averageSpeedMps = (currentSpeedMps + nextSpeedMps) / 2;
        const distanceStepMeters = Math.max(0, averageSpeedMps * elapsedSeconds);
        const nearStopped = nextSpeedMps * 3.6 <= SIMULATION_CONSTANTS.stationStopSnapSpeedKph;

        nextSpeedKph = nextSpeedMps * 3.6;
        distanceStepKm = distanceStepMeters / 1000;
        shouldSnapToStation = shouldBrake && nearStopped && remainingBeforeMeters <= SIMULATION_CONSTANTS.stationStopSnapRadiusMeters;
    }

    const arrived = shouldSnapToStation || remainingBeforeMeters <= Math.max(SIMULATION_CONSTANTS.arrivalRadiusMeters, distanceStepKm * 1000);
    const nextPathDistanceKm = arrived
        ? pathDistanceKm
        : Math.min(pathDistanceKm, currentPathDistanceKm + distanceStepKm);
    const nextLocation = arrived
        ? leg.targetLocation
        : path
            ? interpolateAlongPath(path, nextPathDistanceKm)
            : moveTowards(currentLocation, leg.targetLocation, distanceStepKm);
    const remainingMeters = path
        ? Math.max(0, Math.round((pathDistanceKm - nextPathDistanceKm) * 1000))
        : Math.max(0, Math.round(getDistanceKm(nextLocation, leg.targetLocation) * 1000));
    const coveredKm = path
        ? nextPathDistanceKm
        : Math.max(0, leg.distanceKm - getDistanceKm(nextLocation, leg.targetLocation));
    const progress = Math.max(0, Math.min(100, (coveredKm / Math.max(pathDistanceKm, 0.001)) * 100));

    return {
        location: nextLocation,
        speedKph: arrived ? 0 : nextSpeedKph,
        heading: arrived ? null : getBearing(currentLocation, nextLocation),
        arrived,
        remainingMeters,
        progress,
    };
}
