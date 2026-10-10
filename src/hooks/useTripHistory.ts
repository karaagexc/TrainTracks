'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import { normalizeTripHistoryDirection } from '@/domain/tripHistory';
import { enqueueOutbox, flushOutbox } from '@/domain/offline/outbox';
import { createClient } from '@/lib/supabase/client';
import { useTripStore } from '@/store/useTripStore';

export interface TripRecord {
    id: string;
    client_trip_id: string;
    user_id: string;
    origin_id: string;
    origin_name: string;
    destination_id: string;
    destination_name: string;
    line_id: string;
    destination_line_id: string | null;
    ticket_type: string;
    fare: number;
    distance_km: number;
    direction: string | null;
    duration_minutes: number | null;
    started_at: string;
    completed_at: string;
    created_at: string;
}
export interface TripStats { totalTrips: number; totalFare: number; totalDistance: number }
export interface TripWrite extends Omit<TripRecord, 'id' | 'user_id' | 'created_at' | 'completed_at'> {
    completed_at?: string;
    ownerId?: string | null;
}
export interface TripPage {
    trips: TripRecord[];
    totals?: TripStats;
    pagination?: { nextOffset?: number | null; nextCursor?: string | null; hasMore?: boolean };
}
const EMPTY_STATS: TripStats = { totalTrips: 0, totalFare: 0, totalDistance: 0 };

export async function loadTripHistoryPage(limit: number, offset = 0, cursor?: string): Promise<TripPage> {
    const query = new URLSearchParams({ limit: String(limit), offset: String(offset), includeTotals: 'true' });
    if (cursor) query.set('cursor', cursor);
    const response = await fetch(`/api/trips?${query}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Trip history unavailable (${response.status}).`);
    const result = await response.json() as TripPage;
    if (!Array.isArray(result.trips)) throw new Error('Invalid trip history response.');
    // Normalize presentation only. Recorded fare/distance are not today's quote.
    return { ...result, trips: result.trips.map((trip) => ({ ...trip, direction: normalizeTripHistoryDirection(trip.direction) })) };
}

