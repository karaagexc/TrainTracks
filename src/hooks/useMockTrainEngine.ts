import { useEffect, useRef, useState } from 'react';
import { useTrainStore } from '@/store/useTrainStore';
import { getDistanceKm, moveTowards, getBearing } from '@/utils/geo';
import { TrainPresence } from '@/types/train';
import { getDirectionForStations, getNetworkStations } from '@/domain/railway';
import { useTripStore } from '@/store/useTripStore';
import type { Direction, RailLineId, Station } from '@/types';

// --- Types ---
interface MockTrain {
    id: string; // e.g., "MOCK-LRT1-1042"
    lineId: RailLineId;
    stationIndex: number; // Current generic route index
    targetIndex: number;
    direction: 1 | -1; // 1 = Southbound/Eastbound, -1 = Northbound/Westbound
    lat: number;
    lng: number;
    speed: number;    // km/h
    state: 'DWELLING' | 'LEAVING' | 'TRANSIT' | 'ARRIVING';
    dwellTimer: number; // ms remaining to dwell
}

// Map real system line modes to the canonical railway station network.
const TICK_RATE_MS = 1000;
const DWELL_TIME_MS = 25000; // 25 seconds at a station

function getMockCruiseSpeedKph(lineId: RailLineId): number {
    return lineId === 'LRT2' ? 80 : 60;
}

function getTargetCapacity(line: string, d: Date): number {
    const day = d.getDay(); // 0 = Sun, 1 = Mon...
    const h = d.getHours() + d.getMinutes() / 60;

    const isWeekend = day === 0 || day === 6;
    const isHellbent = day === 1 || day === 5;
    const isWeekday = !isWeekend && !isHellbent;

    if (line === 'LRT1') {
        if (isWeekend) {
            if (h >= 5 && h < 8) return 8;
            if (h >= 8 && h < 19) return 17;
            if (h >= 19 && h < 21.75) return 8;
            return 0;
        } else {
            let peakStart = 6, peakEnd1 = 9, offPeakStart = 9, offPeakEnd = 16, peakStart2 = 16, peakEnd2 = 20;
            if (isWeekday) {
                peakEnd1 = 8.5; offPeakStart = 8.5; offPeakEnd = 17; peakStart2 = 17;
            }
            if (h >= 4.5 && h < peakStart) return 5;
            if (h >= peakStart && h < peakEnd1) return 22;
            if (h >= offPeakStart && h < offPeakEnd) return 16;
            if (h >= peakStart2 && h < peakEnd2) return 22;
            if (h >= peakEnd2 && h < 22.25) return 9;
            return 0;
        }
    }
    else if (line === 'LRT2') {
        if (isWeekend) {
            if (h >= 5 && h < 8) return 3;
            if (h >= 8 && h < 19) return 5;
            if (h >= 19 && h < 21.5) return 3;
            return 0;
        } else {
            let peakStart = 6.5, peakEnd1 = 9, offPeakStart = 9, offPeakEnd = 16.5, peakStart2 = 16.5, peakEnd2 = 20;
            if (isWeekday) {
                peakEnd1 = 8.5; offPeakStart = 8.5; offPeakEnd = 17; peakStart2 = 17;
            }
            if (h >= 5 && h < peakStart) return 3;
            if (h >= peakStart && h < peakEnd1) return 8;
            if (h >= offPeakStart && h < offPeakEnd) return 5;
            if (h >= peakStart2 && h < peakEnd2) return 8;
            if (h >= peakEnd2 && h < 21.5) return 3;
            return 0;
        }
    }
    else if (line === 'MRT3') {
        if (isWeekend) {
            if (h >= 4.5 && h < 8) return 7;
            if (h >= 8 && h < 19) return 13;
            if (h >= 19 && h < 22.15) return 6;
            return 0;
        } else {
            let peakStart = 6, peakEnd1 = 9, offPeakStart = 9, offPeakEnd = 16, peakStart2 = 16, peakEnd2 = 20;
            if (isWeekday) {
                peakEnd1 = 8.5; offPeakStart = 8.5; offPeakEnd = 17; peakStart2 = 17;
            }
            if (h >= 4.5 && h < peakStart) return 5;
            if (h >= peakStart && h < peakEnd1) return 18;
            if (h >= offPeakStart && h < offPeakEnd) return 13;
            if (h >= peakStart2 && h < peakEnd2) return 18;
            if (h >= peakEnd2 && h < 23.06) return 7;
            return 0;
        }
    }
    else if (line === 'MRT7') {
        if (h >= 5 && h < 22) return 10;
        return 0;
    }
    return 0;
}

