import edsaGeoLine from '@/data/edsa_carousel.json';
import type { Coordinates, Direction, Station } from '@/types';
import { getDistanceKm } from '@/utils/geo';

export type EdsaDirection = Extract<Direction, 'NORTHBOUND' | 'SOUTHBOUND'>;

const EMPTY_PATH: Coordinates[] = [];

function toCoordinates(coordinate: number[]): Coordinates {
    return { longitude: coordinate[0], latitude: coordinate[1] };
}

export function getEdsaDirection(from: Station, to: Station): EdsaDirection | null {
    if (from.lineId !== 'EDSA' || to.lineId !== 'EDSA' || from.id === to.id) return null;
    return from.order < to.order ? 'SOUTHBOUND' : 'NORTHBOUND';
}

export function isEdsaStopAllowedForDirection(station: Station, direction: EdsaDirection): boolean {
    if (station.lineId !== 'EDSA') return false;
    if (direction === 'SOUTHBOUND') return station.directionAvailability !== 'northbound_only';
    return station.directionAvailability !== 'southbound_only';
}

export function getEdsaPathForDirection(direction: EdsaDirection): Coordinates[] {
    const feature = edsaGeoLine.features.find((candidate) => candidate.properties?.direction === direction);
    if (!feature || feature.geometry?.type !== 'LineString') return EMPTY_PATH;
    return feature.geometry.coordinates.map(toCoordinates);
}

export function getPolylineDistanceKm(path: Coordinates[]): number {
    let distanceKm = 0;
    for (let index = 0; index < path.length - 1; index += 1) {
        distanceKm += getDistanceKm(path[index], path[index + 1]);
    }
    return distanceKm;
}

function getCumulativeDistances(path: Coordinates[]): number[] {
    const distances = [0];
    for (let index = 1; index < path.length; index += 1) {
        distances.push(distances[index - 1] + getDistanceKm(path[index - 1], path[index]));
    }
    return distances;
}

function toLocalPoint(location: Coordinates, originLat: number): { x: number; y: number } {
    const metersPerDegreeLat = 111_320;
    const metersPerDegreeLng = 111_320 * Math.cos((originLat * Math.PI) / 180);
    return {
        x: location.longitude * metersPerDegreeLng,
        y: location.latitude * metersPerDegreeLat,
    };
}

export function getProjectedDistanceAlongPath(location: Coordinates, path: Coordinates[]): number {
    if (path.length < 2) return 0;

    const cumulative = getCumulativeDistances(path);
    const originLat = location.latitude;
    const point = toLocalPoint(location, originLat);
    let bestDistanceSq = Number.POSITIVE_INFINITY;
    let bestAlongKm = 0;

    for (let index = 0; index < path.length - 1; index += 1) {
        const a = toLocalPoint(path[index], originLat);
        const b = toLocalPoint(path[index + 1], originLat);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const segmentLengthSq = dx * dx + dy * dy;
        const t = segmentLengthSq > 0
            ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / segmentLengthSq))
            : 0;
        const projectedX = a.x + dx * t;
        const projectedY = a.y + dy * t;
        const distanceSq = (point.x - projectedX) ** 2 + (point.y - projectedY) ** 2;

        if (distanceSq < bestDistanceSq) {
            bestDistanceSq = distanceSq;
            bestAlongKm = cumulative[index] + getDistanceKm(path[index], path[index + 1]) * t;
        }
    }

    return bestAlongKm;
}

export function interpolateAlongPath(path: Coordinates[], distanceKm: number): Coordinates {
    if (path.length === 0) return { latitude: 0, longitude: 0 };
    if (path.length === 1 || distanceKm <= 0) return path[0];

    let travelledKm = 0;
    for (let index = 0; index < path.length - 1; index += 1) {
        const segmentKm = getDistanceKm(path[index], path[index + 1]);
        if (travelledKm + segmentKm >= distanceKm) {
            const ratio = segmentKm > 0 ? (distanceKm - travelledKm) / segmentKm : 0;
            return {
                latitude: path[index].latitude + (path[index + 1].latitude - path[index].latitude) * ratio,
                longitude: path[index].longitude + (path[index + 1].longitude - path[index].longitude) * ratio,
            };
        }
        travelledKm += segmentKm;
    }

    return path[path.length - 1];
}

export function slicePathByDistance(path: Coordinates[], startKm: number, endKm: number): Coordinates[] {
    if (path.length < 2 || endKm <= startKm) return path.slice(0, 1);

    const cumulative = getCumulativeDistances(path);
    const segment: Coordinates[] = [interpolateAlongPath(path, startKm)];

    for (let index = 1; index < path.length - 1; index += 1) {
        if (cumulative[index] > startKm && cumulative[index] < endKm) {
            segment.push(path[index]);
        }
    }

    segment.push(interpolateAlongPath(path, endKm));
    return segment;
}

export function getEdsaLegPath(from: Station, to: Station): Coordinates[] {
    const direction = getEdsaDirection(from, to);
    if (!direction) return [];

    const path = getEdsaPathForDirection(direction);
    if (path.length < 2) return [];

    const fromDistanceKm = getProjectedDistanceAlongPath(
        { latitude: from.latitude, longitude: from.longitude },
        path,
    );
    const toDistanceKm = getProjectedDistanceAlongPath(
        { latitude: to.latitude, longitude: to.longitude },
        path,
    );
    const startKm = Math.min(fromDistanceKm, toDistanceKm);
    const endKm = Math.max(fromDistanceKm, toDistanceKm);
    return slicePathByDistance(path, startKm, endKm);
}
