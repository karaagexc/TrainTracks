import { EDSA_STOPS } from '@/data/edsaStops';
import {
    getEdsaDirection,
    getEdsaLegPath,
    getPolylineDistanceKm,
    isEdsaStopAllowedForDirection,
} from '@/data/edsaGeometry';
import type { Station, TicketType } from '@/types';
import { getDistanceKm } from '@/utils/geo';

export type BusTicketType = Extract<TicketType, 'BUS_REGULAR' | 'CONCESSION' | 'SJT' | 'SVC' | 'DEBIT' | 'CREDIT'>;
export type BusFareProgram = 'standard' | 'service_contracting';

const BASE_FARE = 18;
const BASE_KM = 5;
const PER_KM_FARE = 2.98;
const CONCESSION_MULTIPLIER = 0.8;
const SERVICE_CONTRACTING_REGULAR_MULTIPLIER = 0.8;
const SERVICE_CONTRACTING_CONCESSION_MULTIPLIER = 0.6;

export const EDSA_FARE_METADATA = {
    effectiveFrom: '2026-03-18',
    lastVerifiedAt: '2026-08-10',
    sourceRefs: [
        'https://pia.gov.ph/news/puv-fares-adjusted-to-shield-drivers-commuters/',
    ],
    serviceContractingSourceRefs: [
        'https://pia.gov.ph/news/dotr-chief-reiterates-fare-discounts-under-service-contracting-program/',
    ],
} as const;

const EDSA_STOP_BY_ID = new Map(EDSA_STOPS.map((stop) => [stop.id, stop]));

function roundFare(value: number): number {
    return Math.round(value * 100) / 100;
}

export function calculateEdsaBusFare(
    distanceKm: number,
    ticketType: BusTicketType = 'BUS_REGULAR',
    program: BusFareProgram = 'standard',
): number {
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;

    const regularFare = BASE_FARE + Math.max(0, distanceKm - BASE_KM) * PER_KM_FARE;
    const concession = ticketType === 'CONCESSION';
    const multiplier = program === 'service_contracting'
        ? concession
            ? SERVICE_CONTRACTING_CONCESSION_MULTIPLIER
            : SERVICE_CONTRACTING_REGULAR_MULTIPLIER
        : concession
            ? CONCESSION_MULTIPLIER
            : 1;

    return roundFare(regularFare * multiplier);
}

export function getEdsaBusFareOptions(distanceKm: number, ticketType: BusTicketType) {
    return {
        standard: calculateEdsaBusFare(distanceKm, ticketType, 'standard'),
        serviceContracting: calculateEdsaBusFare(distanceKm, ticketType, 'service_contracting'),
    };
}

export function isEdsaStation(station: Station | null | undefined): station is Station {
    return station?.lineId === 'EDSA';
}

export function getEdsaRouteStops(from: Station, to: Station): Station[] {
    if (!isEdsaStation(from) || !isEdsaStation(to)) return [];

    const startIndex = EDSA_STOPS.findIndex((stop) => stop.id === from.id);
    const endIndex = EDSA_STOPS.findIndex((stop) => stop.id === to.id);
    if (startIndex < 0 || endIndex < 0) return [];

    const direction = getEdsaDirection(from, to);
    if (!direction) return [from];
    if (!isEdsaStopAllowedForDirection(from, direction) || !isEdsaStopAllowedForDirection(to, direction)) {
        return [];
    }

    const [low, high] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
    const stops = EDSA_STOPS
        .slice(low, high + 1)
        .filter((stop) => isEdsaStopAllowedForDirection(stop, direction));
    return startIndex <= endIndex ? stops : stops.reverse();
}

export function getEdsaRouteDistanceKm(from: Station, to: Station): number {
    const stops = getEdsaRouteStops(from, to);
    if (stops.length < 2) return 0;

    let distanceKm = 0;
    for (let index = 0; index < stops.length - 1; index += 1) {
        const legPath = getEdsaLegPath(stops[index], stops[index + 1]);
        distanceKm += legPath.length > 1
            ? getPolylineDistanceKm(legPath)
            : getDistanceKm(stops[index], stops[index + 1]);
    }

    return distanceKm;
}

export function getEdsaSegmentDistanceKm(fromId: string, toId: string): number {
    const from = EDSA_STOP_BY_ID.get(fromId);
    const to = EDSA_STOP_BY_ID.get(toId);
    if (!from || !to) return 0;
    return getEdsaRouteDistanceKm(from, to);
}

export function isEdsaNorthboundStopAllowed(station: Station): boolean {
    return station.directionAvailability !== 'southbound_only';
}

export function getEdsaFare(from: Station, to: Station, ticketType: BusTicketType): number {
    if (!isEdsaStation(from) || !isEdsaStation(to)) return 0;
    return calculateEdsaBusFare(getEdsaRouteDistanceKm(from, to), ticketType);
}
