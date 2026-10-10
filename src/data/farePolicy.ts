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
    verification: 'verified' | 'unverified';
    verificationNote: string | null;
}

export const RAIL_FARE_VERIFICATION_GAPS = {
    LRT1: 'Concession amounts remain legacy/unverified: LRMC confirms a 50% discounted SJT but no retrieved primary matrix establishes rounding or white-card amounts. Do not infer a second discount.',
} as const;

export const BASE_RAIL_FARE_SOURCE_REFS: Partial<Record<LineId, string[]>> = {
    LRT1: ['https://lrmc.ph/our-business-featured/fare-matrix/'],
    LRT2: ['https://www.lrta.gov.ph/lrt-2-fare-adjustment/'],
    MRT3: ['https://www.dotrmrt3.gov.ph/dotrmrt3-citizen-charter-handbook-2026-1st-edition.pdf#page=93'],
};

export const CURRENT_RAIL_FARE_POLICY: FarePolicy = {
    id: 'dotr-2026-03-23-lrt2-mrt3-half-fare',
    name: 'LRT-2 and MRT-3 50% fare relief',
    lineIds: ['LRT2', 'MRT3'],
    multiplier: 0.5,
    effectiveFrom: '2026-03-22T16:00:00.000Z',
    effectiveUntil: null,
    status: 'active_until_further_notice',
    lastVerifiedAt: '2026-10-09',
    sourceRefs: [
        'https://www.lrta.gov.ph/tickets-and-fares/',
        'https://www.lrta.gov.ph/wp-content/uploads/2026/03/Citizens-Charter-Handbook-2026-2nd-Edition.pdf#page=10',
        'https://www.dotrmrt3.gov.ph/dotrmrt3-citizen-charter-handbook-2026-1st-edition.pdf#page=93',
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
    if (!Number.isFinite(at) || policy.status === 'expired') return false;
    if (!policy.lineIds.includes(lineId)) return false;
    if (at < Date.parse(policy.effectiveFrom)) return false;
    return policy.effectiveUntil === null || at < Date.parse(policy.effectiveUntil);
}

const MRT3_RELIEF_FARE_BANDS: Readonly<Record<number, number>> = {
    13: 6, 16: 8, 20: 10, 24: 12, 28: 14,
};

function roundLrt2DiscountedFare(value: number, medium: FarePaymentMedium): number {
    // LRTA's distinct SJT table rounds 7.5 to 8; its SVC table retains halves.
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
        const verificationNote = lineId === 'LRT1' && ticketType === 'CONCESSION'
            ? RAIL_FARE_VERIFICATION_GAPS.LRT1
            : null;
        return {
            amount: baseAmount,
            baseAmount,
            // The legacy concession column was a discounted SJT, not a white-card table.
            paymentMedium: ticketType === 'CONCESSION' && ['LRT1', 'LRT2', 'MRT3'].includes(lineId)
                ? 'single_journey'
                : paymentMedium,
            policy: null,
            verification: verificationNote ? 'unverified' : 'verified',
            verificationNote,
        };
    }

    // LRTA publishes one reduced SVC table for blue and white cards; MRT3 one
    // all-passenger table. Use those amounts, not a discount on entry.CONCESSION.
    const baseAmount = paymentMedium === 'single_journey' ? entry.SJT : entry.BEEP;
    const amount = lineId === 'MRT3'
        ? MRT3_RELIEF_FARE_BANDS[baseAmount]
        : roundLrt2DiscountedFare(baseAmount * policy.multiplier, paymentMedium);
    if (amount === undefined) {
        return {
            amount: baseAmount,
            baseAmount,
            paymentMedium,
            policy,
            verification: 'unverified',
            verificationNote: `No published MRT3 relief fare is verified for the ${baseAmount}-peso base band.`,
        };
    }
    return {
        amount,
        baseAmount,
        paymentMedium,
        policy,
        verification: 'verified',
        verificationNote: null,
    };
}
