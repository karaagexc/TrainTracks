import { STATIONS } from '@/data/stations';
import type { Direction, LegacyDirection, Line7Mode, LineId, LineKind, OperationalMode, RailLineId, Station, TransitMode } from '@/types';

export const RAIL_LINES: ReadonlySet<RailLineId> = new Set(['LRT1', 'LRT2', 'MRT3', 'MRT7']);
export const BUILT_RAIL_LINES: ReadonlySet<RailLineId> = new Set(['LRT1', 'LRT2', 'MRT3']);
export const BUILT_LINES: ReadonlySet<RailLineId> = BUILT_RAIL_LINES;

export function isBuiltLine(lineId: LineId): boolean {
    return isRailLine(lineId) && BUILT_RAIL_LINES.has(lineId);
}

export function isBuiltRailLine(lineId: LineId): lineId is Exclude<RailLineId, 'MRT7'> {
    return isRailLine(lineId) && BUILT_RAIL_LINES.has(lineId);
}

export function isRailLine(lineId: LineId | string | null | undefined): lineId is RailLineId {
    return lineId === 'LRT1' || lineId === 'LRT2' || lineId === 'MRT3' || lineId === 'MRT7';
}

export function isBusLine(lineId: LineId | string | null | undefined): lineId is 'EDSA' {
    return lineId === 'EDSA';
}

export function getLineKind(lineId: LineId): LineKind {
    return isBusLine(lineId) ? 'bus' : 'rail';
}

export function getTransitModeForLine(lineId: LineId): TransitMode {
    return isBusLine(lineId) ? 'bus' : 'train';
}

export function isSandboxMode(isDevMode: boolean, line7Mode: Line7Mode): boolean {
    return isDevMode && line7Mode !== 'OFF';
}

export function getOperationalMode(isDevMode: boolean, line7Mode: Line7Mode): OperationalMode {
    return isSandboxMode(isDevMode, line7Mode) ? 'sandbox' : 'live';
}

export function isStationBuilt(station: Station): boolean {
    return isBuiltLine(station.lineId);
}

export function getNetworkStations(
    mode: OperationalMode = 'live',
    line7Mode: Line7Mode = 'OFF',
    transitMode: TransitMode | 'all' = 'train',
): Station[] {
    const includeBus = transitMode === 'bus' || transitMode === 'all';
    const includeRail = transitMode === 'train' || transitMode === 'all';
    const busStations = includeBus ? STATIONS.filter((station) => station.lineId === 'EDSA') : [];

    if (!includeRail) {
        return busStations;
    }

    let railStations: Station[];
    if (mode === 'live') {
        railStations = STATIONS.filter((station) => isStationBuilt(station));
    } else {
        switch (line7Mode) {
            case 'OFF':
                railStations = STATIONS.filter((station) => station.lineId !== 'MRT7' && station.lineId !== 'EDSA');
                break;
            case 'WITHOUT_NA':
                railStations = STATIONS.filter((station) => station.id !== 'M3-01' && station.lineId !== 'EDSA');
                break;
            case 'WITH_NA':
            default:
                railStations = STATIONS.filter((station) => station.lineId !== 'EDSA');
                break;
        }
    }

    return includeBus ? [...railStations, ...busStations] : railStations;
}

export function getLineStations(
    lineId: LineId,
    mode: OperationalMode = 'live',
    line7Mode: Line7Mode = 'OFF',
    transitMode: TransitMode | 'all' = 'all',
): Station[] {
    return getNetworkStations(mode, line7Mode, transitMode)
        .filter((station) => station.lineId === lineId)
        .sort((left, right) => left.order - right.order);
}

export function getDirectionForStations(from: Station | null, to: Station | null): Direction | null {
    if (!from || !to || from.lineId !== to.lineId || from.order === to.order) {
        return null;
    }

    const increasingOrder = to.order > from.order;
    if (from.lineId === 'LRT2') {
        return increasingOrder ? 'EASTBOUND' : 'WESTBOUND';
    }

    return increasingOrder ? 'SOUTHBOUND' : 'NORTHBOUND';
}

export function normalizeDirection(
    direction: Direction | LegacyDirection | null | undefined,
    lineId?: LineId | null,
): Direction | null {
    if (!direction) return null;
    if (direction === 'NORTHBOUND' || direction === 'SOUTHBOUND' || direction === 'EASTBOUND' || direction === 'WESTBOUND') {
        return direction;
    }

    if (lineId === 'LRT2') {
        return direction === 'SOUTH' ? 'EASTBOUND' : 'WESTBOUND';
    }

    return direction === 'SOUTH' ? 'SOUTHBOUND' : 'NORTHBOUND';
}

export function toLegacyDirection(direction: Direction | null | undefined): LegacyDirection | null {
    if (!direction) return null;
    return direction === 'SOUTHBOUND' || direction === 'EASTBOUND' ? 'SOUTH' : 'NORTH';
}

export function isForwardDirection(direction: Direction | null | undefined): boolean {
    return direction === 'SOUTHBOUND' || direction === 'EASTBOUND';
}

export function formatDirection(direction: Direction | null | undefined): string {
    if (!direction) return 'Unknown';
    switch (direction) {
        case 'NORTHBOUND':
            return 'Northbound';
        case 'SOUTHBOUND':
            return 'Southbound';
        case 'EASTBOUND':
            return 'Eastbound';
        case 'WESTBOUND':
            return 'Westbound';
        default:
            return 'Unknown';
    }
}

export function directionShortLabel(direction: Direction | null | undefined): string {
    switch (direction) {
        case 'NORTHBOUND':
            return 'NB';
        case 'SOUTHBOUND':
            return 'SB';
        case 'EASTBOUND':
            return 'EB';
        case 'WESTBOUND':
            return 'WB';
        default:
            return '--';
    }
}

const TERMINUS_LABELS: Partial<Record<LineId, Partial<Record<Direction, string>>>> = {
    LRT1: { NORTHBOUND: 'FPJ', SOUTHBOUND: 'Dr. Santos' },
    LRT2: { EASTBOUND: 'Antipolo', WESTBOUND: 'Recto' },
    MRT3: { NORTHBOUND: 'North Ave', SOUTHBOUND: 'Taft Ave' },
    MRT7: { NORTHBOUND: 'San Jose del Monte', SOUTHBOUND: 'Common Stn' },
    EDSA: { NORTHBOUND: 'Monumento', SOUTHBOUND: 'PITX' },
};

export function getTerminusLabel(lineId: LineId, direction: Direction): string {
    return TERMINUS_LABELS[lineId]?.[direction] ?? '';
}
