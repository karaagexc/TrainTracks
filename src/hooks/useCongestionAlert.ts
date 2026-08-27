/**
 * useCongestionAlert — Determines when to show congestion warnings.
 * 
 * Triggers when the user's current or next station has HIGH/EXTREME congestion.
 * Prevents re-triggering for the same station until the user moves on.
 */

import { useState, useEffect, useRef } from 'react';
import { useTripStore } from '@/store/useTripStore';
import { useTrainStore } from '@/store/useTrainStore';
import { getCongestionLevel, shouldDisplayCongestionOverlay, CongestionResult } from '../data/congestion';
import { getOperationalMode } from '@/domain/railway';
import { useMinuteClock } from '@/hooks/useMinuteClock';

export interface CongestionAlertState {
    isVisible: boolean;
    congestion: CongestionResult | null;
    stationName: string;
    onDismiss: () => void;
}

export function useCongestionAlert(): CongestionAlertState {
    const { currentStation, nextStation, status, origin, direction, congestionConfig, isDevMode, line7Mode } = useTripStore();
    const trains = useTrainStore((s) => s.trains);
    const congestionNow = useMinuteClock();
    const [isVisible, setIsVisible] = useState(false);
    const [congestion, setCongestion] = useState<CongestionResult | null>(null);
    const [stationName, setStationName] = useState('');
    const dismissedRef = useRef<Set<string>>(new Set());
    const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        // Only check during active trip
        if (status !== 'TRANSIT' || !origin) {
            setIsVisible(false);
            return;
        }

        // Check next station first (upcoming), then current
        const stationToCheck = nextStation || currentStation;
        if (!stationToCheck) return;

        // Don't re-alert for already dismissed stations
        if (dismissedRef.current.has(stationToCheck.id)) return;

        const result = getCongestionLevel(
            stationToCheck.id,
            congestionNow,
            direction,
            stationToCheck.lineId,
            congestionConfig,
            trains,
            getOperationalMode(isDevMode, line7Mode),
        );

        if (shouldDisplayCongestionOverlay(result) && (result.tier === 'HIGH' || result.tier === 'EXTREME')) {
            setCongestion(result);
            setStationName(stationToCheck.name);
            setIsVisible(true);
            dismissedRef.current.add(stationToCheck.id);

            // Auto-dismiss after 8 seconds
            if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
            autoTimerRef.current = setTimeout(() => setIsVisible(false), 8000);
        } else {
            setIsVisible(false);
        }
    }, [congestionConfig, congestionNow, currentStation, direction, isDevMode, line7Mode, nextStation, origin, status, trains]);

    // Reset dismissed stations when trip ends or new trip starts
    useEffect(() => {
        if (status === 'IDLE') {
            dismissedRef.current.clear();
        }
    }, [status]);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
        };
    }, []);

    const onDismiss = () => {
        setIsVisible(false);
        if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    };

    return { isVisible, congestion, stationName, onDismiss };
}
