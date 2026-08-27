import { Station } from '@/types';
import { getEdsaRouteStops } from '@/data/fareMatrixBus';
import { getJourneyGraphForMode, getJourneyStationById } from './graph';
import { JourneyEdge, JourneyRoute } from './types';
import type { Line7Mode, OperationalMode, TransitMode } from '@/types';

interface PathState {
    stationId: string;
    transfers: number;
    distanceMeters: number;
    hops: number;
    signature: string;
    prev: PathState | null;
    via: JourneyEdge | null;
}

function compareStates(left: PathState, right: PathState): number {
    if (left.transfers !== right.transfers) return left.transfers - right.transfers;
    if (left.distanceMeters !== right.distanceMeters) return left.distanceMeters - right.distanceMeters;
    if (left.hops !== right.hops) return left.hops - right.hops;
    return left.signature.localeCompare(right.signature);
}

function reconstructRoute(finalState: PathState, mode: OperationalMode, transitMode: TransitMode): JourneyRoute | null {
    const edges: JourneyEdge[] = [];
    const stationIds: string[] = [];
    let cursor: PathState | null = finalState;

    while (cursor) {
        stationIds.push(cursor.stationId);
        if (cursor.via) {
            edges.push(cursor.via);
        }
        cursor = cursor.prev;
    }

    stationIds.reverse();
    edges.reverse();

    if (stationIds.length === 0) {
        return null;
    }

    return {
        originId: stationIds[0],
        destinationId: stationIds[stationIds.length - 1],
        stationIds,
        edges,
        totalDistanceMeters: edges.reduce((sum, edge) => sum + edge.distanceMeters, 0),
        totalTransferCount: edges.filter((edge) => edge.type === 'transfer').length,
        operationalMode: mode,
        transitMode,
    };
}

export function buildJourneyRoute(
    origin: Station,
    destination: Station,
    mode: OperationalMode = 'live',
    line7Mode: Line7Mode = 'OFF',
    transitMode: TransitMode = 'train',
): JourneyRoute | null {
    if (origin.id === destination.id) {
        return {
            originId: origin.id,
            destinationId: destination.id,
            stationIds: [origin.id],
            edges: [],
            totalDistanceMeters: 0,
            totalTransferCount: 0,
            operationalMode: mode,
            transitMode,
        };
    }

    if (
        origin.lineId === 'EDSA' &&
        destination.lineId === 'EDSA' &&
        transitMode === 'bus' &&
        getEdsaRouteStops(origin, destination).length < 2
    ) {
        return null;
    }

    const graph = getJourneyGraphForMode(mode, line7Mode, transitMode);
    const bestByStation = new Map<string, PathState>();
    const queue: PathState[] = [{
        stationId: origin.id,
        transfers: 0,
        distanceMeters: 0,
        hops: 0,
        signature: origin.id,
        prev: null,
        via: null,
    }];

    bestByStation.set(origin.id, queue[0]);

    while (queue.length > 0) {
        queue.sort(compareStates);
        const current = queue.shift()!;
        const bestKnown = bestByStation.get(current.stationId);

        if (bestKnown && compareStates(current, bestKnown) > 0) {
            continue;
        }

        if (current.stationId === destination.id) {
            return reconstructRoute(current, mode, transitMode);
        }

        for (const edge of graph.adjacency[current.stationId] ?? []) {
            const candidate: PathState = {
                stationId: edge.toStationId,
                transfers: current.transfers + (edge.type === 'transfer' ? 1 : 0),
                distanceMeters: current.distanceMeters + edge.distanceMeters,
                hops: current.hops + 1,
                signature: `${current.signature}>${edge.toStationId}`,
                prev: current,
                via: edge,
            };

            const bestExisting = bestByStation.get(candidate.stationId);
            if (!bestExisting || compareStates(candidate, bestExisting) < 0) {
                bestByStation.set(candidate.stationId, candidate);
                queue.push(candidate);
            }
        }
    }

    return null;
}

export function getJourneyRouteStations(route: JourneyRoute | null): Station[] {
    if (!route) return [];

    return route.stationIds
        .map((stationId) => getJourneyStationById(stationId))
        .filter((station): station is Station => station !== null);
}
