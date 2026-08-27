import { Coordinates, Direction, LineId, LineKind, Station, TransitMode } from '@/types';

export type TransferTurnDirection = 'RIGHT' | 'LEFT' | 'STRAIGHT' | 'UP' | 'DOWN';

export type JourneyPhase =
    | 'IDLE'
    | 'WAITING_AT_ORIGIN'
    | 'ONBOARD_DWELL'
    | 'ONBOARD_MOVING'
    | 'TRANSFER_WALK'
    | 'TRANSFER_WAIT'
    | 'ARRIVED';

export type JourneyEstimatorMode =
    | 'LIVE'
    | 'COASTING'
    | 'DEAD_RECKONING'
    | 'STATION_DWELL'
    | 'RECOVERING'
    | 'UNCERTAIN';

export type JourneyEstimatorConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type JourneyStatusCode =
    | 'WAITING_FOR_GPS'
    | 'AT_STATION'
    | 'LEAVING_STATION'
    | 'BETWEEN_STATIONS'
    | 'APPROACHING_STATION'
    | 'TRANSFER_ACTIVE'
    | 'ARRIVED';

export interface JourneyRailEdge {
    id: string;
    type: 'rail';
    fromStationId: string;
    toStationId: string;
    lineId: LineId;
    lineKind?: LineKind;
    distanceMeters: number;
    travelTimeSec: number;
}

export interface JourneyTransferEdge {
    id: string;
    type: 'transfer';
    fromStationId: string;
    toStationId: string;
    fromLineId: LineId;
    toLineId: LineId;
    distanceMeters: number;
    travelTimeSec: number;
    instruction: string;
    routeDescription: string;
    turnDirection: TransferTurnDirection;
    targetCoordinates?: Coordinates;
    completionRadiusMeters: number;
}

export type JourneyEdge = JourneyRailEdge | JourneyTransferEdge;

export interface JourneyRoute {
    originId: string;
    destinationId: string;
    stationIds: string[];
    edges: JourneyEdge[];
    totalDistanceMeters: number;
    totalTransferCount: number;
    operationalMode: 'live' | 'sandbox';
    transitMode?: TransitMode;
}

export interface JourneyGraph {
    adjacency: Record<string, JourneyEdge[]>;
}

export interface JourneySnapshot {
    phase: JourneyPhase;
    statusCode: JourneyStatusCode;
    route: JourneyRoute | null;
    activeEdgeIndex: number;
    currentStationId: string | null;
    nextStationId: string | null;
    displayStationId: string | null;
    direction: Direction | null;
    legProgress: number;
    totalProgress: number;
    distanceToNextMeters: number | null;
    distanceToDestMeters: number | null;
    walkingDistanceMeters: number | null;
    gpsFallbackActive: boolean;
    hasDepartedOrigin: boolean;
    hasDwelt: boolean;
    statusLock: 0 | 1 | 2 | 3;
    legProgressHighWater: number;
    visualOriginStationId: string | null;
    visualTargetStationId: string | null;
    lastLocation: Coordinates | null;
    estimatorMode: JourneyEstimatorMode;
    estimatorConfidence: JourneyEstimatorConfidence;
    lastSampleAt: number | null;
    lastTrustedFixAt: number | null;
    lastEstimatorUpdateAt: number | null;
    projectedDistanceMeters: number | null;
    projectedPathLengthMeters: number | null;
    estimatedSpeedKph: number;
    uncertaintyMeters: number;
    stationCandidateId: string | null;
    stationCandidateSince: number | null;
    stationCandidateSamples: number;
    zeroSpeedSince: number | null;
    recoveryStartedAt: number | null;
    estimatedLocation: Coordinates | null;
}

export type JourneyInput =
    | { type: 'START_TRIP'; route: JourneyRoute | null }
    | { type: 'END_TRIP' }
    | { type: 'SET_FALLBACK_ACTIVE'; active: boolean }
    | { type: 'SYNC_ROUTE'; route: JourneyRoute | null; anchorStationId?: string | null; preserveDeparture?: boolean }
    | { type: 'SNAP_TO_STATION'; stationId: string }
    | {
        type: 'LOCATION_SAMPLE';
        location: Coordinates | null;
        speedKph: number | null;
        gpsAccuracy: number | null;
        timestamp?: number | null;
        source?: 'gps' | 'simulation' | 'fallback';
    }
    | { type: 'TICK'; timestamp: number };

export interface JourneyTripLogicView {
    phase: JourneyPhase;
    statusCode: JourneyStatusCode;
    statusText: string;
    displayStation: Station | null;
    legProgress: number;
    totalProgress: number;
    visualPrev: Station | null;
    visualNext: Station | null;
    progressVisualNext: Station | null;
    stopsRemaining: number | null;
    distanceToNext: number | null;
    distanceToDest: number | null;
    stopsToTransfer: number | null;
    stopsAfterTransfer: number | null;
    nextLegLineId: string | null;
    gpsFallbackActive: boolean;
    isTransferActive: boolean;
    transferFrom: Station | null;
    transferTo: Station | null;
    transferEdge: JourneyTransferEdge | null;
    transferTargetLineId: LineId | null;
    transferInstruction: string | null;
    transferRouteDescription: string | null;
    transferTargetCoordinates: Coordinates | null;
    transferDistanceMeters: number | null;
    transferTurnDirection: TransferTurnDirection | null;
    estimatorMode: JourneyEstimatorMode;
    estimatorConfidence: JourneyEstimatorConfidence;
    uncertaintyMeters: number;
}
