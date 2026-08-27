import type { Line7Mode, OperationalMode, Station, TransitMode } from '@/types';
import { buildJourneyRoute, getJourneyRouteStations } from '@/domain/journey/routeBuilder';
import type { JourneyRoute } from '@/domain/journey/types';

export interface RoutingResult {
    route: JourneyRoute | null;
    stations: Station[];
}

export function buildRoutingResult(
    origin: Station | null,
    destination: Station | null,
    mode: OperationalMode = 'live',
    line7Mode: Line7Mode = 'OFF',
    transitMode?: TransitMode,
): RoutingResult {
    if (!origin || !destination) {
        return { route: null, stations: [] };
    }

    const resolvedTransitMode = transitMode ?? (origin.lineId === 'EDSA' || destination.lineId === 'EDSA' ? 'bus' : 'train');
    const route = buildJourneyRoute(origin, destination, mode, line7Mode, resolvedTransitMode);
    return {
        route,
        stations: getJourneyRouteStations(route),
    };
}
