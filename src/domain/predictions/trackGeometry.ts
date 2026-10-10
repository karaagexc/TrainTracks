import lrt1Data from '@/data/lrt1.json';
import lrt2Data from '@/data/lrt2.json';
import mrt3Data from '@/data/mrt3.json';
import mrt7Data from '@/data/mrt7.json';
import { getSegmentDistance } from '@/data/segmentDistances';
import { STATIONS } from '@/data/stations';
import type { Coordinates, LineId, Station } from '@/types';
import { getDistanceKm } from '@/utils/geo';
import { getPolylineLengthMeters, projectLocationToPolyline } from '@/domain/location/polyline';

type TrackPoint = Coordinates & { key: string };
type TrackEdge = { to: string; distanceKm: number };
type TrackGraph = {
    nodes: Map<string, TrackPoint>;
    edges: Map<string, TrackEdge[]>;
    mainNodeKeys: Set<string>;
};

const LINE_GEOJSON: Partial<Record<LineId, any>> = {
    LRT1: lrt1Data,
    LRT2: lrt2Data,
    MRT3: mrt3Data,
    MRT7: mrt7Data,
};

const graphCache = new Map<LineId, TrackGraph>();
const pathCache = new Map<string, TrackPoint[] | null>();
const linePathCache = new Map<LineId, TrackPoint[] | null>();
const stationAnchorCache = new Map<string, TrackPoint | null>();
const publicPathCache = new Map<string, Coordinates[] | null>();
const pathMetricsCache = new WeakMap<TrackPoint[], { segmentDistances: number[]; totalDistance: number }>();
const MAX_SNAP_DISTANCE_KM = 0.85;

