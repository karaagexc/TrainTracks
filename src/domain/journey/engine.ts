import { STATIONS } from '@/data/stations';
import { getDistanceKm } from '@/utils/geo';
import { LineId, Station } from '@/types';
import { JOURNEY_CONSTANTS } from './constants';
import { getJourneyStationById } from './graph';
import { JourneyInput, JourneyRoute, JourneySnapshot, JourneyStatusCode } from './types';
import { interpolatePolyline, projectLocationToPolyline } from '@/domain/location/polyline';
import { findBestJourneyRouteMatch, projectLocationToJourneyEdge } from './geometry';
import { getDirectionForStations, isForwardDirection } from '@/domain/railway';

function createEstimatorState() {
    return {
        estimatorMode: 'LIVE' as const,
        estimatorConfidence: 'LOW' as const,
        lastSampleAt: null,
        lastTrustedFixAt: null,
        lastEstimatorUpdateAt: null,
        projectedDistanceMeters: null,
        projectedPathLengthMeters: null,
        estimatedSpeedKph: 0,
        uncertaintyMeters: 0,
        stationCandidateId: null,
        stationCandidateSince: null,
        stationCandidateSamples: 0,
        zeroSpeedSince: null,
        recoveryStartedAt: null,
        estimatedLocation: null,
    };
}

function getRouteStationIndex(route: JourneyRoute | null, stationId: string | null): number {
    if (!route || !stationId) return -1;
    return route.stationIds.findIndex((candidate) => candidate === stationId);
}

function deriveDirection(route: JourneyRoute | null, currentStationId: string | null, nextStationId: string | null): JourneySnapshot['direction'] {
    const current = currentStationId ? getJourneyStationById(currentStationId) : null;
    const next = nextStationId ? getJourneyStationById(nextStationId) : null;

    if (current && next && current.lineId === next.lineId) {
        return getDirectionForStations(current, next);
    }

    if (!route || !currentStationId) return null;
    const currentIndex = getRouteStationIndex(route, currentStationId);
    if (currentIndex > 0) {
        const prev = getJourneyStationById(route.stationIds[currentIndex - 1]);
        if (prev && current && prev.lineId === current.lineId) {
            return getDirectionForStations(prev, current);
        }
    }

    return null;
}

export function getJourneyEntryDirection(route: JourneyRoute | null): JourneySnapshot['direction'] {
    const edge = route?.edges[0];
    if (!edge || edge.type !== 'rail') return null;
    const from = getJourneyStationById(edge.fromStationId);
    const to = getJourneyStationById(edge.toStationId);
    return from && to ? getDirectionForStations(from, to) : null;
}

function deriveCompatibilityStatus(snapshot: JourneySnapshot): 'IDLE' | 'WAITING' | 'TRANSIT' | 'ARRIVED' {
    switch (snapshot.phase) {
        case 'IDLE':
            return 'IDLE';
        case 'ARRIVED':
            return 'ARRIVED';
        case 'WAITING_AT_ORIGIN':
        case 'TRANSFER_WAIT':
            return 'WAITING';
        default:
            return 'TRANSIT';
    }
}

function computeMetrics(snapshot: JourneySnapshot): JourneySnapshot {
    const route = snapshot.route;
    if (!route) {
        return {
            ...snapshot,
            totalProgress: 0,
            distanceToDestMeters: null,
        };
    }

    if (route.edges.length === 0) {
        return {
            ...snapshot,
            totalProgress: snapshot.phase === 'ARRIVED' ? 100 : 0,
            distanceToDestMeters: snapshot.phase === 'ARRIVED' ? 0 : null,
        };
    }

    const completedDistanceMeters = route.edges.slice(0, snapshot.activeEdgeIndex)
        .reduce((sum, edge) => sum + edge.distanceMeters, 0)
        + (route.edges[snapshot.activeEdgeIndex]?.distanceMeters ?? 0)
            * (snapshot.phase === 'ARRIVED' ? 1 : snapshot.legProgress / 100);

    return {
        ...snapshot,
        totalProgress: route.totalDistanceMeters > 0 ? clamp(completedDistanceMeters / route.totalDistanceMeters * 100, 0, 100)
            : snapshot.phase === 'ARRIVED' ? 100 : 0,
        distanceToDestMeters: Math.max(0, Math.round(route.totalDistanceMeters - completedDistanceMeters)),
        completedDistanceMeters,
        completedAt: snapshot.phase === 'ARRIVED'
            ? snapshot.completedAt ?? snapshot.lastTrustedFixAt ?? Date.now()
            : null,
    };
}

function createSnapshotAtCursor(
    route: JourneyRoute | null,
    stationIndex: number,
    options?: { hasDepartedOrigin?: boolean; gpsFallbackActive?: boolean; compatibilityWait?: boolean }
): JourneySnapshot {
    const currentStationId = route?.stationIds[stationIndex] ?? null;
    const nextStationId = route?.stationIds[stationIndex + 1] ?? null;
    const hasDepartedOrigin = options?.hasDepartedOrigin ?? false;

    let phase: JourneySnapshot['phase'];
    if (!route || !currentStationId) {
        phase = 'IDLE';
    } else if (!nextStationId) {
        phase = 'ARRIVED';
    } else if (!hasDepartedOrigin && stationIndex === 0) {
        phase = 'WAITING_AT_ORIGIN';
    } else if (options?.compatibilityWait) {
        phase = 'TRANSFER_WAIT';
    } else {
        phase = 'ONBOARD_DWELL';
    }

    const base: JourneySnapshot = {
        tripId: null,
        startedAt: null,
        completedAt: null,
        routeVersion: 0,
        completedDistanceMeters: 0,
        phase,
        statusCode: phase === 'ARRIVED' ? 'ARRIVED' : 'AT_STATION',
        route,
        activeEdgeIndex: Math.min(stationIndex, Math.max(0, (route?.edges.length ?? 1) - 1)),
        currentStationId,
        nextStationId,
        displayStationId: currentStationId,
        direction: deriveDirection(route, currentStationId, nextStationId),
        legProgress: phase === 'ARRIVED' ? 100 : 0,
        totalProgress: phase === 'ARRIVED' ? 100 : 0,
        distanceToNextMeters: nextStationId ? 0 : null,
        distanceToDestMeters: null,
        walkingDistanceMeters: null,
        gpsFallbackActive: options?.gpsFallbackActive ?? false,
        hasDepartedOrigin,
        hasDwelt: false,
        statusLock: 0,
        legProgressHighWater: 0,
        visualOriginStationId: currentStationId,
        visualTargetStationId: nextStationId,
        lastLocation: null,
        ...createEstimatorState(),
    };

    return computeMetrics(base);
}

