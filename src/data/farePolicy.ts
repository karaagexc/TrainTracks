import type { LineId, TicketType } from '@/types';

export interface BaseFareEntry {
    SJT: number;
    BEEP: number;
    CONCESSION: number;
}

export type FarePaymentMedium = 'single_journey' | 'stored_value';

export interface FarePolicy {
    id: string;
    name: string;
    lineIds: LineId[];
    multiplier: number;
    effectiveFrom: string;
    effectiveUntil: string | null;
    status: 'active_until_further_notice' | 'scheduled' | 'expired';
    lastVerifiedAt: string;
    sourceRefs: string[];
}

export interface EffectiveFare {
    amount: number;
    baseAmount: number;
    paymentMedium: FarePaymentMedium;
    policy: FarePolicy | null;
}

export const BASE_RAIL_FARE_SOURCE_REFS: Partial<Record<LineId, string[]>> = {
    LRT1: ['https://lrmc.ph/2025/02/18/new-lrt-1-fares-effective-2-april-2025/'],
    LRT2: ['https://www.lrta.gov.ph/lrt-2-fare-adjustment/'],
    MRT3: ['https://www.dotrmrt3.gov.ph/citizens-charter'],
};

export const CURRENT_RAIL_FARE_POLICY: FarePolicy = {
    id: 'dotr-2026-03-23-lrt2-mrt3-half-fare',
    name: 'LRT-2 and MRT-3 50% fare relief',
    lineIds: ['LRT2', 'MRT3'],
    multiplier: 0.5,
    effectiveFrom: '2026-03-22T16:00:00.000Z',
    effectiveUntil: null,
    status: 'active_until_further_notice',
    lastVerifiedAt: '2026-08-10',
    sourceRefs: [
        'https://www.lrta.gov.ph/tickets-and-fares/',
        'https://www.pna.gov.ph/index.php/articles/1271411',
    ],
};

function getPaymentMedium(ticketType: TicketType): FarePaymentMedium {
    return ticketType === 'SJT' ? 'single_journey' : 'stored_value';
}

function getBaseFare(entry: BaseFareEntry, ticketType: TicketType): number {
    if (ticketType === 'SJT') return entry.SJT;
    if (ticketType === 'CONCESSION') return entry.CONCESSION;
    return entry.BEEP;
}

function isPolicyActive(policy: FarePolicy, lineId: LineId, at: number): boolean {
    if (!policy.lineIds.includes(lineId)) return false;
    if (at < Date.parse(policy.effectiveFrom)) return false;
    return policy.effectiveUntil === null || at < Date.parse(policy.effectiveUntil);
}

function roundDiscountedFare(value: number, medium: FarePaymentMedium): number {
    if (medium === 'single_journey') return Math.round(value);
    return Math.round(value * 2) / 2;
}

export function getEffectiveFare(
    lineId: LineId,
    ticketType: TicketType,
    entry: BaseFareEntry,
    at = Date.now(),
): EffectiveFare {
    const paymentMedium = getPaymentMedium(ticketType);
    const policy = isPolicyActive(CURRENT_RAIL_FARE_POLICY, lineId, at)
        ? CURRENT_RAIL_FARE_POLICY
        : null;

    if (!policy) {
        const baseAmount = getBaseFare(entry, ticketType);
        return { amount: baseAmount, baseAmount, paymentMedium, policy: null };
    }

    // The current relief applies to every rider and must not stack with white-card discounts.
    const baseAmount = paymentMedium === 'single_journey' ? entry.SJT : entry.BEEP;
    return {
        amount: roundDiscountedFare(baseAmount * policy.multiplier, paymentMedium),
        baseAmount,
        paymentMedium,
        policy,
    };
}
