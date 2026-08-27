import { Station } from '@/types';
import { TRANSFER_PAIR_MAP } from '@/domain/journey/graph';
import { buildJourneyRoute, getJourneyRouteStations } from '@/domain/journey/routeBuilder';

export const TRANSFER_MAP = TRANSFER_PAIR_MAP;

interface RouteOptions {
    preferFallback?: boolean;
}

export function getRoute(origin: Station, dest: Station, _options?: RouteOptions): Station[] {
    const transitMode = origin.lineId === 'EDSA' || dest.lineId === 'EDSA' ? 'bus' : 'train';
    const route = buildJourneyRoute(origin, dest, 'live', 'OFF', transitMode);
    return getJourneyRouteStations(route);
}
