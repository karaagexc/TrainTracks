'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTripStore } from '@/store/useTripStore';
import { useTrainStore } from '@/store/useTrainStore';
import { useLocationStore } from '@/store/useLocationStore';
import { useSmartLocation } from './useSmartLocation';
import { isBuiltLine, isBuiltRailLine } from '@/domain/railway';
import { getDistanceKm } from '@/utils/geo';
import { getPollBackoffMs, parseRetryAfter } from '@/domain/network/runtime';
import { enqueueOutbox } from '@/domain/offline/outbox';
import { claimCrowdLease, releaseCrowdLease, getAnonymousCrowdDeviceId } from '@/domain/crowd/lease';
import type { SelfTrainPresencePhase, TrainPresence, TrainPresenceStatus } from '@/types/train';
import { useRuntimeApiConfig } from '@/domain/crowd/useRuntimeConfig';

const UNCHANGED_HEARTBEAT_MS = 15_000;
const MIN_ONBOARD_DISTANCE_METERS = 80;

function createTabId(): string {
    return 'tab-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function mapJourneyStatus(statusCode: string): TrainPresenceStatus {
    switch (statusCode) {
        case 'AT_STATION':
            return 'AT_STATION';
        case 'LEAVING_STATION':
            return 'LEAVING_STATION';
        case 'APPROACHING_STATION':
            return 'APPROACHING_STATION';
        case 'BETWEEN_STATIONS':
        default:
            return 'IN_TRANSIT';
    }
}

