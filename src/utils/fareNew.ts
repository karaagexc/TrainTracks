import { FARE_MATRIX } from '@/data/fareMatrix';
import { getEdsaFare } from '@/data/fareMatrixBus';
import {
    BASE_RAIL_FARE_SOURCE_REFS,
    getEffectiveFare,
    type FarePolicy,
} from '@/data/farePolicy';
import type { LineId, Station, TicketType } from '@/types';
import { getRoute } from './simRoute';

export type FareBreakdown = {
    lrt1: number;
    lrt2: number;
    mrt3: number;
    mrt7: number;
    edsa: number;
    total: number;
};

export interface FareSegmentQuote {
    lineId: LineId;
    fromStationId: string;
    toStationId: string;
    amount: number;
    baseAmount: number;
    paymentMedium: 'single_journey' | 'stored_value' | 'bus';
    policyId: string | null;
    sourceRefs: string[];
    verification: 'verified' | 'unverified';
    verificationNote: string | null;
}

export interface FareQuote {
    total: number;
    baseTotal: number;
    segments: FareSegmentQuote[];
    policies: FarePolicy[];
}

type FareSegmentCalculation = FareSegmentQuote & { policy: FarePolicy | null };

const LINE_BREAKDOWN_KEY: Record<LineId, keyof Omit<FareBreakdown, 'total'>> = {
    LRT1: 'lrt1',
    LRT2: 'lrt2',
    MRT3: 'mrt3',
    MRT7: 'mrt7',
    EDSA: 'edsa',
};

function getMatrixFareQuote(
    from: Station,
    to: Station,
    ticketType: TicketType,
    at: number,
): FareSegmentCalculation {
    const emptyQuote: FareSegmentCalculation = {
        lineId: from.lineId,
        fromStationId: from.id,
        toStationId: to.id,
        amount: 0,
        baseAmount: 0,
        paymentMedium: from.lineId === 'EDSA'
            ? 'bus'
            : ticketType === 'SJT'
                ? 'single_journey'
                : 'stored_value',
        policyId: null,
        policy: null,
        sourceRefs: [],
        verification: from.id === to.id ? 'verified' : 'unverified',
        verificationNote: from.id === to.id ? null : 'No verified fare matrix cell is available for this journey segment.',
    };

    if (from.id === to.id) return emptyQuote;

    if (from.lineId === 'EDSA' && to.lineId === 'EDSA') {
        const amount = getEdsaFare(from, to, ticketType);
        return {
            ...emptyQuote,
            amount,
            baseAmount: amount,
            paymentMedium: 'bus',
            verification: 'verified',
            verificationNote: null,
            sourceRefs: [
                'https://pia.gov.ph/news/puv-fares-adjusted-to-shield-drivers-commuters/',
            ],
        };
    }

    const fareData = FARE_MATRIX[from.id]?.[to.id];
    if (!fareData) return emptyQuote;

    const effectiveFare = getEffectiveFare(from.lineId, ticketType, fareData, at);
    return {
        ...emptyQuote,
        amount: effectiveFare.amount,
        baseAmount: effectiveFare.baseAmount,
        paymentMedium: effectiveFare.paymentMedium,
        policyId: effectiveFare.policy?.id ?? null,
        policy: effectiveFare.policy,
        verification: effectiveFare.verification,
        verificationNote: effectiveFare.verificationNote,
        sourceRefs: effectiveFare.policy?.sourceRefs
            ?? BASE_RAIL_FARE_SOURCE_REFS[from.lineId]
            ?? [],
    };
}

function getRouteFareSegments(route: Station[]): Array<{ lineId: LineId; from: Station; to: Station; reverses: boolean }> {
    if (route.length < 2) return [];

    const segments: Array<{ lineId: LineId; from: Station; to: Station; reverses: boolean }> = [];
    let segmentStart = route[0];
    let segmentDirection = 0;
    let reverses = false;

    for (let i = 1; i < route.length; i++) {
        const previous = route[i - 1];
        const current = route[i];

        if (current.lineId !== previous.lineId) {
            segments.push({
                lineId: previous.lineId,
                from: segmentStart,
                to: previous,
                reverses,
            });
            segmentStart = current;
            segmentDirection = 0;
            reverses = false;
        } else {
            const stepDirection = Math.sign(current.order - previous.order);
            if (stepDirection && segmentDirection && stepDirection !== segmentDirection) reverses = true;
            if (stepDirection) segmentDirection = stepDirection;
        }
    }

    const lastStation = route[route.length - 1];
    segments.push({
        lineId: lastStation.lineId,
        from: segmentStart,
        to: lastStation,
        reverses,
    });

    return segments;
}

export const getFareQuoteForRoute = (
    route: Station[],
    ticketType: TicketType,
    at = Date.now(),
): FareQuote => {
    if (route.length < 2) {
        return { total: 0, baseTotal: 0, segments: [], policies: [] };
    }
    const calculations = getRouteFareSegments(route)
        .map((segment) => {
            const calculation = getMatrixFareQuote(segment.from, segment.to, ticketType, at);
            if (segment.reverses && segment.lineId !== 'EDSA') {
                return { ...calculation, verification: 'unverified' as const,
                    verificationNote: 'This amended route reverses within one paid rail journey. The endpoint fare is not a verified charge; confirm the ticket rules with the operator.' };
            }
            return calculation;
        });
    const policyMap = new Map<string, FarePolicy>();

    for (const calculation of calculations) {
        if (calculation.policy) policyMap.set(calculation.policy.id, calculation.policy);
    }

    const segments = calculations.map(({ policy: _policy, ...segment }) => segment);
    return {
        total: segments.reduce((total, segment) => total + segment.amount, 0),
        baseTotal: segments.reduce((total, segment) => total + segment.baseAmount, 0),
        segments,
        policies: [...policyMap.values()],
    };
};

export const getFareQuote = (
    origin: Station,
    current: Station,
    ticketType: TicketType,
    at = Date.now(),
): FareQuote => getFareQuoteForRoute(origin && current ? getRoute(origin, current) : [], ticketType, at);

export const getPrecisionFare = (
    origin: Station,
    current: Station,
    ticketType: TicketType,
    at = Date.now(),
): number => getFareQuote(origin, current, ticketType, at).total;

export const getFareBreakdown = (
    origin: Station,
    current: Station,
    ticketType: TicketType,
    route?: Station[],
    at = Date.now(),
): FareBreakdown => {
    const breakdown: FareBreakdown = { lrt1: 0, lrt2: 0, mrt3: 0, mrt7: 0, edsa: 0, total: 0 };
    if (!origin || !current) return breakdown;

    const quote = route ? getFareQuoteForRoute(route, ticketType, at) : getFareQuote(origin, current, ticketType, at);
    for (const segment of quote.segments) {
        const key = LINE_BREAKDOWN_KEY[segment.lineId];
        breakdown[key] += segment.amount;
        breakdown.total += segment.amount;
    }

    return breakdown;
};
