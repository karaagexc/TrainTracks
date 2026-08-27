import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTripStore } from '@/store/useTripStore';
import { useSmartLocation } from './useSmartLocation';
import { getDistanceKm } from '@/utils/geo';
import { getPrecisionFare } from '@/utils/fareNew';
import { getJourneyStationById } from '@/domain/journey/graph';
import type { Station } from '@/types';
import { evaluateWrongDirectionEvidence, WRONG_DIRECTION_CONFIG } from '@/domain/alerts/wrongDirection';

const CONFIG = WRONG_DIRECTION_CONFIG;

export interface WrongDirectionState {
    isWrongWay: boolean;
    confidence: 'LOW' | 'HIGH';
    reasons: string[];
    riskLevel: 'SJT_MISMATCH' | 'SVC_DEDUCTION' | 'NONE';
    estimatedPenalty: number;
    nearestStationName: string | null;
    dismiss: () => void;
}

function nearestRouteStation(location: { latitude: number; longitude: number }, routeStationIds: string[]): Station | null {
    let nearest: Station | null = null;
    let minDist = Infinity;

    routeStationIds.forEach((stationId) => {
        const station = getJourneyStationById(stationId);
        if (!station) return;
        const distance = getDistanceKm(location, station);
        if (distance < minDist) {
            minDist = distance;
            nearest = station;
        }
    });

    return nearest;
}

export function useWrongDirection(): WrongDirectionState {
    const {
        origin,
        destination,
        ticketType,
        ignoreWrongDirection,
        status: tripStatus,
        journeySnapshot,
        isGpsOverride,
    } = useTripStore();
    const { location, speed, rawHeading, gpsAccuracy } = useSmartLocation();

    const [state, setState] = useState<Omit<WrongDirectionState, 'dismiss'>>({
        isWrongWay: false,
        confidence: 'LOW',
        reasons: [],
        riskLevel: 'NONE',
        estimatedPenalty: 0,
        nearestStationName: null,
    });

    const consecutiveBadRef = useRef(0);
    const consecutiveGoodRef = useRef(0);
    const dismissedUntilRef = useRef(0);

    const activeRailEdge = useMemo(() => {
        const edge = journeySnapshot.route?.edges[journeySnapshot.activeEdgeIndex];
        return edge?.type === 'rail' ? edge : null;
    }, [journeySnapshot.activeEdgeIndex, journeySnapshot.route]);

    const shouldCheck = Boolean(
        origin &&
        destination &&
        location &&
        rawHeading !== null &&
        tripStatus === 'TRANSIT' &&
        journeySnapshot.phase === 'ONBOARD_MOVING' &&
        !journeySnapshot.gpsFallbackActive &&
        !isGpsOverride &&
        !ignoreWrongDirection &&
        activeRailEdge &&
        (speed ?? 0) >= CONFIG.minSpeedKph &&
        (gpsAccuracy ?? 999) <= CONFIG.maxGpsAccuracyMeters,
    );

    useEffect(() => {
        consecutiveBadRef.current = 0;
        consecutiveGoodRef.current = 0;
        dismissedUntilRef.current = 0;
        setState((prev) => ({ ...prev, isWrongWay: false, nearestStationName: null }));
    }, [origin?.id, destination?.id]);

    useEffect(() => {
        if (!shouldCheck || !location || rawHeading === null || !journeySnapshot.route || !activeRailEdge || !origin || !destination) {
            consecutiveBadRef.current = 0;
            return;
        }

        if (Date.now() < dismissedUntilRef.current) return;

        const fromStation = getJourneyStationById(activeRailEdge.fromStationId);
        const toStation = getJourneyStationById(activeRailEdge.toStationId);
        if (!fromStation || !toStation) return;

        const evidence = evaluateWrongDirectionEvidence(location, rawHeading, fromStation, toStation);

        if (evidence.reason === 'near_source' || evidence.reason === 'near_target') {
            consecutiveBadRef.current = 0;
            return;
        }

        if (!evidence.isOpposite) {
            consecutiveBadRef.current = 0;
            consecutiveGoodRef.current += 1;
            if (state.isWrongWay && consecutiveGoodRef.current >= 3) {
                setState((prev) => ({ ...prev, isWrongWay: false }));
            }
            return;
        }

        consecutiveGoodRef.current = 0;
        consecutiveBadRef.current += 1;
        if (consecutiveBadRef.current < CONFIG.persistenceCount) return;

        const nearest = nearestRouteStation(location, journeySnapshot.route.stationIds);
        let risk: WrongDirectionState['riskLevel'] = 'NONE';
        let penalty = 0;

        if (ticketType === 'SJT') {
            risk = 'SJT_MISMATCH';
            if (nearest) {
                const paidFare = getPrecisionFare(origin, destination, 'SJT');
                const currentCost = getPrecisionFare(origin, nearest, 'SJT');
                penalty = Math.max(0, currentCost - paidFare);
            }
        } else if (ticketType && ['SVC', 'CONCESSION', 'DEBIT', 'CREDIT', 'BUS_REGULAR'].includes(ticketType)) {
            risk = 'SVC_DEDUCTION';
        }

        setState({
            isWrongWay: true,
            confidence: 'HIGH',
            reasons: [
                `Expected: ${toStation.name}`,
                `Speed: ${Math.round(speed ?? 0)}km/h`,
                `Opposite bearing: ${Math.round(evidence.angleDifferenceDeg)}deg`,
                `Stable checks: ${consecutiveBadRef.current}`,
            ],
            riskLevel: risk,
            estimatedPenalty: penalty,
            nearestStationName: nearest?.name ?? null,
        });
    }, [
        activeRailEdge,
        destination,
        gpsAccuracy,
        ignoreWrongDirection,
        isGpsOverride,
        journeySnapshot.gpsFallbackActive,
        journeySnapshot.phase,
        journeySnapshot.route,
        location,
        origin,
        rawHeading,
        shouldCheck,
        speed,
        state.isWrongWay,
        ticketType,
        tripStatus,
    ]);

    const dismiss = useCallback(() => {
        dismissedUntilRef.current = Date.now() + CONFIG.snoozeMs;
        consecutiveBadRef.current = 0;
        consecutiveGoodRef.current = 0;
        setState((prev) => ({ ...prev, isWrongWay: false }));
    }, []);

    return {
        ...state,
        dismiss,
    };
}
