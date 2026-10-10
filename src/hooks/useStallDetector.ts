'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    STALL_CONFIG,
    type StallEvidenceSample,
} from '@/domain/alerts/stall';
import { enqueueOutbox } from '@/domain/offline/outbox';
import { useLocationStore } from '@/store/useLocationStore';
import { useTripStore } from '@/store/useTripStore';
import { useTrainStore } from '@/store/useTrainStore';
import { getDistanceKm } from '@/utils/geo';
import type { StallReason, StallSeverity } from '@/domain/crowd/stallReport';
import type { IncidentVoteState } from '@/domain/crowd/incidentReceiver';
import { getAnonymousCrowdDeviceId } from '@/domain/crowd/lease';
import { isReliableStallWindow } from '@/domain/crowd/stallDetection';
import { useRuntimeApiConfig } from '@/domain/crowd/useRuntimeConfig';

const AUTO_DISMISS_MS = 15_000;

export type StallState = 'IDLE' | 'MONITORING' | 'STALLED' | 'CONFIRMED_DELAY' | 'DISMISSED';

export interface StallDetectorResult {
    state: StallState;
    stallDurationMin: number;
    reportStatus: IncidentVoteState | 'idle';
    onConfirmTraffic: () => void;
    onConfirmEmergency: () => void;
    onDismissDelay: () => void;
}


function createReportId() {
    return typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function routeDistanceMeters() {
    return useTripStore.getState().journeySnapshot.completedDistanceMeters;
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
    const config = useRuntimeApiConfig().stall;
    const status = useTripStore((state) => state.status);
    const [state, setState] = useState<StallState>('IDLE');
    const [stallDurationMin, setStallDurationMin] = useState(0);
    const [reportStatus, setReportStatus] = useState<IncidentVoteState | 'idle'>('idle');
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
            ? Date.now() + useTrainStore.getState().apiConfig.stall.deviceCooldownMs
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
        if (!sample?.location || sample.source !== 'gps' || !sample.timestamp || !anchorStation
            || trip.isDevMode || trip.isGpsOverride || Date.now() - sample.timestamp > 15_000) return;
        setReportStatus('pending');
        const deviceId = await getAnonymousCrowdDeviceId();
        if (!deviceId) { setReportStatus('error'); return; }
        const currentSample = useLocationStore.getState().sample;
        if (currentSample?.source !== 'gps' || currentSample.timestamp !== sample.timestamp
            || Date.now() - sample.timestamp > 15_000 || useTripStore.getState().status !== 'TRANSIT') {
            setReportStatus('error'); return;
        }

        const reportId = createReportId();
        const body = {
            reportId,
            deviceId,
            lineId: anchorStation.lineId,
            lat: sample.location.latitude,
            lng: sample.location.longitude,
            accuracyMeters: sample.accuracyMeters,
            severity,
            reason,
            stallDurationMin,
            locationSource: 'gps',
            observedAt: sample.timestamp,
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
                signal: AbortSignal.timeout(10_000),
            });
            if (response.ok) {
                const result = await response.json().catch(() => null) as { ok?: boolean } | null;
                setReportStatus(result?.ok ? 'confirmed' : 'error'); return;
            }
            if (response.status !== 408 && response.status !== 429 && response.status < 500) {
                setReportStatus('error'); return;
            }
        } catch {
            // Queue below.
        }

        try { await enqueueOutbox(
            'stall_report',
            '/api/stall-report',
            body,
            reportId,
        ); setReportStatus('queued'); } catch { setReportStatus('error'); }
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
                || locationSample.timestamp <= (lastLocationTimestampRef.current ?? 0)
                || Date.now() - locationSample.timestamp > 15_000
                || locationSample.timestamp > Date.now() + 5000
                || document.hidden || !navigator.onLine
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
            const windowMs = (config.windowSamples - 1) * config.sampleIntervalMs;
            samplesRef.current = [
                ...samplesRef.current,
                {
                    timestamp: now,
                    routeDistanceMeters: routeDistanceMeters(),
                    speedKph: locationSample.speedKph ?? 0,
                },
            ].filter((evidence) => evidence.timestamp >= now - windowMs - config.sampleIntervalMs * 2)
                .slice(-config.windowSamples - 2);

            if (!isReliableStallWindow(samplesRef.current, config)) return;

            const durationMs = now - samplesRef.current[0].timestamp;
            setStallDurationMin(Math.max(1, Math.round(durationMs / 60_000)));
            setState('STALLED');
            autoDismissRef.current = setTimeout(() => {
                resetPrompt(true);
            }, AUTO_DISMISS_MS);
        };

        sample();
        const interval = window.setInterval(sample, config.sampleIntervalMs);
        return () => window.clearInterval(interval);
    }, [resetPrompt, state, status, config]);

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
        cooldownUntilRef.current = Date.now() + config.deviceCooldownMs;
        setState('CONFIRMED_DELAY');
    }, [submitStallReport, config.deviceCooldownMs]);

    const onDismissDelay = useCallback(() => {
        resetPrompt(true);
    }, [resetPrompt]);

    return {
        state,
        stallDurationMin,
        reportStatus,
        onConfirmTraffic,
        onConfirmEmergency,
        onDismissDelay,
    };
}