function hasMaterialPresenceChange(next: TrainPresence, previous: TrainPresence | null): boolean {
    if (!previous) return true;
    if (
        next.lineId !== previous.lineId ||
        next.direction !== previous.direction ||
        next.statusCode !== previous.statusCode ||
        next.stationId !== previous.stationId
    ) {
        return true;
    }

    const distanceMeters = getDistanceKm(
        { latitude: previous.lat, longitude: previous.lng },
        { latitude: next.lat, longitude: next.lng },
    ) * 1000;

    return distanceMeters >= 20 || Math.abs(next.speedKph - previous.speedKph) >= 3;
}
export function useGpsCrowdsource() {
    const apiConfig = useRuntimeApiConfig();
    const tripStatus = useTripStore((state) => state.status);
    const currentStation = useTripStore((state) => state.currentStation);
    const nextStation = useTripStore((state) => state.nextStation);
    const journeySnapshot = useTripStore((state) => state.journeySnapshot);
    const isDevMode = useTripStore((state) => state.isDevMode);
    const isGpsOverride = useTripStore((state) => state.isGpsOverride);
    const transitMode = useTripStore((state) => state.transitMode);
    const crowdConsent = useTrainStore((state) => state.crowdConsent);
    const { location, locationSample } = useSmartLocation();
    const [deviceId, setDeviceId] = useState<string | null>(null);
    const onboardEvidenceRef = useRef(0);
    const evidenceTimestampRef = useRef(0);
    const [serverPseudonym, setServerPseudonym] = useState<string | null>(null);
    const latestPresenceRef = useRef<TrainPresence | null>(null);
    const broadcastInFlightRef = useRef(false);
    const lastBroadcastAtRef = useRef(0);
    const nextAttemptAtRef = useRef(0);
    const failuresRef = useRef(0);
    const lastSentPresenceRef = useRef<TrainPresence | null>(null);
    const tabIdRef = useRef(createTabId());
    const [presencePhase, setPresencePhase] = useState<SelfTrainPresencePhase>('inactive');

    useEffect(() => {
        let disposed = false;
        void getAnonymousCrowdDeviceId().then((id) => { if (!disposed) setDeviceId(id); });
        return () => { disposed = true; };
    }, []);

    useEffect(() => {
        const resetPresence = () => {
            onboardEvidenceRef.current = 0;
            setPresencePhase((phase) => phase === 'inactive' ? phase : 'inactive');
        };

        const liveEligible =
            crowdConsent === 'granted' &&
            transitMode === 'train' &&
            !isDevMode &&
            !isGpsOverride &&
            locationSample.source === 'gps' &&
            tripStatus === 'TRANSIT' &&
            !!location &&
            !!currentStation &&
            !!journeySnapshot.direction &&
            isBuiltLine(currentStation.lineId);

        if (!liveEligible) {
            resetPresence();
            return;
        }

        const isTransferPhase =
            journeySnapshot.statusCode === 'TRANSFER_ACTIVE' ||
            journeySnapshot.phase === 'TRANSFER_WALK' ||
            journeySnapshot.phase === 'TRANSFER_WAIT';

        if (isTransferPhase) {
            onboardEvidenceRef.current = 0;
            setPresencePhase((phase) => phase === 'waiting_at_origin' ? phase : 'waiting_at_origin');
            return;
        }

        if (presencePhase === 'moving' || presencePhase === 'dwelling') {
            const nextPhase = journeySnapshot.statusCode === 'AT_STATION' ? 'dwelling' : 'moving';
            setPresencePhase((phase) => phase === nextPhase ? phase : nextPhase);
            return;
        }

        const currentSpeed = locationSample.speedKph ?? 0;
        const distanceFromCurrentStationMeters = location && currentStation
            ? getDistanceKm(location, currentStation) * 1000
            : 0;
        const hasMovementStatus =
            journeySnapshot.statusCode === 'LEAVING_STATION' ||
            journeySnapshot.statusCode === 'BETWEEN_STATIONS' ||
            journeySnapshot.statusCode === 'APPROACHING_STATION';
        const hasRouteMovement =
            journeySnapshot.hasDepartedOrigin ||
            journeySnapshot.legProgress > 4 ||
            distanceFromCurrentStationMeters >= MIN_ONBOARD_DISTANCE_METERS;
        const hasOnboardEvidence =
            currentSpeed >= apiConfig.crowd.minSpeedKph &&
            hasMovementStatus &&
            hasRouteMovement;

        if (locationSample.timestamp !== null && locationSample.timestamp > evidenceTimestampRef.current) {
            evidenceTimestampRef.current = locationSample.timestamp;
            onboardEvidenceRef.current = hasOnboardEvidence
                ? onboardEvidenceRef.current + 1
                : Math.max(0, onboardEvidenceRef.current - 1);
        }

        if (onboardEvidenceRef.current >= apiConfig.crowd.requiredSamples) {
            setPresencePhase('moving');
        } else {
            setPresencePhase((phase) => phase === 'waiting_at_origin' ? phase : 'waiting_at_origin');
        }
    }, [
        crowdConsent,
        apiConfig.crowd,
        currentStation,
        isDevMode,
        isGpsOverride,
        journeySnapshot.direction,
        journeySnapshot.hasDepartedOrigin,
        journeySnapshot.legProgress,
        journeySnapshot.phase,
        journeySnapshot.statusCode,
        location,
        locationSample.source,
        locationSample.speedKph,
        locationSample.timestamp,
        presencePhase,
        transitMode,
        tripStatus,
    ]);

    const trainPresence = useMemo<TrainPresence | null>(() => {
        if (!deviceId) return null;
        if (presencePhase !== 'moving' && presencePhase !== 'dwelling') return null;
        if (transitMode !== 'train') return null;
        if (isDevMode || isGpsOverride) return null;
        if (crowdConsent !== 'granted' || locationSample.source !== 'gps'
            || locationSample.timestamp === null || !Number.isFinite(locationSample.timestamp)
            || Date.now() - locationSample.timestamp > 15_000) return null;
        if (tripStatus !== 'TRANSIT') return null;
        if (!location || !currentStation || !journeySnapshot.direction) return null;
        const lineId = currentStation.lineId;
        if (!isBuiltRailLine(lineId)) return null;
        if (journeySnapshot.statusCode === 'TRANSFER_ACTIVE') return null;

        const currentSpeed = locationSample.speedKph ?? 0;
        const statusCode = presencePhase === 'dwelling'
            ? 'AT_STATION'
            : mapJourneyStatus(journeySnapshot.statusCode);
        const anchorStationId = statusCode === 'AT_STATION' || statusCode === 'LEAVING_STATION'
            ? currentStation.id
            : nextStation?.id ?? currentStation.id;
        const anchorStationName = statusCode === 'AT_STATION' || statusCode === 'LEAVING_STATION'
            ? currentStation.name
            : nextStation?.name ?? currentStation.name;

        return {
            id: serverPseudonym ? `CROWD-${serverPseudonym}` : 'CROWD-LOCAL-' + deviceId.slice(0, 8),
            deviceId: serverPseudonym ?? deviceId,
            lineId,
            direction: journeySnapshot.direction,
            lat: locationSample.location?.latitude ?? location.latitude,
            lng: locationSample.location?.longitude ?? location.longitude,
            speedKph: currentSpeed,
            statusCode,
            stationId: anchorStationId,
            stationName: anchorStationName,
            source: 'crowd',
            updatedAt: locationSample.timestamp,
            sampleId: `${deviceId}:${locationSample.timestamp}`,
            confidence: Math.max(0.4, Math.min(0.95, currentSpeed / 60)),
        };
    }, [
        deviceId,
        crowdConsent,
        locationSample,
        serverPseudonym,
        currentStation,
        isDevMode,
        isGpsOverride,
        journeySnapshot.direction,
        journeySnapshot.statusCode,
        location,
        nextStation,
        presencePhase,
        transitMode,
        tripStatus,
    ]);

    useEffect(() => {
        latestPresenceRef.current = trainPresence;
        if (!trainPresence) {
            useTrainStore.getState().setCrowdTrain(null);
            useTrainStore.getState().setBroadcasting(false);
            return;
        }

        useTrainStore.getState().setCrowdTrain(trainPresence);
    }, [trainPresence]);

    const shouldBroadcast = crowdConsent === 'granted' && !!trainPresence;

    useEffect(() => {
        if (!shouldBroadcast || !deviceId) {
            useTrainStore.getState().setBroadcasting(false);
            return;
        }

        const activeDeviceId = deviceId;
        const tabId = `${tabIdRef.current}:${crypto.randomUUID()}`;
        let cancelled = false;
        let activeController: AbortController | null = null;
        const reportIntervalMs = Math.max(3000, apiConfig.crowd.intervalMs);
        const leaseMs = Math.max(15_000, reportIntervalMs * 3);

        const broadcast = async () => {
            const latest = latestPresenceRef.current;
            if (!latest || latest.source !== 'crowd') return;

            if (document.hidden || !navigator.onLine || Date.now() - latest.updatedAt > 15_000) {
                void releaseCrowdLease(activeDeviceId, tabId);
                if (!cancelled) {
                    useTrainStore.getState().setBroadcasting(false);
                }
                return;
            }

            const now = Date.now();
            if (
                broadcastInFlightRef.current ||
                now < nextAttemptAtRef.current ||
                now - lastBroadcastAtRef.current < reportIntervalMs - 250
            ) {
                return;
            }

            const isUnchanged =
                !hasMaterialPresenceChange(latest, lastSentPresenceRef.current) &&
                now - lastBroadcastAtRef.current < UNCHANGED_HEARTBEAT_MS;
            if (isUnchanged) return;

            broadcastInFlightRef.current = true;
            if (!await claimCrowdLease(activeDeviceId, tabId, leaseMs)) {
                broadcastInFlightRef.current = false;
                if (!cancelled) {
                    useTrainStore.getState().setBroadcasting(false);
                }
                return;
            }
            const rawSample = useLocationStore.getState().sample;
            if (cancelled || document.hidden || !navigator.onLine || rawSample?.source !== 'gps'
                || rawSample.timestamp !== latest.updatedAt || useTrainStore.getState().crowdConsent !== 'granted') {
                broadcastInFlightRef.current = false;
                void releaseCrowdLease(activeDeviceId, tabId);
                return;
            }
            lastBroadcastAtRef.current = now;
            const controller = new AbortController();
            activeController = controller;
            let timedOut = false;
            const requestTimeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 10_000);
            const sampleId = `${activeDeviceId}:${latest.updatedAt}`;
            const body = {
                ...latest,
                deviceId: activeDeviceId,
                accuracyMeters: useLocationStore.getState().sample?.accuracyMeters ?? 250,
                sampleId,
                locationSource: 'gps',
            };

            try {
                const response = await fetch('/api/crowd/presence', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Idempotency-Key': sampleId,
                    },
                    body: JSON.stringify(body),
                    cache: 'no-store',
                    signal: controller.signal,
                });
                if (!cancelled) {
                    if (response.ok) {
                        failuresRef.current = 0; nextAttemptAtRef.current = 0;
                        const result = await response.json().catch(() => null) as {
                            ok?: boolean;
                            train?: { deviceId?: string };
                        } | null;
                        if (cancelled || controller.signal.aborted || document.hidden || !navigator.onLine) return;
                        if (result?.ok !== true) throw new Error('Crowd report was not acknowledged.');
                        const pseudonym = result?.train?.deviceId;
                        if (pseudonym && pseudonym !== activeDeviceId) {
                            setServerPseudonym(pseudonym);
                        }
                        lastSentPresenceRef.current = latest;
                    } else if (response.status === 429 || response.status >= 500) {
                        failuresRef.current += 1;
                        nextAttemptAtRef.current = Date.now() + getPollBackoffMs(failuresRef.current,
                            parseRetryAfter(response.headers.get('Retry-After')));
                        await enqueueOutbox('crowd_presence', '/api/crowd/presence', body, sampleId);
                    }
                    if (!cancelled) useTrainStore.getState().setBroadcasting(response.ok);
                }
            } catch (error) {
                if (!cancelled && (timedOut || !(error instanceof DOMException && error.name === 'AbortError'))) {
                    failuresRef.current += 1;
                    nextAttemptAtRef.current = Date.now() + getPollBackoffMs(failuresRef.current);
                    await enqueueOutbox('crowd_presence', '/api/crowd/presence', body, sampleId);
                    useTrainStore.getState().setBroadcasting(false);
                }
            } finally {
                window.clearTimeout(requestTimeout);
                if (activeController === controller) {
                    activeController = null;
                }
                broadcastInFlightRef.current = false;
            }
        };

        const handleVisibilityChange = () => {
            if (document.hidden || !navigator.onLine) {
                activeController?.abort();
                activeController = null;
                void releaseCrowdLease(activeDeviceId, tabId);
                useTrainStore.getState().setBroadcasting(false);
                return;
            }
            void broadcast();
        };

        void broadcast();
        const interval = window.setInterval(() => {
            void broadcast();
        }, reportIntervalMs);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('online', handleVisibilityChange);
        window.addEventListener('offline', handleVisibilityChange);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('online', handleVisibilityChange);
            window.removeEventListener('offline', handleVisibilityChange);
            activeController?.abort();
            void releaseCrowdLease(activeDeviceId, tabId);
            useTrainStore.getState().setBroadcasting(false);
        };
    }, [apiConfig.crowd.intervalMs, deviceId, shouldBroadcast]);
}
