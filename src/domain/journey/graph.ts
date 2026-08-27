import { getSegmentData } from '@/data/segmentDistances';
import { getEdsaRouteDistanceKm } from '@/data/fareMatrixBus';
import { isEdsaStopAllowedForDirection } from '@/data/edsaGeometry';
import { LINES, STATIONS } from '@/data/stations';
import { getTransferDetails } from '@/data/transfers';
import { getDistanceKm } from '@/utils/geo';
import { Line7Mode, LineId, OperationalMode, Station, TransitMode } from '@/types';
import { JOURNEY_CONSTANTS } from './constants';
import { JourneyEdge, JourneyGraph, JourneyRailEdge, JourneyTransferEdge } from './types';
import { getLineKind, getLineStations, getNetworkStations, isBuiltLine, isRailLine } from '@/domain/railway';

export const TRANSFER_PAIR_MAP: Partial<Record<LineId, Partial<Record<LineId, { from: string; to: string }>>>> = {
    LRT1: {
        LRT2: { from: 'L1-11', to: 'L2-01' },
        MRT3: { from: 'L1-02', to: 'M3-13' },
        MRT7: { from: 'L1-20', to: 'M7-01' },
    },
    LRT2: {
        LRT1: { from: 'L2-01', to: 'L1-11' },
        MRT3: { from: 'L2-08', to: 'M3-04' },
    },
    MRT3: {
        LRT1: { from: 'M3-13', to: 'L1-02' },
        LRT2: { from: 'M3-04', to: 'L2-08' },
        MRT7: { from: 'M3-01', to: 'M7-01' },
    },
    MRT7: {
        LRT1: { from: 'M7-01', to: 'L1-20' },
        MRT3: { from: 'M7-01', to: 'M3-01' },
    },
};

const EDSA_TRANSFER_PAIRS: Array<{ from: string; to: string }> = [
    { from: 'EC-01', to: 'L1-18' },
    { from: 'EC-03', to: 'L1-19' },
    { from: 'EC-05', to: 'L1-20' },
    { from: 'EC-07', to: 'M3-01' },
    { from: 'EC-09', to: 'M3-02' },
    { from: 'EC-10', to: 'M3-03' },
    { from: 'EC-12', to: 'M3-04' },
    { from: 'EC-12', to: 'L2-08' },
    { from: 'EC-13', to: 'M3-05' },
    { from: 'EC-14', to: 'M3-06' },
    { from: 'EC-15', to: 'M3-09' },
    { from: 'EC-16', to: 'M3-10' },
    { from: 'EC-17', to: 'M3-11' },
    { from: 'EC-19', to: 'M3-13' },
    { from: 'EC-19', to: 'L1-02' },
    { from: 'EC-25', to: 'L1-23' },
];

const STATION_BY_ID = new Map(STATIONS.map((station) => [station.id, station]));
const GRAPH_CACHE = new Map<string, JourneyGraph>();

export function getJourneyStationById(stationId: string): Station | null {
    return STATION_BY_ID.get(stationId) ?? null;
}

function fallbackRailTravelTimeSec(from: Station, to: Station): number {
    const distanceKm = getDistanceKm(from, to);
    const avgSpeedKph = LINES[from.lineId].avgCommercialSpeedKph || 30;
    return Math.max(60, Math.round((distanceKm / Math.max(avgSpeedKph, 1)) * 3600));
}

function makeRailEdge(from: Station, to: Station): JourneyRailEdge {
    const isBusEdge = from.lineId === 'EDSA' && to.lineId === 'EDSA';
    const segment = isBusEdge ? null : getSegmentData(from.id, to.id);
    const distanceMeters = isBusEdge
        ? Math.round(getEdsaRouteDistanceKm(from, to) * 1000)
        : segment?.distanceMeters ?? Math.round(getDistanceKm(from, to) * 1000);
    const travelTimeSec = segment?.travelTimeSec ?? fallbackRailTravelTimeSec(from, to);

    return {
        id: `rail:${from.id}:${to.id}`,
        type: 'rail',
        fromStationId: from.id,
        toStationId: to.id,
        lineId: from.lineId,
        lineKind: getLineKind(from.lineId),
        distanceMeters,
        travelTimeSec,
    };
}

function makeTransferEdge(from: Station, to: Station): JourneyTransferEdge {
    const details = getTransferDetails(from.lineId, to.lineId, from.name);
    const fallbackDistanceMeters = Math.round(getDistanceKm(from, to) * 1000);

    return {
        id: `transfer:${from.id}:${to.id}`,
        type: 'transfer',
        fromStationId: from.id,
        toStationId: to.id,
        fromLineId: from.lineId,
        toLineId: to.lineId,
        distanceMeters: details?.distanceMeters ?? fallbackDistanceMeters,
        travelTimeSec: Math.max(60, Math.round((details?.walkTimeMin ?? 5) * 60)),
        instruction: details?.instruction ?? `Transfer to ${to.lineId}`,
        routeDescription: details?.routeDescription ?? 'Follow Signs',
        turnDirection: details?.direction ?? 'STRAIGHT',
        targetCoordinates: details?.targetCoordinates,
        completionRadiusMeters: JOURNEY_CONSTANTS.transferExitRadiusMeters,
    };
}

