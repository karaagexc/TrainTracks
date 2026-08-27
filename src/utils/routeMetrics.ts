import { getTransferDetails } from '@/data/transfers';
import { getSegmentDistanceKm } from '@/data/segmentDistances';
import { getDistanceKm } from '@/utils/geo';
import { Station } from '@/types';

interface RouteProgressMetricsInput {
    computedRoute: Station[];
    routeIndex: number;
    legProgress: number;
}

interface RouteProgressMetrics {
    totalProgress: number;
    distanceToDest: number;
    totalRouteMeters: number;
    metersCovered: number;
}

function getLegDistanceMeters(from: Station, to: Station): number {
    if (from.lineId !== to.lineId) {
        const transfer = getTransferDetails(from.lineId, to.lineId, from.name);
        return transfer?.distanceMeters || Math.round(getDistanceKm(from, to) * 1000);
    }

    const km = getSegmentDistanceKm(from.id, to.id) || getDistanceKm(from, to);
    return Math.round(km * 1000);
}

export function getRouteProgressMetrics({
    computedRoute,
    routeIndex,
    legProgress,
}: RouteProgressMetricsInput): RouteProgressMetrics | null {
    if (computedRoute.length < 2) return null;

    let totalRouteMeters = 0;
    let metersCovered = 0;
    const safeRouteIndex = Math.max(0, routeIndex);

    for (let i = 0; i < computedRoute.length - 1; i++) {
        const from = computedRoute[i];
        const to = computedRoute[i + 1];
        const legDistanceMeters = getLegDistanceMeters(from, to);

        totalRouteMeters += legDistanceMeters;

        if (safeRouteIndex >= computedRoute.length - 1 || i < safeRouteIndex) {
            metersCovered += legDistanceMeters;
        } else if (i === safeRouteIndex) {
            const pct = Math.min(100, Math.max(0, legProgress)) / 100;
            metersCovered += legDistanceMeters * pct;
        }
    }

    if (totalRouteMeters <= 0) return null;

    return {
        totalProgress: Math.min(100, Math.max(0, (metersCovered / totalRouteMeters) * 100)),
        distanceToDest: Math.max(0, Math.round(totalRouteMeters - metersCovered)),
        totalRouteMeters,
        metersCovered,
    };
}