function moveCursorToStation(snapshot: JourneySnapshot, stationId: string, compatibilityWait = false): JourneySnapshot {
    const route = snapshot.route;
    const stationIndex = route?.stationIds[snapshot.activeEdgeIndex] === stationId
        ? snapshot.activeEdgeIndex
        : route?.stationIds.indexOf(stationId, snapshot.activeEdgeIndex + 1) ?? -1;
    if (!route || stationIndex === -1) return snapshot;

    const moved = createSnapshotAtCursor(route, stationIndex, {
        hasDepartedOrigin: snapshot.hasDepartedOrigin || stationIndex > 0,
        gpsFallbackActive: snapshot.gpsFallbackActive,
        compatibilityWait,
    });
    return {
        ...copyEstimatorRuntime(snapshot, moved),
        projectedDistanceMeters: null,
        projectedPathLengthMeters: null,
        stationCandidateId: null,
        stationCandidateSince: null,
        stationCandidateSamples: 0,
    };
}

function advanceCursor(snapshot: JourneySnapshot, compatibilityWait = false): JourneySnapshot {
    if (!snapshot.route || !snapshot.nextStationId) return snapshot;
    return moveCursorToStation(snapshot, snapshot.nextStationId, compatibilityWait);
}

function updateVisualAnchors(snapshot: JourneySnapshot, currentStation: Station | null, nextStation: Station | null, statusCode: JourneyStatusCode): JourneySnapshot {
    let visualOriginStationId = snapshot.visualOriginStationId;
    let visualTargetStationId = snapshot.visualTargetStationId;
    let legProgressHighWater = snapshot.legProgressHighWater;

    if (!visualTargetStationId && nextStation) {
        visualTargetStationId = nextStation.id;
        visualOriginStationId = currentStation?.id ?? visualOriginStationId;
    }

    if (!visualOriginStationId && currentStation) {
        visualOriginStationId = currentStation.id;
    }

    if (currentStation && nextStation) {
        const isApproaching = statusCode === 'APPROACHING_STATION' || statusCode === 'TRANSFER_ACTIVE';
        if (!isApproaching) {
            if (visualOriginStationId !== currentStation.id && visualTargetStationId !== currentStation.id) {
                visualOriginStationId = currentStation.id;
                visualTargetStationId = nextStation.id;
                legProgressHighWater = 0;
            }
            if (visualTargetStationId !== nextStation.id && visualOriginStationId === currentStation.id) {
                visualTargetStationId = nextStation.id;
                legProgressHighWater = 0;
            }
        }
    }

    return {
        ...snapshot,
        visualOriginStationId,
        visualTargetStationId,
        legProgressHighWater,
    };
}

