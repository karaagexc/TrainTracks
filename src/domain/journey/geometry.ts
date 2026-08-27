import { getEdsaLegPath } from '@/data/edsaGeometry';
import { getTrackGeometryPath } from '@/domain/predictions/trackGeometry';
import {
    getPolylineLengthMeters,
    projectLocationToPolyline,
    type PolylineProjection,
} from '@/domain/location/polyline';
import type { Coordinates, Station } from '@/types';
import type { JourneyRailEdge, JourneyRoute } from './types';
import { getJourneyStationById } from './graph';

export interface JourneyEdgeProjection extends PolylineProjection {
    edgeIndex: number;
    progress: number;
    remainingMeters: number;
    path: Coordinates[];
}

function orientPath(path: Coordinates[], from: Station): Coordinates[] {
    if (path.length < 2) return path;

    const firstDelta = Math.hypot(
        path[0].latitude - from.latitude,
        path[0].longitude - from.longitude,
    );
    const last = path[path.length - 1];
    const lastDelta = Math.hypot(
        last.latitude - from.latitude,
        last.longitude - from.longitude,
    );
    return firstDelta <= lastDelta ? path : [...path].reverse();
}

export function getJourneyRailEdgePath(
    edge: JourneyRailEdge,
    from: Station,
    to: Station,
): Coordinates[] {
    const geometry = edge.lineId === 'EDSA'
        ? getEdsaLegPath(from, to)
        : getTrackGeometryPath(edge.lineId, from, to);
    const fallback = [
        { latitude: from.latitude, longitude: from.longitude },
        { latitude: to.latitude, longitude: to.longitude },
    ];
    return orientPath(geometry && geometry.length >= 2 ? geometry : fallback, from);
}

export function projectLocationToJourneyEdge(
    route: JourneyRoute,
    edgeIndex: number,
    location: Coordinates,
): JourneyEdgeProjection | null {
    const edge = route.edges[edgeIndex];
    if (!edge || edge.type !== 'rail') return null;
    const from = getJourneyStationById(edge.fromStationId);
    const to = getJourneyStationById(edge.toStationId);
    if (!from || !to) return null;

    const path = getJourneyRailEdgePath(edge, from, to);
    const projection = projectLocationToPolyline(location, path);
    if (!projection) return null;
    const pathLengthMeters = Math.max(1, projection.pathLengthMeters || getPolylineLengthMeters(path));
    const distanceAlongMeters = Math.max(0, Math.min(pathLengthMeters, projection.distanceAlongMeters));

    return {
        ...projection,
        edgeIndex,
        path,
        pathLengthMeters,
        distanceAlongMeters,
        progress: distanceAlongMeters / pathLengthMeters,
        remainingMeters: Math.max(0, pathLengthMeters - distanceAlongMeters),
    };
}

export interface JourneyRouteMatch {
    best: JourneyEdgeProjection | null;
    ambiguous: boolean;
}

export function findBestJourneyRouteMatch(
    route: JourneyRoute,
    location: Coordinates,
    fromEdgeIndex = 0,
    toEdgeIndex = route.edges.length - 1,
): JourneyRouteMatch {
    const candidates: JourneyEdgeProjection[] = [];
    for (let edgeIndex = Math.max(0, fromEdgeIndex); edgeIndex <= Math.min(toEdgeIndex, route.edges.length - 1); edgeIndex += 1) {
        const projection = projectLocationToJourneyEdge(route, edgeIndex, location);
        if (projection) candidates.push(projection);
    }

    candidates.sort((left, right) => {
        const leftEndpointPenalty = left.progress <= 0.01 || left.progress >= 0.99 ? 18 : 0;
        const rightEndpointPenalty = right.progress <= 0.01 || right.progress >= 0.99 ? 18 : 0;
        return left.distanceFromPathMeters + leftEndpointPenalty
            - (right.distanceFromPathMeters + rightEndpointPenalty);
    });

    const best = candidates[0] ?? null;
    const second = candidates[1] ?? null;
    const ambiguous = Boolean(
        best && second
        && Math.abs(best.distanceFromPathMeters - second.distanceFromPathMeters) < 20
        && Math.abs(best.edgeIndex - second.edgeIndex) > 1,
    );
    return { best, ambiguous };
}
