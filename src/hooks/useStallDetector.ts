'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    isRouteStalledWindow,
    STALL_CONFIG,
    trimStallEvidenceWindow,
    type StallEvidenceSample,
} from '@/domain/alerts/stall';
import { enqueueOutbox } from '@/domain/offline/outbox';
import { useLocationStore } from '@/store/useLocationStore';
import { useTripStore } from '@/store/useTripStore';
import { getDistanceKm } from '@/utils/geo';
import type { StallReason, StallSeverity } from '@/domain/crowd/stallReport';

const AUTO_DISMISS_MS = 15_000;
const DEVICE_ID_KEY = 'traintracks_anonymous_device_id';

export type StallState = 'IDLE' | 'MONITORING' | 'STALLED' | 'CONFIRMED_DELAY' | 'DISMISSED';

export interface StallDetectorResult {
    state: StallState;
    stallDurationMin: number;
    onConfirmTraffic: () => void;
    onConfirmEmergency: () => void;
    onDismissDelay: () => void;
}

function getDeviceId(): string {
    if (typeof window === 'undefined') return 'server';

    let id = window.localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
        id = typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `tt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        window.localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
}

function createReportId() {
    return typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function routeDistanceMeters() {
    const snapshot = useTripStore.getState().journeySnapshot;
    const route = snapshot.route;
    if (!route) return 0;

    const completed = route.edges
        .slice(0, snapshot.activeEdgeIndex)
        .reduce((sum, edge) => sum + edge.distanceMeters, 0);
    const active = route.edges[snapshot.activeEdgeIndex];
    return completed + (active?.distanceMeters ?? 0) * snapshot.legProgress / 100;
}

function isNearJourneyStation() {
    const sample = useLocationStore.getState().sample;
    const state = useTripStore.getState();
    if (!sample?.location) return false;

    const accuracy = sample.accuracyMeters ?? 999;
    const radiusMeters = Math.min(
        STALL_CONFIG.maxStationAccuracyMeters,
        Math.max(55, accuracy * 1.25),
    );
    return [state.currentStation, state.nextStation]
        .filter((station): station is NonNullable<typeof station> => !!station)
        .some((station) => getDistanceKm(sample.location!, station) * 1000 <= radiusMeters);
}

export function useStallDetector(): StallDetectorResult {
    const status = useTripStore((state) => state.status);
    const [state, setState] = useState<StallState>('IDLE');
    const [stallDurationMin, setStallDurationMin] = useState(0);
    const samplesRef = useRef<StallEvidenceSample[]>([]);
    const lastLocationTimestampRef = useRef<number | null>(null);
    const cooldownUntilRef = useRef(0);
    const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const resetPrompt = useCallback((cooldown = true) => {
        if (autoDismissRef.current) {
            clearTimeout(autoDismissRef.current);
            autoDismissRef.current = null;
        }
        samplesRef.current = [];
        cooldownUntilRef.current = cooldown
            ? Date.now() + STALL_CONFIG.rearmCooldownMs
            : 0;
        setState(status === 'TRANSIT' ? 'MONITORING' : 'IDLE');
    }, [status]);

    const submitStallReport = useCallback(async (
        severity: StallSeverity,
        reason: StallReason,
    ) => {
        const sample = useLocationStore.getState().sample;
        const trip = useTripStore.getState();
        const anchorStation = trip.currentStation ?? trip.origin;
        if (!sample?.location || sample.source !== 'gps' || !anchorStation) return;

        const reportId = createReportId();
        const body = {
            reportId,
            deviceId: getDeviceId(),
            lineId: anchorStation.lineId,
            lat: sample.location.latitude,
            lng: sample.location.longitude,
            accuracyMeters: sample.accuracyMeters,
            severity,
            reason,
            stallDurationMin,
        };

        try {
            const response = await fetch('/api/stall-report', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Idempotency-Key': reportId,
                },
                cache: 'no-store',
                body: JSON.stringify(body),
            });
            if (response.ok) return;
        } catch {
            // Queue below.
        }

        await enqueueOutbox(
            'stall_report',
            '/api/stall-report',
            body,
            reportId,
        );
    }, [stallDurationMin]);

    useEffect(() => {
        if (status !== 'TRANSIT') {
            resetPrompt(false);
            lastLocationTimestampRef.current = null;
            return;
        }

        samplesRef.current = [];
        cooldownUntilRef.current = 0;
        lastLocationTimestampRef.current = null;
        setState('MONITORING');
    }, [status, resetPrompt]);

    useEffect(() => {
        if (status !== 'TRANSIT') return;

        const sample = () => {
            const locationSample = useLocationStore.getState().sample;
            const journey = useTripStore.getState().journeySnapshot;
            if (
                !locationSample?.location
                || locationSample.source !== 'gps'
                || !locationSample.timestamp
                || locationSample.timestamp === lastLocationTimestampRef.current
                || (locationSample.accuracyMeters ?? 999) > STALL_CONFIG.maxStationAccuracyMeters
            ) {
                return;
            }
            lastLocationTimestampRef.current = locationSample.timestamp;

            if (
                !journey.hasDepartedOrigin
                || journey.phase !== 'ONBOARD_MOVING'
                || isNearJourneyStation()
            ) {
                samplesRef.current = [];
                return;
            }
            if (Date.now() < cooldownUntilRef.current || state !== 'MONITORING') return;

            const now = locationSample.timestamp;
            samplesRef.current = trimStallEvidenceWindow([
                ...samplesRef.current,
                {
                    timestamp: now,
                    routeDistanceMeters: routeDistanceMeters(),
                    speedKph: locationSample.speedKph ?? 0,
                },
            ], now);

            if (!isRouteStalledWindow(samplesRef.current)) return;

            const durationMs = now - samplesRef.current[0].timestamp;
            setStallDurationMin(Math.max(1, Math.round(durationMs / 60_000)));
            setState('STALLED');
            autoDismissRef.current = setTimeout(() => {
                resetPrompt(true);
            }, AUTO_DISMISS_MS);
        };

        sample();
        const interval = window.setInterval(sample, STALL_CONFIG.sampleIntervalMs);
        return () => window.clearInterval(interval);
    }, [resetPrompt, state, status]);

    useEffect(() => () => {
        if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    }, []);

    const onConfirmTraffic = useCallback(() => {
        void submitStallReport('confirmed_traffic', 'slow_traffic');
        resetPrompt(true);
    }, [resetPrompt, submitStallReport]);

    const onConfirmEmergency = useCallback(() => {
        if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
        void submitStallReport('confirmed_emergency', 'full_stop');
        samplesRef.current = [];
        cooldownUntilRef.current = Date.now() + STALL_CONFIG.rearmCooldownMs;
        setState('CONFIRMED_DELAY');
    }, [submitStallReport]);

    const onDismissDelay = useCallback(() => {
        resetPrompt(true);
    }, [resetPrompt]);

    return {
        state,
        stallDurationMin,
        onConfirmTraffic,
        onConfirmEmergency,
        onDismissDelay,
    };
}