function handleTransferSample(snapshot: JourneySnapshot, location: { latitude: number; longitude: number }, gpsAccuracy: number | null, timestamp: number): JourneySnapshot {
    const route = snapshot.route;
    const currentStation = snapshot.currentStationId ? getJourneyStationById(snapshot.currentStationId) : null;
    const nextStation = snapshot.nextStationId ? getJourneyStationById(snapshot.nextStationId) : null;
    const activeEdge = route?.edges[snapshot.activeEdgeIndex] ?? null;
    const transferEdge = activeEdge?.type === 'transfer' ? activeEdge : null;
    if (!route || !currentStation || !nextStation || !transferEdge) return snapshot;

    const transferTarget = transferEdge.targetCoordinates ?? nextStation;
    const partnerDistMeters = Math.round(getDistanceKm(location, transferTarget) * 1000);
    const projection = projectLocationToPolyline(location, [currentStation, transferTarget]);
    const hasAccurateArrivalFix = gpsAccuracy !== null && gpsAccuracy <= JOURNEY_CONSTANTS.transferExitAccuracyMeters;
    const corridorMeters = JOURNEY_CONSTANTS.transferCorridorBaseMeters + Math.min(30, (gpsAccuracy ?? 0) / 2);
    if (!hasAccurateArrivalFix || !projection || projection.distanceFromPathMeters > corridorMeters) {
        return {
            ...snapshot,
            phase: 'TRANSFER_WALK',
            statusCode: 'TRANSFER_ACTIVE',
            lastSampleAt: timestamp,
            estimatorMode: 'UNCERTAIN',
            estimatorConfidence: 'LOW',
            gpsFallbackActive: true,
            stationCandidateId: null,
            stationCandidateSince: null,
            stationCandidateSamples: 0,
            uncertaintyMeters: Math.max(snapshot.uncertaintyMeters, (gpsAccuracy ?? 999) + (projection?.distanceFromPathMeters ?? 0)),
        };
    }
    const projectedProgress = projection.pathLengthMeters > 0 ? projection.distanceAlongMeters / projection.pathLengthMeters * 100 : 0;
    const rawProgress = Math.min(99, Math.max(snapshot.legProgressHighWater, projectedProgress));
    const remainingPathMeters = Math.max(0, Math.round(transferEdge.distanceMeters * (1 - Math.min(100, rawProgress) / 100)));
    const completionRadiusMeters = transferEdge.completionRadiusMeters || JOURNEY_CONSTANTS.transferExitRadiusMeters;
    const isAtPartner = hasAccurateArrivalFix && (partnerDistMeters <= JOURNEY_CONSTANTS.transferHardExitRadiusMeters
        || (partnerDistMeters <= completionRadiusMeters && rawProgress >= 90));
    const sameCandidate = snapshot.stationCandidateId === nextStation.id
        && snapshot.lastSampleAt !== null && timestamp - snapshot.lastSampleAt <= JOURNEY_CONSTANTS.arrivalMaxSampleGapMs;
    const stationCandidateSince = isAtPartner ? sameCandidate ? snapshot.stationCandidateSince ?? timestamp : timestamp : null;
    const stationCandidateSamples = isAtPartner ? sameCandidate ? snapshot.stationCandidateSamples + 1 : 1 : 0;
    const working = {
        ...snapshot,
        lastSampleAt: timestamp,
        lastTrustedFixAt: timestamp,
        lastEstimatorUpdateAt: timestamp,
        projectedDistanceMeters: transferEdge.distanceMeters * rawProgress / 100,
        projectedPathLengthMeters: transferEdge.distanceMeters,
        estimatedLocation: location,
        estimatedSpeedKph: 0,
        estimatorMode: 'LIVE' as const,
        estimatorConfidence: gpsAccuracy! <= 35 ? 'HIGH' as const : 'MEDIUM' as const,
        gpsFallbackActive: false,
        uncertaintyMeters: gpsAccuracy!,
        stationCandidateId: isAtPartner ? nextStation.id : null,
        stationCandidateSince,
        stationCandidateSamples,
    };

    if (stationCandidateSince !== null && timestamp - stationCandidateSince >= JOURNEY_CONSTANTS.railArrivalConfirmMs
        && stationCandidateSamples >= JOURNEY_CONSTANTS.arrivalMinSamples) {
        return advanceCursor({
            ...working,
            phase: 'TRANSFER_WAIT',
            statusCode: 'AT_STATION',
            displayStationId: nextStation.id,
            legProgress: 100,
            walkingDistanceMeters: null,
            legProgressHighWater: 0,
            hasDwelt: false,
            statusLock: 0,
            visualOriginStationId: nextStation.id,
            visualTargetStationId: route.stationIds[snapshot.activeEdgeIndex + 2] ?? null,
            lastLocation: location,
        }, true);
    }

    return computeMetrics({
        ...working,
        phase: 'TRANSFER_WALK',
        statusCode: 'TRANSFER_ACTIVE',
        displayStationId: currentStation.id,
        legProgress: rawProgress,
        distanceToNextMeters: remainingPathMeters,
        walkingDistanceMeters: remainingPathMeters,
        legProgressHighWater: rawProgress,
        lastLocation: location,
    });
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function getEstimatorConfidence(accuracyMeters: number, distanceFromPathMeters: number): JourneySnapshot['estimatorConfidence'] {
    if (accuracyMeters <= 35 && distanceFromPathMeters <= 35) return 'HIGH';
    if (accuracyMeters <= JOURNEY_CONSTANTS.trustedGpsAccuracyMeters && distanceFromPathMeters <= 100) return 'MEDIUM';
    return 'LOW';
}

function getRailCorridorMeters(lineId: LineId, accuracyMeters: number): number {
    const base = lineId === 'EDSA'
        ? JOURNEY_CONSTANTS.busCorridorBaseMeters
        : JOURNEY_CONSTANTS.railCorridorBaseMeters;
    return base + Math.min(100, accuracyMeters * 0.65);
}

function copyEstimatorRuntime(from: JourneySnapshot, to: JourneySnapshot): JourneySnapshot {
    return {
        ...to,
        tripId: from.tripId,
        startedAt: from.startedAt,
        completedAt: to.phase === 'ARRIVED' ? from.completedAt ?? from.lastTrustedFixAt ?? Date.now() : null,
        routeVersion: from.routeVersion,
        estimatorMode: from.estimatorMode,
        estimatorConfidence: from.estimatorConfidence,
        lastSampleAt: from.lastSampleAt,
        lastTrustedFixAt: from.lastTrustedFixAt,
        lastEstimatorUpdateAt: from.lastEstimatorUpdateAt,
        projectedDistanceMeters: from.projectedDistanceMeters,
        projectedPathLengthMeters: from.projectedPathLengthMeters,
        estimatedSpeedKph: from.estimatedSpeedKph,
        uncertaintyMeters: from.uncertaintyMeters,
        stationCandidateId: null,
        stationCandidateSince: null,
        stationCandidateSamples: 0,
        zeroSpeedSince: from.zeroSpeedSince,
        recoveryStartedAt: from.recoveryStartedAt,
        estimatedLocation: from.estimatedLocation,
        lastLocation: from.lastLocation,
    };
}

function handleRailSample(
    snapshot: JourneySnapshot,
    location: { latitude: number; longitude: number },
    speedKph: number | null,
    gpsAccuracy: number | null,
    timestamp = Date.now(),
    source: 'gps' | 'simulation' | 'fallback' = 'gps',
    allowPassedStationAdvance = true,
): JourneySnapshot {
    const route = snapshot.route;
    const currentStation = snapshot.currentStationId ? getJourneyStationById(snapshot.currentStationId) : null;
    const nextStation = snapshot.nextStationId ? getJourneyStationById(snapshot.nextStationId) : null;
    const currentEdge = route?.edges[snapshot.activeEdgeIndex] ?? null;
    if (!route || !currentStation || !nextStation || !currentEdge || currentEdge.type !== 'rail') return snapshot;

    const projection = projectLocationToJourneyEdge(route, snapshot.activeEdgeIndex, location);
    const accuracyMeters = source === 'simulation' ? Math.min(gpsAccuracy ?? 5, 10) : gpsAccuracy ?? 999;
    const stationAnchorRadiusMeters = currentEdge.lineId === 'EDSA'
        ? JOURNEY_CONSTANTS.busArrivalRadiusMeters
        : JOURNEY_CONSTANTS.railArrivalRadiusMeters;
    const isSimulationStationAnchor = source === 'simulation' && Math.min(
        getDistanceKm(location, currentStation) * 1000,
        getDistanceKm(location, nextStation) * 1000,
    ) <= stationAnchorRadiusMeters;
    const corridorMeters = getRailCorridorMeters(currentEdge.lineId, accuracyMeters);
    const trusted = Boolean(
        projection
        && accuracyMeters <= JOURNEY_CONSTANTS.maxJourneyGpsAccuracyMeters
        && (projection.distanceFromPathMeters <= corridorMeters || isSimulationStationAnchor),
    );

    if (!projection || !trusted) {
        return computeMetrics({
            ...snapshot,
            estimatorMode: 'UNCERTAIN',
            estimatorConfidence: 'LOW',
            lastSampleAt: timestamp,
            lastEstimatorUpdateAt: timestamp,
            uncertaintyMeters: Math.max(
                snapshot.uncertaintyMeters,
                Math.round((projection?.distanceFromPathMeters ?? 250) + accuracyMeters),
            ),
            gpsFallbackActive: source !== 'simulation',
            lastLocation: location,
        });
    }

    const wasFallback = snapshot.estimatorMode === 'COASTING'
        || snapshot.estimatorMode === 'DEAD_RECKONING'
        || snapshot.estimatorMode === 'STATION_DWELL'
        || snapshot.estimatorMode === 'UNCERTAIN';
    const recoveryStartedAt = wasFallback
        ? timestamp
        : snapshot.estimatorMode === 'RECOVERING'
            ? snapshot.recoveryStartedAt ?? timestamp
            : null;
    const estimatorMode: JourneySnapshot['estimatorMode'] = source === 'simulation'
        ? 'LIVE'
        : recoveryStartedAt && timestamp - recoveryStartedAt < JOURNEY_CONSTANTS.recoveryDurationMs
            ? 'RECOVERING'
            : 'LIVE';
    const measuredSpeedKph = clamp(speedKph ?? snapshot.estimatedSpeedKph, 0, 100);
    const isStopped = measuredSpeedKph <= JOURNEY_CONSTANTS.arrivalMaxSpeedKph;
    const zeroSpeedSince = isStopped ? snapshot.zeroSpeedSince ?? timestamp : null;
    const rawProgress = projection.progress * 100;
    const recoveryFloor = snapshot.hasDepartedOrigin ? snapshot.legProgressHighWater : 0;
    let legProgress = clamp(Math.max(rawProgress, recoveryFloor), 0, 100);
    let legProgressHighWater = Math.max(snapshot.legProgressHighWater, legProgress);
    let hasDepartedOrigin = snapshot.hasDepartedOrigin;
    let hasDwelt = snapshot.hasDwelt;
    const nearCurrent = projection.distanceAlongMeters <= (
        currentEdge.lineId === 'EDSA'
            ? JOURNEY_CONSTANTS.busArrivalRadiusMeters
            : JOURNEY_CONSTANTS.railArrivalRadiusMeters
    );
    const arrivalRadiusMeters = stationAnchorRadiusMeters;
    const nearNext = projection.remainingMeters <= arrivalRadiusMeters + Math.min(35, accuracyMeters * 0.25);
    const candidateId = isStopped ? nearNext ? nextStation.id : nearCurrent ? currentStation.id : null : null;
    const sameCandidate = candidateId !== null && snapshot.stationCandidateId === candidateId
        && (currentEdge.lineId === 'EDSA' || (snapshot.lastSampleAt !== null
            && timestamp - snapshot.lastSampleAt <= JOURNEY_CONSTANTS.arrivalMaxSampleGapMs));
    const isNewSample = snapshot.lastSampleAt !== timestamp;
    const stationCandidateSince = candidateId
        ? sameCandidate ? snapshot.stationCandidateSince ?? timestamp : timestamp
        : null;
    const stationCandidateSamples = candidateId
        ? sameCandidate ? snapshot.stationCandidateSamples + (isNewSample ? 1 : 0) : 1
        : 0;
    const confirmMs = currentEdge.lineId === 'EDSA'
        ? JOURNEY_CONSTANTS.busArrivalConfirmMs
        : JOURNEY_CONSTANTS.railArrivalConfirmMs;
    const candidateConfirmed = stationCandidateSince !== null
        && timestamp - stationCandidateSince >= confirmMs
        && stationCandidateSamples >= JOURNEY_CONSTANTS.arrivalMinSamples;
    const isDwellingAtCurrent = nearCurrent && isStopped && (
        source === 'simulation'
        || !hasDepartedOrigin
        || snapshot.phase === 'ONBOARD_DWELL'
        || snapshot.phase === 'TRANSFER_WAIT'
        || snapshot.estimatorMode === 'STATION_DWELL'
        || (candidateId === currentStation.id && candidateConfirmed)
    );

    if (isDwellingAtCurrent) {
        legProgress = 0;
        legProgressHighWater = 0;
        hasDwelt = true;
        if (currentStation.id === route.originId && snapshot.activeEdgeIndex === 0) hasDepartedOrigin = false;
    }
    if (projection.distanceAlongMeters >= JOURNEY_CONSTANTS.departureDistanceMeters && measuredSpeedKph >= 6) {
        hasDepartedOrigin = true;
    }

    const stationArrivalConfirmed = candidateId === nextStation.id && candidateConfirmed;

    let statusCode: JourneyStatusCode;
    let displayStationId: string;
    let phase: JourneySnapshot['phase'];
    let statusLock: JourneySnapshot['statusLock'];

    if (isDwellingAtCurrent) {
        statusCode = 'AT_STATION';
        displayStationId = currentStation.id;
        phase = currentStation.id === route.originId && snapshot.activeEdgeIndex === 0
            ? 'WAITING_AT_ORIGIN' : 'ONBOARD_DWELL';
        statusLock = 0;
    } else if (projection.distanceAlongMeters < Math.max(160, projection.pathLengthMeters * 0.18)
        && (currentEdge.lineId === 'EDSA' || snapshot.statusLock < 2)) {
        statusCode = 'LEAVING_STATION';
        displayStationId = currentStation.id;
        phase = 'ONBOARD_MOVING';
        statusLock = 1;
    } else if (projection.remainingMeters <= Math.max(450, projection.pathLengthMeters * 0.28)
        || (currentEdge.lineId !== 'EDSA' && snapshot.statusLock === 3)) {
        statusCode = 'APPROACHING_STATION';
        displayStationId = nextStation.id;
        phase = 'ONBOARD_MOVING';
        statusLock = 3;
    } else {
        statusCode = 'BETWEEN_STATIONS';
        displayStationId = nextStation.id;
        phase = 'ONBOARD_MOVING';
        statusLock = 2;
    }

    const working = updateVisualAnchors({
        ...snapshot,
        phase,
        statusCode,
        displayStationId,
        hasDepartedOrigin,
        hasDwelt,
        statusLock,
        legProgress,
        legProgressHighWater,
        distanceToNextMeters: Math.round(projection.remainingMeters),
        walkingDistanceMeters: null,
        gpsFallbackActive: false,
        lastLocation: location,
        estimatorMode,
        estimatorConfidence: getEstimatorConfidence(accuracyMeters, projection.distanceFromPathMeters),
        lastSampleAt: timestamp,
        lastTrustedFixAt: timestamp,
        lastEstimatorUpdateAt: timestamp,
        projectedDistanceMeters: projection.distanceAlongMeters,
        projectedPathLengthMeters: projection.pathLengthMeters,
        estimatedSpeedKph: measuredSpeedKph,
        uncertaintyMeters: Math.round(accuracyMeters + projection.distanceFromPathMeters),
        stationCandidateId: candidateId,
        stationCandidateSince,
        stationCandidateSamples,
        zeroSpeedSince,
        recoveryStartedAt: estimatorMode === 'RECOVERING' ? recoveryStartedAt : null,
        estimatedLocation: estimatorMode === 'RECOVERING' && snapshot.estimatedLocation && recoveryStartedAt
            ? {
                latitude: snapshot.estimatedLocation.latitude + (projection.location.latitude - snapshot.estimatedLocation.latitude)
                    * clamp((timestamp - (snapshot.lastEstimatorUpdateAt ?? recoveryStartedAt)) / Math.max(1, JOURNEY_CONSTANTS.recoveryDurationMs - (timestamp - recoveryStartedAt)), 0, 1),
                longitude: snapshot.estimatedLocation.longitude + (projection.location.longitude - snapshot.estimatedLocation.longitude)
                    * clamp((timestamp - (snapshot.lastEstimatorUpdateAt ?? recoveryStartedAt)) / Math.max(1, JOURNEY_CONSTANTS.recoveryDurationMs - (timestamp - recoveryStartedAt)), 0, 1),
            }
            : projection.location,
    }, currentStation, nextStation, statusCode);

    if (stationArrivalConfirmed) {
        const advanced = copyEstimatorRuntime(working, advanceCursor(working));
        return computeMetrics({
            ...advanced,
            estimatorMode: advanced.phase === 'ARRIVED' ? 'LIVE' : 'STATION_DWELL',
            estimatorConfidence: working.estimatorConfidence,
            projectedDistanceMeters: 0,
            projectedPathLengthMeters: null,
            estimatedSpeedKph: 0,
            uncertaintyMeters: working.uncertaintyMeters,
            stationCandidateId: null,
            stationCandidateSince: null,
            stationCandidateSamples: 0,
            zeroSpeedSince: zeroSpeedSince ?? timestamp,
            recoveryStartedAt: null,
            gpsFallbackActive: false,
        });
    }

    if (
        allowPassedStationAdvance
        && measuredSpeedKph >= 8
        && projection.progress >= 0.82
        && route.edges[snapshot.activeEdgeIndex + 1]?.type === 'rail'
    ) {
        const nextProjection = projectLocationToJourneyEdge(route, snapshot.activeEdgeIndex + 1, location);
        if (
            nextProjection
            && nextProjection.distanceFromPathMeters <= corridorMeters
            && nextProjection.distanceAlongMeters >= Math.max(120, accuracyMeters * 1.5)
            && nextProjection.progress < 0.8
        ) {
            const advanced = copyEstimatorRuntime(working, advanceCursor(working));
            return handleRailSample(
                advanced,
                location,
                speedKph,
                gpsAccuracy,
                timestamp,
                source,
                false,
            );
        }
    }

    return computeMetrics(working);
}

function handleEstimatorTick(snapshot: JourneySnapshot, timestamp: number): JourneySnapshot {
    if (!snapshot.route || snapshot.phase === 'IDLE' || snapshot.phase === 'ARRIVED') return snapshot;
    if (!snapshot.lastTrustedFixAt || snapshot.projectedDistanceMeters === null || snapshot.projectedPathLengthMeters === null) {
        return snapshot;
    }

    const ageMs = timestamp - snapshot.lastTrustedFixAt;
    if (ageMs < JOURNEY_CONSTANTS.coastingAfterMs) return snapshot;
    const activeEdge = snapshot.route.edges[snapshot.activeEdgeIndex];
    if (!activeEdge || activeEdge.type !== 'rail') {
        return {
            ...snapshot,
            estimatorMode: ageMs >= JOURNEY_CONSTANTS.deadReckoningAfterMs ? 'UNCERTAIN' : 'COASTING',
            estimatorConfidence: 'LOW',
            gpsFallbackActive: true,
            lastEstimatorUpdateAt: timestamp,
        };
    }

    const elapsedSeconds = clamp(
        (timestamp - (snapshot.lastEstimatorUpdateAt ?? snapshot.lastTrustedFixAt)) / 1000,
        0,
        2,
    );
    const uncertaintyMeters = snapshot.uncertaintyMeters + elapsedSeconds * (
        ageMs < JOURNEY_CONSTANTS.deadReckoningAfterMs ? 3 : 10
    );
    if (
        ageMs >= JOURNEY_CONSTANTS.uncertainAfterMs
        || uncertaintyMeters >= JOURNEY_CONSTANTS.maxDeadReckoningUncertaintyMeters
    ) {
        return computeMetrics({
            ...snapshot,
            estimatorMode: 'UNCERTAIN',
            estimatorConfidence: 'LOW',
            estimatedSpeedKph: 0,
            uncertaintyMeters: Math.round(uncertaintyMeters),
            gpsFallbackActive: true,
            lastEstimatorUpdateAt: timestamp,
        });
    }

    const remainingMeters = Math.max(0, snapshot.projectedPathLengthMeters - snapshot.projectedDistanceMeters);
    const brakingSpeedKph = Math.sqrt(Math.max(0, 2 * 0.65 * remainingMeters)) * 3.6;
    const decayPerSecond = ageMs < JOURNEY_CONSTANTS.deadReckoningAfterMs ? 0.25 : 0.8;
    const estimatedSpeedKph = Math.max(
        0,
        Math.min(brakingSpeedKph, snapshot.estimatedSpeedKph - decayPerSecond * elapsedSeconds),
    );
    const canProject = snapshot.hasDepartedOrigin && snapshot.estimatedSpeedKph >= 6;
    const stepMeters = canProject ? estimatedSpeedKph / 3.6 * elapsedSeconds : 0;
    const projectedDistanceMeters = Math.min(
        snapshot.projectedPathLengthMeters,
        snapshot.projectedDistanceMeters + stepMeters,
    );
    const nextRemainingMeters = Math.max(0, snapshot.projectedPathLengthMeters - projectedDistanceMeters);
    const reachedStation = nextRemainingMeters <= 1;
    const projectionPath = snapshot.currentStationId && snapshot.nextStationId
        ? projectLocationToJourneyEdge(
            snapshot.route,
            snapshot.activeEdgeIndex,
            snapshot.estimatedLocation ?? snapshot.lastLocation ?? getJourneyStationById(snapshot.currentStationId)!,
        )?.path ?? null
        : null;
    const estimatedLocation = projectionPath
        ? interpolatePolyline(projectionPath, projectedDistanceMeters)
        : snapshot.estimatedLocation;
    const legProgress = clamp(projectedDistanceMeters / snapshot.projectedPathLengthMeters * 100, 0, 100);
    const stationaryAtConfirmedStation = (snapshot.phase === 'WAITING_AT_ORIGIN'
        || snapshot.phase === 'ONBOARD_DWELL' || snapshot.phase === 'TRANSFER_WAIT')
        && snapshot.statusCode === 'AT_STATION' && snapshot.estimatedSpeedKph < 6;
    const estimatorMode: JourneySnapshot['estimatorMode'] = reachedStation || stationaryAtConfirmedStation
        ? 'STATION_DWELL'
        : ageMs < JOURNEY_CONSTANTS.deadReckoningAfterMs
            ? 'COASTING'
            : canProject
                ? 'DEAD_RECKONING'
                : 'UNCERTAIN';

    return computeMetrics({
        ...snapshot,
        phase: stationaryAtConfirmedStation ? snapshot.phase : 'ONBOARD_MOVING',
        statusCode: !stationaryAtConfirmedStation && nextRemainingMeters <= 450 ? 'APPROACHING_STATION' : snapshot.statusCode,
        displayStationId: !stationaryAtConfirmedStation && nextRemainingMeters <= 450 ? snapshot.nextStationId : snapshot.displayStationId,
        legProgress: Math.max(snapshot.legProgress, legProgress),
        legProgressHighWater: snapshot.legProgressHighWater,
        distanceToNextMeters: Math.round(nextRemainingMeters),
        estimatorMode,
        estimatorConfidence: estimatorMode === 'COASTING' ? 'MEDIUM' : 'LOW',
        lastEstimatorUpdateAt: timestamp,
        projectedDistanceMeters,
        estimatedSpeedKph: reachedStation || !canProject ? 0 : estimatedSpeedKph,
        uncertaintyMeters: Math.round(uncertaintyMeters),
        gpsFallbackActive: true,
        estimatedLocation,
    });
}

export function alignJourneySnapshotToLocation(
    snapshot: JourneySnapshot,
    location: { latitude: number; longitude: number },
    speedKph: number | null,
    gpsAccuracy: number | null,
    timestamp = Date.now(),
    source: 'gps' | 'simulation' = 'gps',
): JourneySnapshot {
    const route = snapshot.route;
    if (!route || route.edges.length === 0) return snapshot;
    if (snapshot.phase === 'ARRIVED' || !Number.isFinite(timestamp) || timestamp <= 0
        || (snapshot.lastSampleAt !== null && timestamp <= snapshot.lastSampleAt)
        || !Number.isFinite(location.latitude) || Math.abs(location.latitude) > 90
        || !Number.isFinite(location.longitude) || Math.abs(location.longitude) > 180
        || (speedKph !== null && (!Number.isFinite(speedKph) || speedKph < 0))
        || (gpsAccuracy !== null && (!Number.isFinite(gpsAccuracy) || gpsAccuracy < 0))) return snapshot;
    const match = findBestJourneyRouteMatch(route, location);
    const accuracyMeters = gpsAccuracy ?? 999;
    if (!match.best || match.ambiguous || accuracyMeters > JOURNEY_CONSTANTS.maxJourneyGpsAccuracyMeters) {
        return {
            ...snapshot,
            estimatorMode: 'UNCERTAIN',
            estimatorConfidence: 'LOW',
            uncertaintyMeters: Math.max(snapshot.uncertaintyMeters, Math.round(accuracyMeters)),
        };
    }

    const edge = route.edges[match.best.edgeIndex];
    if (edge.type !== 'rail') return snapshot;
    const corridorMeters = getRailCorridorMeters(edge.lineId, accuracyMeters);
    if (match.best.distanceFromPathMeters > corridorMeters) return snapshot;

    const edgeDelta = match.best.edgeIndex - snapshot.activeEdgeIndex;
    if (snapshot.hasDepartedOrigin && (edgeDelta < 0 || edgeDelta > 1)) {
        return {
            ...snapshot,
            estimatorMode: 'UNCERTAIN',
            estimatorConfidence: 'LOW',
        };
    }

    const aligned = match.best.edgeIndex === snapshot.activeEdgeIndex
        ? snapshot
        : moveCursorToStation(snapshot, edge.fromStationId);
    return handleRailSample(
        aligned,
        location,
        speedKph,
        gpsAccuracy,
        timestamp,
        source,
        false,
    );
}

export function createIdleJourneySnapshot(): JourneySnapshot {
    return {
        tripId: null,
        startedAt: null,
        completedAt: null,
        routeVersion: 0,
        completedDistanceMeters: 0,
        phase: 'IDLE',
        statusCode: 'WAITING_FOR_GPS',
        route: null,
        activeEdgeIndex: 0,
        currentStationId: null,
        nextStationId: null,
        displayStationId: null,
        direction: null,
        legProgress: 0,
        totalProgress: 0,
        distanceToNextMeters: null,
        distanceToDestMeters: null,
        walkingDistanceMeters: null,
        gpsFallbackActive: false,
        hasDepartedOrigin: false,
        hasDwelt: false,
        statusLock: 0,
        legProgressHighWater: 0,
        visualOriginStationId: null,
        visualTargetStationId: null,
        lastLocation: null,
        ...createEstimatorState(),
    };
}

export function createJourneyPreviewSnapshot(route: JourneyRoute | null): JourneySnapshot {
    return createSnapshotAtCursor(route, 0);
}

export function createJourneySnapshot(route: JourneyRoute | null, identity?: { tripId?: string; startedAt?: number }): JourneySnapshot {
    if (!route || route.stationIds.length === 0) {
        return createIdleJourneySnapshot();
    }

    const snapshot = createSnapshotAtCursor(route, 0, {
        hasDepartedOrigin: false,
        gpsFallbackActive: false,
    });
    const startedAt = identity?.startedAt ?? Date.now();
    return {
        ...snapshot,
        tripId: identity?.tripId ?? globalThis.crypto?.randomUUID?.() ?? `trip-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        startedAt,
        completedAt: snapshot.phase === 'ARRIVED' ? startedAt : null,
        routeVersion: 1,
    };
}

export function amendJourneySnapshot(snapshot: JourneySnapshot, route: JourneyRoute): JourneySnapshot {
    const currentIndex = Math.min(snapshot.activeEdgeIndex, Math.max(0, route.stationIds.length - 1));
    const nextStationId = route.stationIds[currentIndex + 1] ?? null;
    const amended = {
        ...snapshot,
        route,
        routeVersion: snapshot.routeVersion + 1,
        nextStationId,
        direction: deriveDirection(route, snapshot.currentStationId, nextStationId),
        visualTargetStationId: nextStationId,
        stationCandidateId: null,
        stationCandidateSince: null,
        stationCandidateSamples: 0,
    };
    return computeMetrics(nextStationId ? amended : {
        ...amended,
        phase: 'ARRIVED',
        statusCode: 'ARRIVED',
        legProgress: 100,
        totalProgress: 100,
    });
}

export function reduceJourneySnapshot(snapshot: JourneySnapshot, input: JourneyInput): JourneySnapshot {
    switch (input.type) {
        case 'START_TRIP':
            return createJourneySnapshot(input.route, { tripId: input.tripId, startedAt: input.timestamp });
        case 'END_TRIP':
            return createIdleJourneySnapshot();
        case 'SET_FALLBACK_ACTIVE':
            return { ...snapshot, gpsFallbackActive: input.active };
        case 'SYNC_ROUTE':
            if (!input.route) return createIdleJourneySnapshot();
            if (input.anchorStationId) {
                const anchored = moveCursorToStation(
                    { ...snapshot, route: input.route },
                    input.anchorStationId,
                    snapshot.phase === 'TRANSFER_WAIT'
                );
                return {
                    ...anchored,
                    hasDepartedOrigin: input.preserveDeparture ? snapshot.hasDepartedOrigin : anchored.hasDepartedOrigin,
                    gpsFallbackActive: snapshot.gpsFallbackActive,
                };
            }
            return createJourneySnapshot(input.route);
        case 'SNAP_TO_STATION':
            return moveCursorToStation(snapshot, input.stationId, snapshot.phase === 'TRANSFER_WAIT');
        case 'CONFIRM_TRANSFER': {
            const edge = snapshot.route?.edges[snapshot.activeEdgeIndex];
            if (snapshot.phase !== 'TRANSFER_WALK' || edge?.type !== 'transfer' || edge.id !== input.edgeId
                || !Number.isFinite(input.timestamp) || input.timestamp <= 0
                || input.timestamp < (snapshot.lastSampleAt ?? snapshot.startedAt ?? 0)) return snapshot;
            const confirmed = advanceCursor({ ...snapshot, lastEstimatorUpdateAt: input.timestamp }, true);
            return confirmed.phase === 'ARRIVED' ? { ...confirmed, completedAt: input.timestamp } : confirmed;
        }
        case 'LOCATION_SAMPLE': {
            const sampleAt = input.timestamp ?? Date.now();
            if (input.source === 'fallback' || snapshot.phase === 'ARRIVED') return snapshot;
            if (input.location && (!Number.isFinite(input.location.latitude) || !Number.isFinite(input.location.longitude)
                || Math.abs(input.location.latitude) > 90 || Math.abs(input.location.longitude) > 180)) return snapshot;
            if (input.speedKph !== null && (!Number.isFinite(input.speedKph) || input.speedKph < 0)) return snapshot;
            if (input.gpsAccuracy !== null && (!Number.isFinite(input.gpsAccuracy) || input.gpsAccuracy < 0)) return snapshot;
            if (!Number.isFinite(sampleAt) || sampleAt <= 0
                || (snapshot.lastSampleAt !== null && sampleAt <= snapshot.lastSampleAt)) return snapshot;
            if (!snapshot.route || !snapshot.currentStationId) {
                return {
                    ...snapshot,
                    statusCode: input.location ? snapshot.statusCode : 'WAITING_FOR_GPS',
                    lastLocation: input.location,
                };
            }

            if (!input.location) {
                return snapshot;
            }

            if (!snapshot.route.edges[snapshot.activeEdgeIndex]) {
                return {
                    ...snapshot,
                    phase: 'ARRIVED',
                    statusCode: 'ARRIVED',
                    displayStationId: snapshot.currentStationId,
                    legProgress: 100,
                    totalProgress: 100,
                    distanceToNextMeters: null,
                    distanceToDestMeters: 0,
                    lastLocation: input.location,
                };
            }

            if (snapshot.route.edges[snapshot.activeEdgeIndex].type === 'transfer') {
                return handleTransferSample(snapshot, input.location, input.gpsAccuracy, sampleAt);
            }

            return handleRailSample(
                snapshot,
                input.location,
                input.speedKph,
                input.gpsAccuracy,
                sampleAt,
                input.source ?? 'gps',
            );
        }
        case 'TICK':
            if (!Number.isFinite(input.timestamp) || (snapshot.lastEstimatorUpdateAt !== null && input.timestamp <= snapshot.lastEstimatorUpdateAt)) return snapshot;
            return handleEstimatorTick(snapshot, input.timestamp);
        default:
            return snapshot;
    }
}

export function getJourneyCompatibilityStatus(snapshot: JourneySnapshot): 'IDLE' | 'WAITING' | 'TRANSIT' | 'ARRIVED' {
    return deriveCompatibilityStatus(snapshot);
}

export function getJourneyStatusText(snapshot: JourneySnapshot): string {
    const nextStation = snapshot.nextStationId ? getJourneyStationById(snapshot.nextStationId) : null;
    switch (snapshot.statusCode) {
        case 'WAITING_FOR_GPS':
            return 'WAITING FOR GPS';
        case 'AT_STATION':
            return 'CURRENT STATION';
        case 'LEAVING_STATION':
            return 'NOW LEAVING';
        case 'BETWEEN_STATIONS':
            return 'IN TRANSIT';
        case 'APPROACHING_STATION':
            return 'NOW APPROACHING';
        case 'TRANSFER_ACTIVE':
            return nextStation ? `TRANSFER TO ${nextStation.lineId}` : 'TRANSFER';
        case 'ARRIVED':
            return 'CURRENT STATION';
        default:
            return 'WAITING FOR GPS';
    }
}

export function getJourneyStopsView(snapshot: JourneySnapshot) {
    if (!snapshot.route) {
        return {
            stopsRemaining: null,
            stopsToTransfer: null,
            stopsAfterTransfer: null,
            nextLegLineId: null as LineId | null,
        };
    }

    const currentIndex = snapshot.phase === 'ARRIVED' ? snapshot.route.stationIds.length - 1
        : snapshot.activeEdgeIndex + (snapshot.displayStationId === snapshot.nextStationId ? 1 : 0);
    const destinationIndex = snapshot.route.stationIds.length - 1;
    if (currentIndex === -1 || destinationIndex === -1) {
        return {
            stopsRemaining: null,
            stopsToTransfer: null,
            stopsAfterTransfer: null,
            nextLegLineId: null as LineId | null,
        };
    }

    const stopsRemaining = Math.max(0, destinationIndex - currentIndex);
    let stopsToTransfer: number | null = null;
    let stopsAfterTransfer: number | null = null;
    let nextLegLineId: LineId | null = null;

    for (let edgeIndex = Math.max(0, currentIndex); edgeIndex < snapshot.route.edges.length; edgeIndex += 1) {
        const edge = snapshot.route.edges[edgeIndex];
        if (edge.type === 'transfer') {
            stopsToTransfer = Math.max(0, edgeIndex - currentIndex);
            stopsAfterTransfer = Math.max(0, destinationIndex - (edgeIndex + 1));
            nextLegLineId = edge.toLineId;
            break;
        }
    }

    return { stopsRemaining, stopsToTransfer, stopsAfterTransfer, nextLegLineId };
}

export function getJourneyVisualNeighbors(snapshot: JourneySnapshot) {
    const displayStation = snapshot.displayStationId ? getJourneyStationById(snapshot.displayStationId) : null;
    const progressVisualNext = snapshot.visualTargetStationId ? getJourneyStationById(snapshot.visualTargetStationId) : null;

    if (!displayStation) {
        return { visualPrev: null, visualNext: null, progressVisualNext };
    }

    const lineStations = STATIONS
        .filter((station) => station.lineId === displayStation.lineId)
        .sort((left, right) => left.order - right.order);
    const index = lineStations.findIndex((station) => station.id === displayStation.id);
    if (index === -1) {
        return { visualPrev: null, visualNext: null, progressVisualNext };
    }

    const isSouth = !snapshot.direction || isForwardDirection(snapshot.direction);
    return {
        visualPrev: isSouth ? lineStations[index - 1] ?? null : lineStations[index + 1] ?? null,
        visualNext: isSouth ? lineStations[index + 1] ?? null : lineStations[index - 1] ?? null,
        progressVisualNext,
    };
}
