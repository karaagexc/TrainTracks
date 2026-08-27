import type { Coordinates, LocationSample } from '@/types';
import type { JourneyRoute } from './types';

export type JourneyEvent =
    | { type: 'trip/start'; route: JourneyRoute | null }
    | { type: 'trip/end' }
    | { type: 'location/sample'; sample: LocationSample }
    | { type: 'location/fallback'; active: boolean }
    | { type: 'route/sync'; route: JourneyRoute | null; anchorStationId?: string | null; preserveDeparture?: boolean }
    | { type: 'station/snap'; stationId: string }
    | { type: 'manual/location'; location: Coordinates };
