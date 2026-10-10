import type { SafetyReminderKind } from '@/domain/safety/reminders';

export type SafetyDismissalFlags = Record<SafetyReminderKind, boolean>;
export const SAFETY_DISMISSALS_KEY = 'traintracks:safety-dismissals:v1';
export const MAX_SAFETY_DISMISSAL_TRIPS = 20;
export const EMPTY_SAFETY_DISMISSALS: SafetyDismissalFlags = { PRE_BOARD: false, IN_TRANSIT: false };

interface Entry { tripId: string; flags: SafetyDismissalFlags }
type DismissalStorage = Pick<Storage, 'getItem' | 'setItem'>;

function session(): DismissalStorage | null {
    try { return typeof window === 'undefined' ? null : window.sessionStorage; }
    catch { return null; }
}

function readEntries(storage: DismissalStorage): Entry[] {
    try {
        const parsed: unknown = JSON.parse(storage.getItem(SAFETY_DISMISSALS_KEY) ?? '[]');
        if (!Array.isArray(parsed)) return [];
        const entries = new Map<string, Entry>();
        for (const entry of parsed) {
            if (!entry || typeof entry.tripId !== 'string' || !entry.tripId || entry.tripId.length > 200
                || typeof entry.flags?.PRE_BOARD !== 'boolean' || typeof entry.flags?.IN_TRANSIT !== 'boolean') continue;
            entries.delete(entry.tripId);
            entries.set(entry.tripId, { tripId: entry.tripId, flags: { PRE_BOARD: entry.flags.PRE_BOARD, IN_TRANSIT: entry.flags.IN_TRANSIT } });
        }
        return [...entries.values()].slice(-MAX_SAFETY_DISMISSAL_TRIPS);
    } catch { return []; }
}

export function readSafetyDismissals(tripId: string | null, storage = session()): SafetyDismissalFlags {
    if (!tripId || !storage) return EMPTY_SAFETY_DISMISSALS;
    return readEntries(storage).find((entry) => entry.tripId === tripId)?.flags ?? EMPTY_SAFETY_DISMISSALS;
}

export function persistSafetyDismissals(tripId: string, flags: SafetyDismissalFlags, storage = session()): void {
    if (!storage) return;
    try {
        const entries = readEntries(storage).filter((entry) => entry.tripId !== tripId);
        entries.push({ tripId, flags });
        storage.setItem(SAFETY_DISMISSALS_KEY, JSON.stringify(entries.slice(-MAX_SAFETY_DISMISSAL_TRIPS)));
    } catch (error) { console.warn('[Safety] Reminder dismissal could not be retained:', error); }
}
