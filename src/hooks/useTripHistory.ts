'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { getTripHistoryRepairPatch, normalizeTripHistoryRecord } from '@/domain/tripHistory';
import { enqueueOutbox } from '@/domain/offline/outbox';

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

export interface TripStats {
    totalTrips: number;
    totalFare: number;
    totalDistance: number;
}

interface TripWrite {
    client_trip_id: string;
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
}

export function useTripHistory() {
    const { user } = useAuth();
    const [recentTrips, setRecentTrips] = useState<TripRecord[]>([]);
    const [allTrips, setAllTrips] = useState<TripRecord[]>([]);
    const [stats, setStats] = useState<TripStats>({ totalTrips: 0, totalFare: 0, totalDistance: 0 });
    const [loading, setLoading] = useState(false);

    const computeStats = (trips: TripRecord[]): TripStats => ({
        totalTrips: trips.length,
        totalFare: trips.reduce((sum, trip) => sum + Number(trip.fare), 0),
        totalDistance: trips.reduce((sum, trip) => sum + Number(trip.distance_km), 0),
    });

    const repairTrips = useCallback((trips: TripRecord[]) => {
        trips.forEach((trip) => {
            const patch = getTripHistoryRepairPatch(trip);
            if (!patch) return;
            void fetch('/api/trips', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: trip.id, patch }),
                cache: 'no-store',
            });
        });
    }, []);

    const loadTrips = useCallback(async (limit: number): Promise<TripRecord[]> => {
        const response = await fetch(`/api/trips?limit=${limit}`, { cache: 'no-store' });
        if (!response.ok) return [];
        const result = await response.json() as { trips?: TripRecord[] };
        const rawTrips = result.trips ?? [];
        repairTrips(rawTrips);
        return rawTrips.map(normalizeTripHistoryRecord);
    }, [repairTrips]);

    const fetchRecentTrips = useCallback(async () => {
        if (!user) return;
        try {
            const trips = await loadTrips(3);
            setRecentTrips(trips);
            setAllTrips((current) => current.length > 0 ? current : trips);
            setStats((current) => current.totalTrips > 0 ? current : computeStats(trips));
        } catch (error) {
            console.warn('[TripHistory] Recent trips unavailable:', error);
        }
    }, [loadTrips, user]);

    const fetchAllTrips = useCallback(async () => {
        setLoading(true);
        try {
            const trips = await loadTrips(100);
            setAllTrips(trips);
            setStats(computeStats(trips));
        } catch (error) {
            console.warn('[TripHistory] Trip history unavailable:', error);
        } finally {
            setLoading(false);
        }
    }, [loadTrips]);

    const saveTrip = useCallback(async (trip: TripWrite) => {
        if (!user) return;
        const payload = normalizeTripHistoryRecord(trip);
        const enqueue = () => enqueueOutbox(
            'trip_history',
            '/api/trips',
            payload,
            trip.client_trip_id,
        );

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            await enqueue();
            return;
        }

        try {
            const response = await fetch('/api/trips', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Idempotency-Key': trip.client_trip_id,
                },
                body: JSON.stringify(payload),
                cache: 'no-store',
            });
            if (response.ok) {
                await fetchRecentTrips();
                return;
            }
            if (response.status === 408 || response.status === 429 || response.status >= 500) {
                await enqueue();
            }
        } catch {
            await enqueue();
        }
    }, [fetchRecentTrips, user]);

    useEffect(() => {
        if (user) void fetchRecentTrips();
        else {
            setRecentTrips([]);
            setAllTrips([]);
            setStats({ totalTrips: 0, totalFare: 0, totalDistance: 0 });
        }
    }, [fetchRecentTrips, user]);

    return { recentTrips, allTrips, stats, loading, saveTrip, fetchRecentTrips, fetchAllTrips };
}