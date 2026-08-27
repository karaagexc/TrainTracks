import type { JourneySnapshot } from '@/domain/journey/types';

export type SafetyReminderKind = 'PRE_BOARD' | 'IN_TRANSIT';

export const SAFETY_REMINDER_STABLE_MS: Record<SafetyReminderKind, number> = {
    PRE_BOARD: 2000,
    IN_TRANSIT: 5000,
};

interface SafetyReminderInput {
    status: 'IDLE' | 'WAITING' | 'TRANSIT' | 'ARRIVED';
    snapshot: JourneySnapshot;
    hasOrigin: boolean;
    hasDestination: boolean;
    tripStartedAt: number | null;
    now?: number;
}

export function getEligibleSafetyReminder({
    status,
    snapshot,
    hasOrigin,
    hasDestination,
    tripStartedAt,
    now = Date.now(),
}: SafetyReminderInput): SafetyReminderKind | null {
    if (!hasOrigin || !hasDestination || status === 'IDLE' || status === 'ARRIVED') return null;

    const atTripOrigin = snapshot.currentStationId === snapshot.route?.originId;
    if (
        atTripOrigin
        && !snapshot.hasDepartedOrigin
        && snapshot.statusCode === 'AT_STATION'
        && snapshot.phase === 'WAITING_AT_ORIGIN'
        && snapshot.estimatorMode !== 'UNCERTAIN'
    ) {
        return 'PRE_BOARD';
    }

    const elapsedMs = tripStartedAt ? now - tripStartedAt : 0;
    const departureConfirmed = snapshot.hasDepartedOrigin
        && snapshot.projectedDistanceMeters !== null
        && snapshot.projectedDistanceMeters >= 120;
    if (
        status === 'TRANSIT'
        && departureConfirmed
        && elapsedMs >= 45_000
        && snapshot.phase === 'ONBOARD_MOVING'
        && (snapshot.statusCode === 'BETWEEN_STATIONS' || snapshot.statusCode === 'APPROACHING_STATION')
        && snapshot.estimatorMode !== 'UNCERTAIN'
        && snapshot.legProgress >= 8
        && snapshot.legProgress <= 82
    ) {
        return 'IN_TRANSIT';
    }

    return null;
}