function pointKey(point: Coordinates): string {
    return `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
}

function toPoint(coord: number[]): TrackPoint {
    const point = {
        latitude: coord[1],
        longitude: coord[0],
    };
    return {
        ...point,
        key: pointKey(point),
    };
}

function addNode(graph: TrackGraph, point: TrackPoint) {
    if (!graph.nodes.has(point.key)) {
        graph.nodes.set(point.key, point);
    }
    if (!graph.edges.has(point.key)) {
        graph.edges.set(point.key, []);
    }
}

function addEdge(graph: TrackGraph, from: TrackPoint, to: TrackPoint) {
    if (from.key === to.key) return;
    const distanceKm = getDistanceKm(from, to);
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) return;

    graph.edges.get(from.key)?.push({ to: to.key, distanceKm });
    graph.edges.get(to.key)?.push({ to: from.key, distanceKm });
}

function extractLineStrings(data: any): number[][][] {
    const lineStrings: number[][][] = [];
    data?.features?.forEach((feature: any) => {
        const geometry = feature?.geometry;
        if (geometry?.type === 'LineString') {
            lineStrings.push(geometry.coordinates);
        }
        if (geometry?.type === 'MultiLineString') {
            geometry.coordinates.forEach((line: number[][]) => lineStrings.push(line));
        }
    });
    return lineStrings;
}

function buildTrackGraph(lineId: LineId): TrackGraph | null {
    const cached = graphCache.get(lineId);
    if (cached) return cached;

    const data = LINE_GEOJSON[lineId];
    if (!data) return null;

    const graph: TrackGraph = {
        nodes: new Map(),
        edges: new Map(),
        mainNodeKeys: new Set(),
    };

    extractLineStrings(data).forEach((line) => {
        const points = line.map(toPoint);
        points.forEach((point) => addNode(graph, point));
        for (let index = 1; index < points.length; index += 1) {
            addEdge(graph, points[index - 1], points[index]);
        }
    });

    graph.mainNodeKeys = getLargestComponent(graph);
    graphCache.set(lineId, graph);
    return graph;
}

function getLargestComponent(graph: TrackGraph): Set<string> {
    const visited = new Set<string>();
    let largest = new Set<string>();

    graph.nodes.forEach((_, startKey) => {
        if (visited.has(startKey)) return;

        const component = new Set<string>();
        const stack = [startKey];
        visited.add(startKey);

        while (stack.length > 0) {
            const current = stack.pop()!;
            component.add(current);
            (graph.edges.get(current) ?? []).forEach((edge) => {
                if (visited.has(edge.to)) return;
                visited.add(edge.to);
                stack.push(edge.to);
            });
        }

        if (component.size > largest.size) {
            largest = component;
        }
    });

    return largest;
}

function getStationAnchor(graph: TrackGraph, lineId: LineId, station: Station): TrackPoint | null {
    const cacheKey = `${lineId}:${station.id}`;
    if (stationAnchorCache.has(cacheKey)) return stationAnchorCache.get(cacheKey) ?? null;

    let closest: { from: TrackPoint; to: TrackPoint; location: Coordinates; distance: number } | null = null;
    for (const [fromKey, edges] of graph.edges) {
        if (graph.mainNodeKeys.size && !graph.mainNodeKeys.has(fromKey)) continue;
        const from = graph.nodes.get(fromKey)!;
        for (const edge of edges) {
            if (fromKey > edge.to) continue;
            const to = graph.nodes.get(edge.to)!;
            const projection = projectLocationToPolyline(station, [from, to]);
            if (projection && (!closest || projection.distanceFromPathMeters < closest.distance)) {
                closest = { from, to, location: projection.location, distance: projection.distanceFromPathMeters };
            }
        }
    }
    if (!closest || closest.distance > MAX_SNAP_DISTANCE_KM * 1000) {
        stationAnchorCache.set(cacheKey, null);
        return null;
    }

    // Split the actual rail segment at the platform projection, not a nearby vertex.
    const anchor = { ...closest.location, key: pointKey(closest.location) };
    const existing = graph.nodes.get(anchor.key);
    if (existing) {
        stationAnchorCache.set(cacheKey, existing);
        return existing;
    }
    addNode(graph, anchor);
    graph.mainNodeKeys.add(anchor.key);
    graph.edges.set(closest.from.key, graph.edges.get(closest.from.key)!.filter((edge) => edge.to !== closest.to.key));
    graph.edges.set(closest.to.key, graph.edges.get(closest.to.key)!.filter((edge) => edge.to !== closest.from.key));
    addEdge(graph, closest.from, anchor);
    addEdge(graph, anchor, closest.to);
    stationAnchorCache.set(cacheKey, anchor);
    return anchor;
}

function shortestPath(graph: TrackGraph, startKey: string, endKey: string): { path: TrackPoint[]; distanceKm: number } | null {
    if (startKey === endKey) {
        const point = graph.nodes.get(startKey);
        return point ? { path: [point], distanceKm: 0 } : null;
    }

    const distances = new Map<string, number>();
    const previous = new Map<string, string | null>();
    const unvisited = new Set<string>();

    graph.nodes.forEach((_, key) => {
        distances.set(key, key === startKey ? 0 : Number.POSITIVE_INFINITY);
        previous.set(key, null);
        unvisited.add(key);
    });

    while (unvisited.size > 0) {
        let current: string | null = null;
        let currentDistance = Number.POSITIVE_INFINITY;

        unvisited.forEach((key) => {
            const distance = distances.get(key) ?? Number.POSITIVE_INFINITY;
            if (distance < currentDistance) {
                current = key;
                currentDistance = distance;
            }
        });

        if (!current || currentDistance === Number.POSITIVE_INFINITY) break;
        if (current === endKey) break;
        unvisited.delete(current);

        (graph.edges.get(current) ?? []).forEach((edge) => {
            if (!unvisited.has(edge.to)) return;
            const nextDistance = currentDistance + edge.distanceKm;
            if (nextDistance < (distances.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
                distances.set(edge.to, nextDistance);
                previous.set(edge.to, current);
            }
        });
    }

    const path: TrackPoint[] = [];
    let cursor: string | null = endKey;
    while (cursor) {
        const point = graph.nodes.get(cursor);
        if (!point) return null;
        path.unshift(point);
        cursor = previous.get(cursor) ?? null;
    }

    return path[0]?.key === startKey
        ? { path, distanceKm: distances.get(endKey) ?? Number.POSITIVE_INFINITY }
        : null;
}

function getExpectedSegmentDistanceKm(from: Station, to: Station): number {
    const knownMeters = getSegmentDistance(from.id, to.id);
    return knownMeters ? knownMeters / 1000 : getDistanceKm(from, to);
}

function getMaxReasonablePathKm(from: Station, to: Station): number {
    const expectedKm = getExpectedSegmentDistanceKm(from, to);
    return Math.max(expectedKm * 1.8, expectedKm + 0.9);
}

function getLinePath(lineId: LineId): TrackPoint[] | null {
    if (linePathCache.has(lineId)) return linePathCache.get(lineId) ?? null;
    const graph = buildTrackGraph(lineId);
    const stations = STATIONS.filter((station) => station.lineId === lineId).sort((a, b) => a.order - b.order);
    if (!graph || stations.length < 2) return null;
    const start = getStationAnchor(graph, lineId, stations[0]);
    const end = getStationAnchor(graph, lineId, stations.at(-1)!);
    const result = start && end ? shortestPath(graph, start.key, end.key) : null;
    let path: TrackPoint[] | null = result?.path ?? null;
    const expectedKm = stations.slice(1).reduce((sum, station, index) => (
        sum + getExpectedSegmentDistanceKm(stations[index], station)
    ), 0);
    if (!path || path.length < 2 || result!.distanceKm > expectedKm * 1.8) path = null;
    if (path) {
        let previousDistance = -1;
        for (const station of stations) {
            const projection = projectLocationToPolyline(station, path);
            if (!projection || projection.distanceFromPathMeters > MAX_SNAP_DISTANCE_KM * 1000
                || projection.distanceAlongMeters <= previousDistance) {
                path = null;
                break;
            }
            previousDistance = projection.distanceAlongMeters;
        }
    }
    linePathCache.set(lineId, path);
    return path;
}

function chooseCandidatePath(lineId: LineId, from: Station, to: Station): TrackPoint[] | null {
    const spine = getLinePath(lineId);
    if (!spine) return null;
    const fromProjection = projectLocationToPolyline(from, spine);
    const toProjection = projectLocationToPolyline(to, spine);
    if (!fromProjection || !toProjection || Math.max(fromProjection.distanceFromPathMeters,
        toProjection.distanceFromPathMeters) > MAX_SNAP_DISTANCE_KM * 1000) return null;
    const reverse = fromProjection.distanceAlongMeters > toProjection.distanceAlongMeters;
    const start = reverse ? toProjection : fromProjection;
    const end = reverse ? fromProjection : toProjection;
    // A single validated rail spine prevents nearby parallel tracks from routing through a terminal loop.
    const points = [start.location, ...spine.slice(start.segmentIndex + 1, end.segmentIndex + 1), end.location];
    const path = points.map((point) => ({ ...point, key: pointKey(point) }));
    if (getPolylineLengthMeters(path) > getMaxReasonablePathKm(from, to) * 1000) return null;
    return reverse ? path.reverse() : path;
}

function getPath(lineId: LineId, from: Station, to: Station): TrackPoint[] | null {
    const cacheKey = `${lineId}:${from.id}:${to.id}`;
    if (pathCache.has(cacheKey)) {
        return pathCache.get(cacheKey) ?? null;
    }

    const path = chooseCandidatePath(lineId, from, to);
    pathCache.set(cacheKey, path);
    return path;
}

function interpolatePoint(from: Coordinates, to: Coordinates, progress: number): Coordinates {
    return {
        latitude: from.latitude + (to.latitude - from.latitude) * progress,
        longitude: from.longitude + (to.longitude - from.longitude) * progress,
    };
}

export function getTrackGeometryPosition(lineId: LineId, from: Station, to: Station, progress: number): Coordinates | null {
    const path = getPath(lineId, from, to);
    if (!path || path.length < 2) return null;

    const clamped = Math.max(0, Math.min(1, progress));
    let metrics = pathMetricsCache.get(path);
    if (!metrics) {
        const segmentDistances = path.slice(1).map((point, index) => getDistanceKm(path[index], point));
        metrics = { segmentDistances, totalDistance: segmentDistances.reduce((sum, distance) => sum + distance, 0) };
        pathMetricsCache.set(path, metrics);
    }
    const { segmentDistances, totalDistance } = metrics;
    if (totalDistance <= 0) return null;

    let targetDistance = totalDistance * clamped;
    for (let index = 1; index < path.length; index += 1) {
        const distance = segmentDistances[index - 1];
        if (targetDistance <= distance) {
            return interpolatePoint(path[index - 1], path[index], distance <= 0 ? 0 : targetDistance / distance);
        }
        targetDistance -= distance;
    }

    const last = path[path.length - 1];
    return {
        latitude: last.latitude,
        longitude: last.longitude,
    };
}

export function getTrackGeometryPath(
    lineId: LineId,
    from: Station,
    to: Station,
): Coordinates[] | null {
    const cacheKey = `${lineId}:${from.id}:${to.id}`;
    if (publicPathCache.has(cacheKey)) return publicPathCache.get(cacheKey) ?? null;
    const path = getPath(lineId, from, to);
    if (!path || path.length < 2) return null;
    const coordinates = path.map(({ latitude, longitude }) => ({ latitude, longitude }));
    publicPathCache.set(cacheKey, coordinates);
    return coordinates;
}

export function getDistanceFromLineTrackMeters(
    lineId: LineId,
    location: Coordinates,
): number | null {
    const path = getLinePath(lineId);
    return path ? projectLocationToPolyline(location, path)?.distanceFromPathMeters ?? null : null;
}
