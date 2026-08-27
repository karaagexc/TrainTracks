"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTripStore } from '@/store/useTripStore';
import {
    getEligibleSafetyReminder,
    SAFETY_REMINDER_STABLE_MS,
    type SafetyReminderKind,
} from '@/domain/safety/reminders';
import { SafetyRules } from '@/components/screens/SafetyRules';
import { TransitRules } from '@/components/screens/TransitRules';

const EMPTY_DISMISSED: Record<SafetyReminderKind, boolean> = {
    PRE_BOARD: false,
    IN_TRANSIT: false,
};

export function JourneySafetyReminders() {
    const status = useTripStore((state) => state.status);
    const snapshot = useTripStore((state) => state.journeySnapshot);
    const origin = useTripStore((state) => state.origin);
    const destination = useTripStore((state) => state.destination);
    const tripStartedAt = useTripStore((state) => state.tripStartedAt);
    const transitMode = useTripStore((state) => state.transitMode);
    const [active, setActive] = useState<SafetyReminderKind | null>(null);
    const [dismissed, setDismissed] = useState(EMPTY_DISMISSED);
    const tripKey = `${tripStartedAt ?? 'none'}:${origin?.id ?? 'none'}:${destination?.id ?? 'none'}`;
    const tripKeyRef = useRef(tripKey);

    const candidate = useMemo(() => getEligibleSafetyReminder({
        status,
        snapshot,
        hasOrigin: Boolean(origin),
        hasDestination: Boolean(destination),
        tripStartedAt,
    }), [destination, origin, snapshot, status, tripStartedAt]);

    useEffect(() => {
        if (tripKeyRef.current === tripKey && status !== 'IDLE' && status !== 'ARRIVED') return;
        tripKeyRef.current = tripKey;
        setActive(null);
        setDismissed(EMPTY_DISMISSED);
    }, [status, tripKey]);

    useEffect(() => {
        if (!candidate || active || dismissed[candidate]) return;
        const timer = window.setTimeout(() => setActive(candidate), SAFETY_REMINDER_STABLE_MS[candidate]);
        return () => window.clearTimeout(timer);
    }, [active, candidate, dismissed]);

    const dismiss = (kind: SafetyReminderKind) => {
        setActive(null);
        setDismissed((current) => ({ ...current, [kind]: true }));
    };

    const isBusMode = transitMode === 'bus';

    return (
        <>
            <SafetyRules
                open={active === 'PRE_BOARD'}
                isBusMode={isBusMode}
                onDismiss={() => dismiss('PRE_BOARD')}
            />
            <TransitRules
                open={active === 'IN_TRANSIT'}
                isBusMode={isBusMode}
                onDismiss={() => dismiss('IN_TRANSIT')}
            />
        </>
    );
}
