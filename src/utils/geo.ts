// Native Haversine implementation to avoid @turf/turf runtime issues
import { Coordinates } from '@/types';
import { getSegmentDistanceKm } from '@/data/segmentDistances';

export const getDistanceKm = (from: Coordinates, to: Coordinates): number => {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(to.latitude - from.latitude);
    const dLon = deg2rad(to.longitude - from.longitude);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(from.latitude)) * Math.cos(deg2rad(to.latitude)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
        ;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
};

function deg2rad(deg: number) {
    return deg * (Math.PI / 180);
}

export const getProgress = (
    start: Coordinates,
    end: Coordinates,
    current: Coordinates
): number => {
    const covered = getDistanceKm(start, current);
    const remaining = getDistanceKm(current, end);
    const segment = getDistanceKm(start, end);

    // SNAP TO 100% if within 30m to prevent "99%" lag at station
    if (remaining < 0.03) return 100;
    if (covered + remaining === 0 || segment === 0) return 0; // Prevent divide by zero

    // Use Law of Cosines to get orthogonal point projection along the track
    const cSq = segment * segment;
    const bSq = covered * covered;
    const aSq = remaining * remaining;
    const projectedRatio = (bSq + cSq - aSq) / (2 * cSq);

    return Math.max(0, Math.min(100, projectedRatio * 100));
};

/**
 * Station-aware progress calculation using real-world segment distances.
 * Uses actual track distances instead of Haversine (which underestimates on curved tracks).
 * Falls back to Haversine-based getProgress when station IDs aren't in the segment database.
 */
export const getStationProgress = (
    start: Coordinates & { id?: string },
    end: Coordinates & { id?: string },
    current: Coordinates
): number => {
    // Try real-world distance first
    if (start.id && end.id) {
        const realDistKm = getSegmentDistanceKm(start.id, end.id);
        if (realDistKm !== null) {
            const coveredHaversine = getDistanceKm(start, current);
            const remainingHaversine = getDistanceKm(current, end);

            // SNAP TO 100% if within 30m
            if (remainingHaversine < 0.03) return 100;
            if (coveredHaversine + remainingHaversine === 0) return 0;

            // Use Law of Cosines to project the current GPS point orthogonally onto the segment.
            // This prevents perpendicular GPS bounces from skewing the ratio to 50%.
            // a = remaining, b = covered, c = realDistKm
            // Project distance x = (b^2 + c^2 - a^2) / (2 * c)
            // Progress ratio = x / c = (b^2 + c^2 - a^2) / (2 * c^2)
            const cSq = realDistKm * realDistKm;
            const bSq = coveredHaversine * coveredHaversine;
            const aSq = remainingHaversine * remainingHaversine;
            const ratio = (bSq + cSq - aSq) / (2 * cSq);

            return Math.max(0, Math.min(100, ratio * 100));
        }
    }

    // Fallback to Haversine
    return getProgress(start, end, current);
};

export const moveTowards = (current: Coordinates, target: Coordinates, distanceKm: number): Coordinates => {
    const totalDist = getDistanceKm(current, target);
    if (totalDist <= distanceKm) return target;

    const ratio = distanceKm / totalDist;
    const lat = current.latitude + (target.latitude - current.latitude) * ratio;
    const lng = current.longitude + (target.longitude - current.longitude) * ratio;

    return { latitude: lat, longitude: lng };
};

export const getBearing = (start: Coordinates, end: Coordinates): number => {
    const startLat = deg2rad(start.latitude);
    const startLng = deg2rad(start.longitude);
    const endLat = deg2rad(end.latitude);
    const endLng = deg2rad(end.longitude);

    const y = Math.sin(endLng - startLng) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) -
        Math.sin(startLat) * Math.cos(endLat) * Math.cos(endLng - startLng);
    const brng = rad2deg(Math.atan2(y, x));
    return (brng + 360) % 360;
};

function rad2deg(rad: number) {
    return rad * 180 / Math.PI;
}
