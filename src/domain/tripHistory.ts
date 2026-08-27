import { STATIONS } from '@/data/stations';
import type { Station, TicketType } from '@/types';
import { getPrecisionFare } from '@/utils/fareNew';

export type TripHistoryTicketType = TicketType;

export interface TripHistoryFareFields {
    origin_id: string;
    destination_id: string;
    ticket_type: string;
    fare: number | string | null;
    direction?: string | null;
}

const TICKET_TYPES = new Set<TripHistoryTicketType>(['SJT', 'SVC', 'CONCESSION', 'DEBIT', 'CREDIT', 'BUS_REGULAR']);

function getStationById(id: string): Station | null {
    return STATIONS.find((station) => station.id === id) ?? null;
}

export function normalizeTripHistoryTicketType(ticketType: string | null | undefined): TripHistoryTicketType {
    return TICKET_TYPES.has(ticketType as TripHistoryTicketType)
        ? ticketType as TripHistoryTicketType
        : 'SJT';
}

export function normalizeTripHistoryDirection(direction: string | null | undefined): string | null {
    if (!direction) return null;
    const compact = direction
        .trim()
        .toUpperCase()
        .replace(/[\s_-]+/g, '');

    if (!compact) return null;
    if (compact === 'NORTH' || compact === 'NORTHBOUND' || compact === 'NORTHBOUNDBOUND') return 'NORTHBOUND';
    if (compact === 'SOUTH' || compact === 'SOUTHBOUND' || compact === 'SOUTHBOUNDBOUND') return 'SOUTHBOUND';
    if (compact === 'EAST' || compact === 'EASTBOUND' || compact === 'EASTBOUNDBOUND') return 'EASTBOUND';
    if (compact === 'WEST' || compact === 'WESTBOUND' || compact === 'WESTBOUNDBOUND') return 'WESTBOUND';
    return direction.trim();
}

export function formatTripHistoryDirection(direction: string | null | undefined): string {
    return normalizeTripHistoryDirection(direction) ?? 'Unknown';
}

export function computeTripHistoryFare(trip: TripHistoryFareFields): number {
    const currentFare = Number(trip.fare);
    if (Number.isFinite(currentFare) && currentFare > 0) {
        return currentFare;
    }

    const origin = getStationById(trip.origin_id);
    const destination = getStationById(trip.destination_id);
    if (!origin || !destination) return Number.isFinite(currentFare) ? currentFare : 0;

    return getPrecisionFare(origin, destination, normalizeTripHistoryTicketType(trip.ticket_type));
}

export function normalizeTripHistoryRecord<T extends TripHistoryFareFields>(trip: T): T {
    return {
        ...trip,
        fare: computeTripHistoryFare(trip),
        direction: normalizeTripHistoryDirection(trip.direction),
    };
}

export function getTripHistoryRepairPatch(trip: TripHistoryFareFields): Partial<Pick<TripHistoryFareFields, 'fare' | 'direction'>> | null {
    const patch: Partial<Pick<TripHistoryFareFields, 'fare' | 'direction'>> = {};
    const computedFare = computeTripHistoryFare(trip);
    const currentFare = Number(trip.fare);
    const normalizedDirection = normalizeTripHistoryDirection(trip.direction);

    if ((!Number.isFinite(currentFare) || currentFare <= 0) && computedFare > 0) {
        patch.fare = computedFare;
    }

    if ((trip.direction ?? null) !== normalizedDirection) {
        patch.direction = normalizedDirection;
    }

    return Object.keys(patch).length > 0 ? patch : null;
}
