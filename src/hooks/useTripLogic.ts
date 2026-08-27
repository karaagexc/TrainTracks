import { useMemo } from 'react';
import {
    getJourneyStatusText,
    getJourneyStopsView,
    getJourneyVisualNeighbors,
} from '@/domain/journey/engine';
import { getJourneyStationById } from '@/domain/journey/graph';
import { JourneySnapshot, JourneyTripLogicView } from '@/domain/journey/types';
import { useTripStore } from '@/store/useTripStore';

type TripRuntimeStatus = 'IDLE' | 'WAITING' | 'TRANSIT' | 'ARRIVED';

export function buildJourneyTripLogicView(
    journeySnapshot: JourneySnapshot,
    tripStatus: TripRuntimeStatus = 'TRANSIT',
): JourneyTripLogicView {
    const displayStation = journeySnapshot.displayStationId
        ? getJourneyStationById(journeySnapshot.displayStationId)
        : null;
    const { visualPrev, visualNext, progressVisualNext } = getJourneyVisualNeighbors(journeySnapshot);
    const { stopsRemaining, stopsToTransfer, stopsAfterTransfer, nextLegLineId } = getJourneyStopsView(journeySnapshot);
    const activeEdge = journeySnapshot.route?.edges[journeySnapshot.activeEdgeIndex] ?? null;
    const transferEdge = activeEdge?.type === 'transfer'
        && tripStatus !== 'IDLE'
        && tripStatus !== 'ARRIVED'
        && journeySnapshot.phase !== 'ARRIVED'
        ? activeEdge
        : null;
    const transferFrom = transferEdge ? getJourneyStationById(transferEdge.fromStationId) : null;
    const transferTo = transferEdge ? getJourneyStationById(transferEdge.toStationId) : null;
    const transferTargetCoordinates = transferEdge
        ? transferEdge.targetCoordinates ?? (transferTo ? { latitude: transferTo.latitude, longitude: transferTo.longitude } : null)
        : null;
    const isTransferActive = Boolean(transferEdge && transferFrom && transferTo);

    return {
        phase: journeySnapshot.phase,
        statusCode: journeySnapshot.statusCode,
        statusText: getJourneyStatusText(journeySnapshot),
        displayStation,
        legProgress: journeySnapshot.legProgress,
        totalProgress: journeySnapshot.totalProgress,
        visualPrev,
        visualNext,
        progressVisualNext,
        stopsRemaining,
        distanceToNext: journeySnapshot.distanceToNextMeters,
        distanceToDest: journeySnapshot.distanceToDestMeters,
        stopsToTransfer,
        stopsAfterTransfer,
        nextLegLineId,
        gpsFallbackActive: journeySnapshot.gpsFallbackActive,
        isTransferActive,
        transferFrom,
        transferTo,
        transferEdge,
        transferTargetLineId: transferTo?.lineId ?? transferEdge?.toLineId ?? null,
        transferInstruction: transferEdge?.instruction ?? null,
        transferRouteDescription: transferEdge?.routeDescription ?? null,
        transferTargetCoordinates,
        transferDistanceMeters: transferEdge?.distanceMeters ?? null,
        transferTurnDirection: transferEdge?.turnDirection ?? null,
        estimatorMode: journeySnapshot.estimatorMode,
        estimatorConfidence: journeySnapshot.estimatorConfidence,
        uncertaintyMeters: journeySnapshot.uncertaintyMeters,
    };
}

export function useTripLogic() {
    const journeySnapshot = useTripStore((state) => state.journeySnapshot);
    const tripStatus = useTripStore((state) => state.status);

    return useMemo(() => {
        return buildJourneyTripLogicView(journeySnapshot, tripStatus);
    }, [journeySnapshot, tripStatus]);
}
