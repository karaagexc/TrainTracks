import type { Coordinates } from '@/types';
import { getDistanceKm } from '@/utils/geo';

const pathMetrics = new WeakMap<Coordinates[], { lengths: number[]; cumulative: number[]; total: number }>();

function getPathMetrics(path: Coordinates[]) {
    const cached = pathMetrics.get(path);
    if (cached) return cached;
    const lengths: number[] = [];
    const cumulative = [0];
    for (let index = 1; index < path.length; index += 1) {
        lengths.push(getDistanceKm(path[index - 1], path[index]) * 1000);
        cumulative.push(cumulative[index - 1] + lengths[index - 1]);
    }
    const metrics = { lengths, cumulative, total: cumulative.at(-1) ?? 0 };
    pathMetrics.set(path, metrics);
    return metrics;
}

export interface PolylineProjection {
    location: Coordinates;
    distanceAlongMeters: number;
    distanceFromPathMeters: number;
    segmentIndex: number;
    segmentProgress: number;
    pathLengthMeters: number;
}

function localPoint(location: Coordinates, latitude: number) {
    const metersPerDegreeLatitude = 111_320;
    const metersPerDegreeLongitude = metersPerDegreeLatitude * Math.cos(latitude * Math.PI / 180);
    return {
        x: location.longitude * metersPerDegreeLongitude,
        y: location.latitude * metersPerDegreeLatitude,
    };
}

export function getPolylineLengthMeters(path: Coordinates[]): number {
    return getPathMetrics(path).total;
}

export function projectLocationToPolyline(
    location: Coordinates,
    path: Coordinates[],
): PolylineProjection | null {
    if (path.length < 2) return null;

    const originLatitude = location.latitude;
    const target = localPoint(location, originLatitude);
    let distanceBeforeMeters = 0;
    let best: PolylineProjection | null = null;
    const metrics = getPathMetrics(path);
    const pathLengthMeters = metrics.total;

    for (let index = 0; index < path.length - 1; index += 1) {
        const start = localPoint(path[index], originLatitude);
        const end = localPoint(path[index + 1], originLatitude);
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const segmentLengthSq = dx * dx + dy * dy;
        const progress = segmentLengthSq > 0
            ? Math.max(0, Math.min(1, (
                (target.x - start.x) * dx + (target.y - start.y) * dy
            ) / segmentLengthSq))
            : 0;
        const projectedX = start.x + dx * progress;
        const projectedY = start.y + dy * progress;
        const distanceMeters = Math.hypot(target.x - projectedX, target.y - projectedY);
        const segmentLengthMeters = metrics.lengths[index];

        if (!best || distanceMeters < best.distanceFromPathMeters) {
            best = {
                location: {
                    latitude: path[index].latitude
                        + (path[index + 1].latitude - path[index].latitude) * progress,
                    longitude: path[index].longitude
                        + (path[index + 1].longitude - path[index].longitude) * progress,
                },
                distanceAlongMeters: distanceBeforeMeters + segmentLengthMeters * progress,
                distanceFromPathMeters: distanceMeters,
                segmentIndex: index,
                segmentProgress: progress,
                pathLengthMeters,
            };
        }

        distanceBeforeMeters += segmentLengthMeters;
    }

    return best;
}

export function interpolatePolyline(path: Coordinates[], distanceMeters: number): Coordinates | null {
    if (path.length === 0) return null;
    if (path.length === 1 || distanceMeters <= 0) return path[0];

    const metrics = getPathMetrics(path);
    let remaining = distanceMeters;
    for (let index = 1; index < path.length; index += 1) {
        const segmentMeters = metrics.lengths[index - 1];
        if (remaining <= segmentMeters) {
            const progress = segmentMeters > 0 ? remaining / segmentMeters : 0;
            return {
                latitude: path[index - 1].latitude
                    + (path[index].latitude - path[index - 1].latitude) * progress,
                longitude: path[index - 1].longitude
                    + (path[index].longitude - path[index - 1].longitude) * progress,
            };
        }
        remaining -= segmentMeters;
    }

    return path[path.length - 1];
}