export function useTripHistory() {
    const { user } = useAuth();
    const ownerRef = useRef(user?.id ?? null);
    const [recentTrips, setRecentTrips] = useState<TripRecord[]>([]);
    const [allTrips, setAllTrips] = useState<TripRecord[]>([]);
    const [stats, setStats] = useState<TripStats>(EMPTY_STATS);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [totalsAvailable, setTotalsAvailable] = useState(false);
    const [loadedOwner, setLoadedOwner] = useState<string | null>(user?.id ?? null);
    const pageRef = useRef<{ offset: number; cursor?: string }>({ offset: 0 });
    const requestRef = useRef(0);

    const applyTotals = useCallback((totals?: TripStats) => {
        const valid = totals && Object.values(totals).every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0)
            && ['totalTrips', 'totalFare', 'totalDistance'].every((key) => key in totals);
        setTotalsAvailable(Boolean(valid));
        setStats(valid ? totals : EMPTY_STATS);
    }, []);

    const fetchRecentTrips = useCallback(async () => {
        const owner = ownerRef.current;
        if (!owner) return;
        try {
            const result = await loadTripHistoryPage(3);
            if (ownerRef.current !== owner) return;
            setRecentTrips(result.trips);
            applyTotals(result.totals);
            setError(null);
        } catch (failure) {
            if (ownerRef.current === owner) setError(failure instanceof Error ? failure.message : 'Trip history unavailable.');
        }
    }, [applyTotals]);

    const fetchPage = useCallback(async (append: boolean) => {
        const owner = ownerRef.current;
        if (!owner) return;
        const request = ++requestRef.current;
        const page = append ? pageRef.current : { offset: 0 };
        setLoading(true);
        try {
            const result = await loadTripHistoryPage(100, page.offset, 'cursor' in page ? page.cursor : undefined);
            if (ownerRef.current !== owner || requestRef.current !== request) return;
            setAllTrips((current) => append
                ? [...new Map([...current, ...result.trips].map((trip) => [trip.id, trip])).values()] : result.trips);
            applyTotals(result.totals);
            const nextOffset = result.pagination?.nextOffset;
            const nextCursor = result.pagination?.nextCursor;
            const more = result.pagination?.hasMore ?? (typeof nextOffset === 'number' || typeof nextCursor === 'string');
            setHasMore(more);
            pageRef.current = { offset: typeof nextOffset === 'number' ? nextOffset : page.offset + result.trips.length,
                cursor: nextCursor ?? undefined };
            setError(null);
        } catch (failure) {
            if (ownerRef.current === owner && requestRef.current === request) {
                setError(failure instanceof Error ? failure.message : 'Trip history unavailable.');
            }
        } finally { if (requestRef.current === request) setLoading(false); }
    }, [applyTotals]);
    const fetchAllTrips = useCallback(() => fetchPage(false), [fetchPage]);
    const fetchMoreTrips = useCallback(() => hasMore && !loading ? fetchPage(true) : Promise.resolve(), [fetchPage, hasMore, loading]);

    const saveTrip = useCallback(async (trip: TripWrite) => {
        // Capture synchronously, before ARRIVED can be acknowledged/reset by the UI.
        const state = useTripStore.getState();
        const snapshot = state.journeySnapshot;
        const useSnapshot = trip.completed_at === undefined || trip.client_trip_id === snapshot.tripId;
        const ownerId = trip.ownerId === undefined ? (useSnapshot ? state.tripOwnerId ?? null : null) : trip.ownerId;
        const { ownerId: _owner, ...fields } = trip;
        void _owner;
        const payload = { ...fields, client_trip_id: useSnapshot ? snapshot.tripId ?? trip.client_trip_id : trip.client_trip_id,
            started_at: useSnapshot && snapshot.startedAt != null ? new Date(snapshot.startedAt).toISOString() : trip.started_at,
            completed_at: useSnapshot && snapshot.completedAt != null ? new Date(snapshot.completedAt).toISOString() : trip.completed_at,
            direction: normalizeTripHistoryDirection(trip.direction) };
        // Queue first for every response class. No direct-write path can lose a 401/403.
        const item = await enqueueOutbox('trip_history', '/api/trips', payload, payload.client_trip_id, 'POST', ownerId);
        if (item.state === 'quarantined' || (typeof navigator !== 'undefined' && !navigator.onLine)) return item;
        const result = await flushOutbox(fetch, { getOwnerId: async () => {
            const { data, error: authError } = await createClient().auth.getUser();
            return authError ? null : data.user?.id ?? null;
        } });
        if (result.sent > 0) await fetchRecentTrips();
        return item;
    }, [fetchRecentTrips]);

    useEffect(() => {
        ownerRef.current = user?.id ?? null;
        requestRef.current += 1;
        pageRef.current = { offset: 0 };
        let cancelled = false;
        queueMicrotask(() => {
            if (cancelled) return;
            setLoadedOwner(user?.id ?? null);
            setRecentTrips([]);
            setAllTrips([]);
            setStats(EMPTY_STATS);
            setError(null);
            setHasMore(false);
            setTotalsAvailable(false);
            setLoading(false);
            if (user?.id) void fetchRecentTrips();
        });
        return () => { cancelled = true; };
    }, [fetchRecentTrips, user?.id]);

    const visible = !!user?.id && loadedOwner === user.id;
    return { recentTrips: visible ? recentTrips : [], allTrips: visible ? allTrips : [],
        stats: visible ? stats : EMPTY_STATS, loading: visible && loading, error: visible ? error : null,
        hasMore: visible && hasMore, totalsAvailable: visible && totalsAvailable,
        saveTrip, fetchRecentTrips, fetchAllTrips, fetchMoreTrips };
}
