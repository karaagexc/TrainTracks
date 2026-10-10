"use client";

import { useEffect, useMemo, useState } from 'react';
import { useTripStore } from '@/store/useTripStore';
import {
    getEligibleSafetyReminder,
    SAFETY_REMINDER_STABLE_MS,
    type SafetyReminderKind,
} from '@/domain/safety/reminders';
import { SafetyRules } from '@/components/screens/SafetyRules';
import { TransitRules } from '@/components/screens/TransitRules';
import { EMPTY_SAFETY_DISMISSALS, persistSafetyDismissals, readSafetyDismissals, type SafetyDismissalFlags } from './safetyReminderDismissals';

export function JourneySafetyReminders() {
    const status = useTripStore((state) => state.status);
    const snapshot = useTripStore((state) => state.journeySnapshot);
    const origin = useTripStore((state) => state.origin);
    const destination = useTripStore((state) => state.destination);
    const tripStartedAt = useTripStore((state) => state.tripStartedAt);
    const transitMode = useTripStore((state) => state.transitMode);
    const [active, setActive] = useState<SafetyReminderKind | null>(null);
    const [dismissals, setDismissals] = useState<{ tripId: string | null; flags: SafetyDismissalFlags }>({ tripId: null, flags: EMPTY_SAFETY_DISMISSALS });
    const tripKey = snapshot.tripId;

    const candidate = useMemo(() => getEligibleSafetyReminder({
        status,
        snapshot,
        hasOrigin: Boolean(origin),
        hasDestination: Boolean(destination),
        tripStartedAt,
    }), [destination, origin, snapshot, status, tripStartedAt]);

    useEffect(() => {
        setActive(null);
        setDismissals({ tripId: tripKey, flags: readSafetyDismissals(tripKey) });
    }, [tripKey]);

    useEffect(() => {
        if (!candidate && active) {
            setActive(null);
            return;
        }
        if (!tripKey || dismissals.tripId !== tripKey || !candidate || active || dismissals.flags[candidate]) return;
        const timer = window.setTimeout(() => setActive(candidate), SAFETY_REMINDER_STABLE_MS[candidate]);
        return () => window.clearTimeout(timer);
    }, [active, candidate, dismissals, tripKey]);

    const dismiss = (kind: SafetyReminderKind) => {
        if (!tripKey) return;
        const flags = { ...(dismissals.tripId === tripKey ? dismissals.flags : readSafetyDismissals(tripKey)), [kind]: true };
        persistSafetyDismissals(tripKey, flags);
        if (useTripStore.getState().journeySnapshot.tripId !== tripKey) return;
        setActive(null);
        setDismissals({ tripId: tripKey, flags });
    };

    const isBusMode = transitMode === 'bus';

    return (
        <>
            <SafetyRules
                open={dismissals.tripId === tripKey && active === 'PRE_BOARD'}
                isBusMode={isBusMode}
                onDismiss={() => dismiss('PRE_BOARD')}
            />
            <TransitRules
                open={dismissals.tripId === tripKey && active === 'IN_TRANSIT'}
                isBusMode={isBusMode}
                onDismiss={() => dismiss('IN_TRANSIT')}
            />
        </>
    );
}