function addEdge(adjacency: Record<string, JourneyEdge[]>, edge: JourneyEdge) {
    if (!adjacency[edge.fromStationId]) {
        adjacency[edge.fromStationId] = [];
    }
    adjacency[edge.fromStationId].push(edge);
}

function shouldIncludeTransfer(mode: OperationalMode, fromLine: LineId, toLine: LineId, transitMode: TransitMode): boolean {
    if (fromLine === 'EDSA' || toLine === 'EDSA') {
        if (transitMode !== 'bus') return false;
        const railLine = fromLine === 'EDSA' ? toLine : fromLine;
        return isRailLine(railLine) && (mode === 'sandbox' || isBuiltLine(railLine));
    }

    if (mode === 'sandbox') return true;
    return isBuiltLine(fromLine) && isBuiltLine(toLine);
}

function buildJourneyGraph(mode: OperationalMode, line7Mode: Line7Mode, transitMode: TransitMode): JourneyGraph {
    const adjacency: Record<string, JourneyEdge[]> = {};
    const stations = getNetworkStations(mode, line7Mode, transitMode === 'bus' ? 'all' : 'train');
    const stationIds = new Set(stations.map((station) => station.id));

    for (const station of stations) {
        adjacency[station.id] = [];
    }

    const lineIds: LineId[] = transitMode === 'bus'
        ? ['LRT1', 'LRT2', 'MRT3', 'MRT7', 'EDSA']
        : ['LRT1', 'LRT2', 'MRT3', 'MRT7'];

    for (const lineId of lineIds) {
        const lineStations = getLineStations(lineId, mode, line7Mode, transitMode === 'bus' ? 'all' : 'train');
        if (lineId === 'EDSA' && transitMode === 'bus') {
            const southboundStops = lineStations.filter((station) => isEdsaStopAllowedForDirection(station, 'SOUTHBOUND'));
            const northboundStops = lineStations
                .filter((station) => isEdsaStopAllowedForDirection(station, 'NORTHBOUND'))
                .slice()
                .reverse();

            for (let index = 0; index < southboundStops.length - 1; index += 1) {
                addEdge(adjacency, makeRailEdge(southboundStops[index], southboundStops[index + 1]));
            }
            for (let index = 0; index < northboundStops.length - 1; index += 1) {
                addEdge(adjacency, makeRailEdge(northboundStops[index], northboundStops[index + 1]));
            }
            continue;
        }

        for (let index = 0; index < lineStations.length - 1; index += 1) {
            const from = lineStations[index];
            const to = lineStations[index + 1];
            addEdge(adjacency, makeRailEdge(from, to));
            addEdge(adjacency, makeRailEdge(to, from));
        }
    }

    for (const fromLine of Object.keys(TRANSFER_PAIR_MAP) as LineId[]) {
        const destinations = TRANSFER_PAIR_MAP[fromLine];
        if (!destinations) continue;
        for (const toLine of Object.keys(destinations) as LineId[]) {
            if (!shouldIncludeTransfer(mode, fromLine, toLine, transitMode)) continue;

            const pair = destinations[toLine];
            if (!pair) continue;
            if (!stationIds.has(pair.from) || !stationIds.has(pair.to)) continue;

            const fromStation = getJourneyStationById(pair.from);
            const toStation = getJourneyStationById(pair.to);
            if (!fromStation || !toStation) continue;

            addEdge(adjacency, makeTransferEdge(fromStation, toStation));
        }
    }

    for (const pair of EDSA_TRANSFER_PAIRS) {
        if (!stationIds.has(pair.from) || !stationIds.has(pair.to)) continue;
        const fromStation = getJourneyStationById(pair.from);
        const toStation = getJourneyStationById(pair.to);
        if (!fromStation || !toStation) continue;
        if (!shouldIncludeTransfer(mode, fromStation.lineId, toStation.lineId, transitMode)) continue;

        addEdge(adjacency, makeTransferEdge(fromStation, toStation));
        addEdge(adjacency, makeTransferEdge(toStation, fromStation));
    }

    return { adjacency };
}

export function getJourneyGraph(): JourneyGraph {
    return getJourneyGraphForMode('live', 'OFF', 'train');
}

export function getJourneyGraphForMode(mode: OperationalMode = 'live', line7Mode: Line7Mode = 'OFF', transitMode: TransitMode = 'train'): JourneyGraph {
    const cacheKey = `${mode}:${line7Mode}:${transitMode}`;
    if (!GRAPH_CACHE.has(cacheKey)) {
        GRAPH_CACHE.set(cacheKey, buildJourneyGraph(mode, line7Mode, transitMode));
    }
    return GRAPH_CACHE.get(cacheKey)!;
}
