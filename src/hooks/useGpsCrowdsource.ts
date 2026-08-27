'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTripStore } from '@/store/useTripStore';
import { useTrainStore } from '@/store/useTrainStore';
import { useLocationStore } from '@/store/useLocationStore';
import { useSmartLocation } from './useSmartLocation';
import { isBuiltLine, isBuiltRailLine } from '@/domain/railway';
import { getDistanceKm } from '@/utils/geo';
import { getAdaptiveCrowdReportMs, getNetworkProfile } from '@/domain/network/runtime';
import { enqueueOutbox } from '@/domain/offline/outbox';
import type { SelfTrainPresencePhase, TrainPresence, TrainPresenceStatus } from '@/types/train';

const UNCHANGED_HEARTBEAT_MS = 15_000;
const MIN_BROADCAST_SPEED_KPH = 5;
const MIN_ONBOARD_DISTANCE_METERS = 80;
const REQUIRED_ONBOARD_SAMPLES = 2;
const DEVICE_ID_KEY = 'traintracks_anonymous_device_id';
const BROADCAST_LEASE_KEY = 'traintracks_crowd_broadcast_lease';

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

interface CrowdBroadcastLease {
    deviceId: string;
    tabId: string;
    expiresAt: number;
}

function createTabId(): string {
    return 'tab-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function readBroadcastLease(): CrowdBroadcastLease | null {
    if (typeof window === 'undefined') return null;

    try {
        const raw = window.localStorage.getItem(BROADCAST_LEASE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<CrowdBroadcastLease>;
        if (
            typeof parsed.deviceId !== 'string' ||
            typeof parsed.tabId !== 'string' ||
            typeof parsed.expiresAt !== 'number'
        ) {
            return null;
        }
        return parsed as CrowdBroadcastLease;
    } catch {
        return null;
    }
}

function claimBroadcastLease(deviceId: string, tabId: string, leaseMs: number, now = Date.now()): boolean {
    if (typeof window === 'undefined') return false;

    try {
        const current = readBroadcastLease();
        if (
            current &&
            current.deviceId === deviceId &&
            current.tabId !== tabId &&
            current.expiresAt > now
        ) {
            return false;
        }

        const next: CrowdBroadcastLease = {
            deviceId,
            tabId,
            expiresAt: now + leaseMs,
        };
        window.localStorage.setItem(BROADCAST_LEASE_KEY, JSON.stringify(next));
        const confirmed = readBroadcastLease();
        return confirmed?.deviceId === deviceId && confirmed.tabId === tabId;
    } catch {
        return true;
    }
}

function releaseBroadcastLease(deviceId: string, tabId: string) {
    if (typeof window === 'undefined') return;

    try {
        const current = readBroadcastLease();
        if (current?.deviceId === deviceId && current.tabId === tabId) {
            window.localStorage.removeItem(BROADCAST_LEASE_KEY);
        }
    } catch {
        // Storage can be unavailable in private browsing; the reporting loop still works.
    }
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
    const { status: tripStatus, currentStation, nextStation, journeySnapshot, isDevMode, isGpsOverride, transitMode, dataMode } = useTripStore();
    const { crowdConsent } = useTrainStore();
    const { location, speed, locationSample } = useSmartLocation();
    const [deviceId, setDeviceId] = useState<string | null>(null);
    const onboardEvidenceRef = useRef(0);
    const [serverPseudonym, setServerPseudonym] = useState<string | null>(null);
    const latestPresenceRef = useRef<TrainPresence | null>(null);
    const broadcastInFlightRef = useRef(false);
    const lastBroadcastAtRef = useRef(0);
    const lastSentPresenceRef = useRef<TrainPresence | null>(null);
    const tabIdRef = useRef(createTabId());
    const [presencePhase, setPresencePhase] = useState<SelfTrainPresencePhase>('inactive');

    useEffect(() => {
        setDeviceId(getDeviceId());
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

        const currentSpeed = speed ?? 0;
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
            currentSpeed >= MIN_BROADCAST_SPEED_KPH &&
            hasMovementStatus &&
            hasRouteMovement;

        onboardEvidenceRef.current = hasOnboardEvidence
            ? onboardEvidenceRef.current + 1
            : Math.max(0, onboardEvidenceRef.current - 1);

        if (onboardEvidenceRef.current >= REQUIRED_ONBOARD_SAMPLES) {
            setPresencePhase('moving');
        } else {
            setPresencePhase((phase) => phase === 'waiting_at_origin' ? phase : 'waiting_at_origin');
        }
    }, [
        crowdConsent,
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
        presencePhase,
        speed,
        transitMode,
        tripStatus,
    ]);

    const trainPresence = useMemo<TrainPresence | null>(() => {
        if (!deviceId) return null;
        if (presencePhase !== 'moving' && presencePhase !== 'dwelling') return null;
        if (transitMode !== 'train') return null;
        if (isDevMode || isGpsOverride) return null;
        if (tripStatus !== 'TRANSIT') return null;
        if (!location || !currentStation || !journeySnapshot.direction) return null;
        const lineId = currentStation.lineId;
        if (!isBuiltRailLine(lineId)) return null;
        if (journeySnapshot.statusCode === 'TRANSFER_ACTIVE') return null;

        const currentSpeed = speed ?? 0;
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
            lat: location.latitude,
            lng: location.longitude,
            speedKph: currentSpeed,
            statusCode,
            stationId: anchorStationId,
            stationName: anchorStationName,
            source: 'crowd',
            updatedAt: Date.now(),
            confidence: Math.max(0.4, Math.min(0.95, currentSpeed / 60)),
        };
    }, [
        deviceId,
        serverPseudonym,
        currentStation,
        isDevMode,
        isGpsOverride,
        journeySnapshot.direction,
        journeySnapshot.statusCode,
        location,
        nextStation,
        presencePhase,
        speed,
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
        const tabId = tabIdRef.current;
        let cancelled = false;
        let activeController: AbortController | null = null;
        const reportIntervalMs = getAdaptiveCrowdReportMs(getNetworkProfile(dataMode));
        const leaseMs = Math.max(15_000, reportIntervalMs * 3);

        const broadcast = async () => {
            const latest = latestPresenceRef.current;
            if (!latest || latest.source !== 'crowd') return;

            if (typeof document !== 'undefined' && document.hidden) {
                releaseBroadcastLease(activeDeviceId, tabId);
                if (!cancelled) {
                    useTrainStore.getState().setBroadcasting(false);
                }
                return;
            }

            const now = Date.now();
            if (
                broadcastInFlightRef.current ||
                now - lastBroadcastAtRef.current < reportIntervalMs - 250
            ) {
                return;
            }

            const isUnchanged =
                !hasMaterialPresenceChange(latest, lastSentPresenceRef.current) &&
                now - lastBroadcastAtRef.current < UNCHANGED_HEARTBEAT_MS;
            if (isUnchanged) return;

            if (!claimBroadcastLease(activeDeviceId, tabId, leaseMs, now)) {
                if (!cancelled) {
                    useTrainStore.getState().setBroadcasting(false);
                }
                return;
            }

            broadcastInFlightRef.current = true;
            lastBroadcastAtRef.current = now;
            const controller = new AbortController();
            activeController = controller;
            const sampleId = `${activeDeviceId}:${latest.updatedAt}`;
            const body = {
                ...latest,
                deviceId: activeDeviceId,
                accuracyMeters: useLocationStore.getState().sample?.accuracyMeters ?? 250,
                sampleId,
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
                        const result = await response.json().catch(() => null) as {
                            train?: { deviceId?: string };
                        } | null;
                        const pseudonym = result?.train?.deviceId;
                        if (pseudonym && pseudonym !== activeDeviceId) {
                            setServerPseudonym(pseudonym);
                        }
                        lastSentPresenceRef.current = latest;
                    } else if (response.status === 429 || response.status >= 500) {
                        await enqueueOutbox('crowd_presence', '/api/crowd/presence', body, sampleId);
                    }
                    useTrainStore.getState().setBroadcasting(response.ok);
                }
            } catch (error) {
                if (!cancelled && !(error instanceof DOMException && error.name === 'AbortError')) {
                    await enqueueOutbox('crowd_presence', '/api/crowd/presence', body, sampleId);
                    useTrainStore.getState().setBroadcasting(false);
                }
            } finally {
                if (activeController === controller) {
                    activeController = null;
                }
                broadcastInFlightRef.current = false;
            }
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
                activeController?.abort();
                activeController = null;
                broadcastInFlightRef.current = false;
                releaseBroadcastLease(activeDeviceId, tabId);
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

        return () => {
            cancelled = true;
            window.clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            activeController?.abort();
            broadcastInFlightRef.current = false;
            releaseBroadcastLease(activeDeviceId, tabId);
            useTrainStore.getState().setBroadcasting(false);
        };
    }, [dataMode, deviceId, shouldBroadcast]);
}
