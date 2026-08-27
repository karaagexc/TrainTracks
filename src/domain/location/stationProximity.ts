import type { Coordinates, Line7Mode, OperationalMode, StationProximityResult } from './types';
import type { TransitMode } from '@/types';
import { getNetworkStations } from '@/domain/railway';
import { getDistanceKm } from '@/utils/geo';

export const DEFAULT_STATION_PROXIMITY_RADIUS_KM = 0.35;
export const BUS_STOP_AMBIGUITY_WINDOW_KM = 0.06;
export const BUS_STOP_BOARDING_RADIUS_KM = 0.12;
export const RAIL_STATION_BOARDING_RADIUS_KM = 0.1;

interface StationProximityInput {
    location: Coordinates | null;
    mode?: OperationalMode;
    line7Mode?: Line7Mode;
    radiusKm?: number;
    transitMode?: TransitMode;
    accuracyMeters?: number | null;
    previousStationId?: string | null;
}

export function getStationProximity({
    location,
    mode = 'live',
    line7Mode = 'OFF',
    radiusKm = DEFAULT_STATION_PROXIMITY_RADIUS_KM,
    transitMode = 'train',
    accuracyMeters = null,
    previousStationId = null,
}: StationProximityInput): StationProximityResult {
    if (!location) {
        return {
            nearest: null,
            closest: null,
            conflicts: [],
            nearby: [],
            isWithinRadius: false,
            radiusKm,
            confidence: 'low',
            ambiguityReason: null,
        };
    }

    const stations = getNetworkStations(mode, line7Mode, transitMode);
    const nearby = [];
    let closest: StationProximityResult['closest'] = null;
    let minDist = Infinity;

    for (const station of stations) {
        const distance = getDistanceKm(location, {
            latitude: station.latitude,
            longitude: station.longitude,
        });

        if (distance < minDist) {
            minDist = distance;
            closest = { station, distance };
        }

        if (distance <= radiusKm) {
            nearby.push({ station, distance });
        }
    }

    nearby.sort((left, right) => left.distance - right.distance);

    let nearest = nearby[0] ?? closest;
    let conflicts: StationProximityResult['conflicts'] = [];
    let ambiguityReason: StationProximityResult['ambiguityReason'] = null;

    if (previousStationId && nearest) {
        const previous = nearby.find((entry) => entry.station.id === previousStationId);
        if (previous && previous.distance <= nearest.distance + 0.035) nearest = previous;
    }

    if (nearby.length > 1) {
        if (transitMode === 'bus') {
            const closestDistance = nearby[0].distance;
            const accuracyWindowKm = accuracyMeters === null
                ? BUS_STOP_AMBIGUITY_WINDOW_KM
                : Math.max(0.035, Math.min(0.11, accuracyMeters / 1000 * 0.75));
            const ambiguousStops = nearby
                .filter((entry) => entry.distance - closestDistance <= accuracyWindowKm)
                .filter((entry) => entry.distance <= BUS_STOP_BOARDING_RADIUS_KM + accuracyWindowKm)
                .slice(0, 3);

            // Closely spaced curbside stops can trade places as GPS accuracy drifts.
            // Ask the rider only in the overlap zone; at either stop, choose it directly.
            if (ambiguousStops.length > 1) {
                conflicts = ambiguousStops;
                nearest = ambiguousStops.find((entry) => entry.station.id === previousStationId) ?? ambiguousStops[0];
                ambiguityReason = 'gps_overlap';
            }
        } else {
            const lines = new Set(nearby.map((entry) => entry.station.lineId));
            if (lines.size > 1) {
                const perLine = new Map<string, NonNullable<StationProximityResult['nearest']>>();
                for (const entry of nearby) {
                    const existing = perLine.get(entry.station.lineId);
                    if (!existing || entry.distance < existing.distance) {
                        perLine.set(entry.station.lineId, entry);
                    }
                }
                conflicts = Array.from(perLine.values()).sort((left, right) => left.distance - right.distance);
                nearest = conflicts[0] ?? nearest;
                ambiguityReason = 'multi_line';
            }
        }
    }

    const confidence: StationProximityResult['confidence'] = !nearest
        ? 'low'
        : accuracyMeters !== null && accuracyMeters > 80
            ? 'low'
            : accuracyMeters !== null && accuracyMeters > 35
                ? 'medium'
                : 'high';

    return {
        nearest,
        closest,
        conflicts,
        nearby,
        isWithinRadius: nearby.length > 0,
        radiusKm,
        confidence,
        ambiguityReason,
    };
}