export function useMockTrainEngine() {
    const { mockTrainsMode, timeFactor, setTrains } = useTrainStore();
    const line7Mode = useTripStore((s) => s.line7Mode);
    const isDevMode = useTripStore((s) => s.isDevMode);
    const transitMode = useTripStore((s) => s.transitMode);

    // The internal physics fleet
    const fleetRef = useRef<MockTrain[]>([]);
    
    // Virtual Engine Time (so we can fast-forward)
    const virtualTimeRef = useRef<Date>(new Date());
    const [currentTimeDisplay, setCurrentTimeDisplay] = useState(new Date());

    useEffect(() => {
        if (!mockTrainsMode || transitMode === 'bus') {
            // Clean up when toggled off
            if (fleetRef.current.length > 0) fleetRef.current = [];
            setTrains([]);
            return;
        }

        // Initialize Virtual Time from Real Time when toggled on
        virtualTimeRef.current = new Date();

        const interval = setInterval(() => {
            const dtSeconds = (TICK_RATE_MS / 1000) * timeFactor;
            
            // 1. Advance Virtual Time
            const newMs = virtualTimeRef.current.getTime() + (TICK_RATE_MS * timeFactor);
            virtualTimeRef.current = new Date(newMs);
            setCurrentTimeDisplay(virtualTimeRef.current);

            let newFleet = [...fleetRef.current];
            const vt = virtualTimeRef.current;

            // 2. Schedule Injection & Culling
            const networkStations = getNetworkStations(isDevMode ? 'sandbox' : 'live', line7Mode, 'train');
            const lineStationsById = new Map<RailLineId, Station[]>();
            (['LRT1', 'LRT2', 'MRT3', 'MRT7'] as RailLineId[]).forEach((lineId) => {
                lineStationsById.set(
                    lineId,
                    networkStations.filter((station) => station.lineId === lineId).sort((a, b) => a.order - b.order),
                );
            });

            const lines = (['LRT1', 'LRT2', 'MRT3', ...(isDevMode && line7Mode !== 'OFF' ? ['MRT7' as const] : [])] as RailLineId[]);
            lines.forEach(lineId => {
                const stations = lineStationsById.get(lineId);
                if (!stations || stations.length < 2) return;

                const targetCount = getTargetCapacity(lineId, vt);
                const currentLineTrains = newFleet.filter(t => t.lineId === lineId);
                
                // Spawn if lacking
                if (currentLineTrains.length < targetCount) {
                    // Try to balance directions
                    const d1Count = currentLineTrains.filter(t => t.direction === 1).length;
                    const dMin1Count = currentLineTrains.filter(t => t.direction === -1).length;
                    const direction = d1Count > dMin1Count ? -1 : 1;
                    
                    const startIndex = direction === 1 ? 0 : stations.length - 1;
                    const station = stations[startIndex];

                    const newTrain: MockTrain = {
                        id: `MOCK-${lineId}-${Math.floor(Math.random() * 9000) + 1000}`,
                        lineId,
                        stationIndex: startIndex,
                        targetIndex: startIndex + direction,
                        direction,
                        lat: station.latitude,
                        lng: station.longitude,
                        speed: 0,
                        state: 'DWELLING',
                        dwellTimer: DWELL_TIME_MS
                    };
                    newFleet.push(newTrain);
                }
            });

            // 3. Physics Loop
            newFleet = newFleet.map(train => {
                const stations = lineStationsById.get(train.lineId) ?? [];
                const currentStation = stations[train.stationIndex];
                const trgIndex = train.targetIndex;
                const targetStation = stations[trgIndex];

                if (!targetStation) {
                    // Train reached end of line. Despawn if line > target, else turn around!
                    const targetCount = getTargetCapacity(train.lineId, vt);
                    const currentLineTrains = newFleet.filter(t => t.lineId === train.lineId).length;
                    
                    if (currentLineTrains > targetCount) {
                        return { ...train, state: 'DESPAWN' } as any; // Flag for removal
                    } else {
                        // Turn around
                        const newDir = train.direction === 1 ? -1 : 1;
                        return {
                            ...train,
                            direction: newDir,
                            targetIndex: train.stationIndex + newDir,
                            dwellTimer: DWELL_TIME_MS,
                            state: 'DWELLING',
                            speed: 0
                        };
                    }
                }

                // DWELLING
                if (train.state === 'DWELLING') {
                    train.dwellTimer -= TICK_RATE_MS * timeFactor;
                    train.speed = 0;
                    if (train.dwellTimer <= 0) {
                        train.state = 'LEAVING';
                    }
                    return train;
                }

                // MOVING
                const currentLoc = { latitude: train.lat, longitude: train.lng };
                const targetLoc = { latitude: targetStation.latitude, longitude: targetStation.longitude };
                
                const distDistMeters = getDistanceKm(currentLoc, targetLoc) * 1000;
                
                // Check if approaching/leaving
                if (distDistMeters < 300) {
                    train.state = 'ARRIVING';
                } else if (distDistMeters > 300 && train.state === 'LEAVING') {
                    // If we moved far enough away from our start
                    train.state = 'TRANSIT';
                }

                // Physics (Accelerate/Decelerate)
                const maxSpeedMS = getMockCruiseSpeedKph(train.lineId) / 3.6;
                const accel = 0.8 * dtSeconds; // m/s^2
                const decel = 1.0 * dtSeconds; // m/s^2

                let v = train.speed / 3.6; // Current speed m/s
                const brakingDist = (v * v) / (2 * 1.0); // d = v^2 / 2a
                
                if (distDistMeters <= brakingDist * 1.05) {
                    v = Math.max(0.5, v - decel);
                } else {
                    v = Math.min(maxSpeedMS, v + accel);
                }

                // Snap to station
                if (distDistMeters < 10) {
                    train.lat = targetStation.latitude;
                    train.lng = targetStation.longitude;
                    train.speed = 0;
                    train.state = 'DWELLING';
                    train.dwellTimer = DWELL_TIME_MS;
                    train.stationIndex = trgIndex;
                    train.targetIndex = trgIndex + train.direction;
                    return train;
                }

                // Move
                train.speed = v * 3.6; // save as km/h
                const moveDistKm = (v * dtSeconds) / 1000;
                const newLoc = moveTowards(currentLoc, targetLoc, moveDistKm);
                
                train.lat = newLoc.latitude;
                train.lng = newLoc.longitude;

                return train;
            }).filter(t => t.state !== 'DESPAWN');

            fleetRef.current = newFleet;

            // 4. Transform into generic TrainPresence payloads and sync store
            const payloads: TrainPresence[] = newFleet.map(t => {
                const stations = lineStationsById.get(t.lineId) ?? [];
                const current = stations[t.stationIndex] ?? null;
                const target = stations[t.targetIndex] ?? current;
                const direction = (current && target ? getDirectionForStations(current, target) : null)
                    ?? (t.lineId === 'LRT2'
                        ? (t.direction === 1 ? 'EASTBOUND' : 'WESTBOUND')
                        : (t.direction === 1 ? 'SOUTHBOUND' : 'NORTHBOUND')) as Direction;
                
                // Format Dynamic Status
                // Resolve target station name
                if (t.state === 'DWELLING') {
                    const st = stations[t.stationIndex];
                    return {
                        id: t.id,
                        lat: t.lat,
                        lng: t.lng,
                        lineId: t.lineId,
                        direction,
                        speedKph: 0,
                        statusCode: 'AT_STATION',
                        stationId: st?.id ?? null,
                        stationName: st?.name ?? null,
                        source: 'simulated',
                        updatedAt: Date.now(),
                        confidence: 1,
                    };
                } else {
                    const st = stations[t.targetIndex];
                    const originStation = stations[t.stationIndex];

                    return {
                        id: t.id,
                        lat: t.lat,
                        lng: t.lng,
                        lineId: t.lineId,
                        direction,
                        speedKph: t.speed,
                        statusCode: t.state === 'ARRIVING'
                            ? 'APPROACHING_STATION'
                            : t.state === 'LEAVING'
                                ? 'LEAVING_STATION'
                                : 'IN_TRANSIT',
                        stationId: t.state === 'LEAVING' ? originStation?.id ?? null : st?.id ?? null,
                        stationName: t.state === 'LEAVING' ? originStation?.name ?? null : st?.name ?? null,
                        source: 'simulated',
                        updatedAt: Date.now(),
                        confidence: 1,
                    };
                }
            });

            // Injection
            setTrains(payloads);

        }, TICK_RATE_MS);

        return () => clearInterval(interval);
    }, [mockTrainsMode, timeFactor, setTrains, line7Mode, isDevMode, transitMode]);

    return {
        virtualTime: currentTimeDisplay
    };
}
