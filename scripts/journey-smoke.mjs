import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import ts from 'typescript';

const cwd = process.cwd();
const originalResolve = Module._resolveFilename;

Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
    if (request === 'server-only') {
        return path.join(cwd, 'node_modules', 'next', 'dist', 'compiled', 'server-only', 'empty.js');
    }
    if (request.startsWith('@/')) {
        return originalResolve.call(this, path.join(cwd, 'src', request.slice(2)), parent, isMain, options);
    }
    return originalResolve.call(this, request, parent, isMain, options);
};

function transpileTypeScript(module, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
        compilerOptions: {
            esModuleInterop: true,
            jsx: ts.JsxEmit.React,
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText;

    module._compile(output, filename);
}

Module._extensions['.ts'] = transpileTypeScript;
Module._extensions['.tsx'] = transpileTypeScript;

const require = Module.createRequire(import.meta.url);
const { STATIONS } = require('../src/data/stations.ts');
const { buildJourneyRoute } = require('../src/domain/journey/routeBuilder.ts');
const { useTripStore } = require('../src/store/useTripStore.ts');
const {
    alignJourneySnapshotToLocation,
    createJourneySnapshot,
    reduceJourneySnapshot,
} = require('../src/domain/journey/engine.ts');
const { getJourneyRailEdgePath } = require('../src/domain/journey/geometry.ts');
const { getPolylineLengthMeters, interpolatePolyline } = require('../src/domain/location/polyline.ts');
const { buildJourneyTripLogicView } = require('../src/hooks/useTripLogic.ts');
const { getDistanceKm, moveTowards } = require('../src/utils/geo.ts');
const { getPrecisionFare } = require('../src/utils/fareNew.ts');
const { getEligibleSafetyReminder } = require('../src/domain/safety/reminders.ts');
const {
    getCheckpointDisposition,
    isActiveTripCheckpoint,
    isPersistedTripPreferences,
} = require('../src/domain/offline/tripCheckpoint.ts');
function station(id) {
    const found = STATIONS.find((candidate) => candidate.id === id);
    assert.ok(found, `Missing station ${id}`);
    return found;
}

function snapToTransferStation(route) {
    let snapshot = createJourneySnapshot(route);
    for (const stationId of route.stationIds.slice(1, -1)) {
        snapshot = reduceJourneySnapshot(snapshot, {
            type: 'SNAP_TO_STATION',
            stationId,
        });
    }
    return snapshot;
}

function sample(snapshot, location, speedKph = 0, options = {}) {
    return reduceJourneySnapshot(snapshot, {
        type: 'LOCATION_SAMPLE',
        location,
        speedKph,
        gpsAccuracy: options.gpsAccuracy ?? 5,
        timestamp: options.timestamp,
        source: options.source ?? 'gps',
    });
}

function edgePoint(route, edgeIndex, progress) {
    const edge = route.edges[edgeIndex];
    assert.equal(edge?.type, 'rail', `Expected rail edge ${edgeIndex}`);
    const path = getJourneyRailEdgePath(
        edge,
        station(edge.fromStationId),
        station(edge.toStationId),
    );
    const pathLengthMeters = getPolylineLengthMeters(path);
    const location = interpolatePolyline(path, pathLengthMeters * progress);
    assert.ok(location, 'Expected an interpolated edge location');
    return {
        location,
        pathLengthMeters,
    };
}

const lrt1ToMrt3 = buildJourneyRoute(station('L1-20'), station('M3-13'), 'sandbox', 'OFF');
assert.ok(lrt1ToMrt3, 'Expected LRT-1 to MRT-3 route');
assert.equal(lrt1ToMrt3.edges.at(-1).type, 'transfer');

let transferSnapshot = snapToTransferStation(lrt1ToMrt3);
let transferView = buildJourneyTripLogicView(transferSnapshot, 'TRANSIT');
assert.equal(transferView.phase, 'ONBOARD_DWELL');
assert.equal(transferView.statusCode, 'AT_STATION');
assert.equal(transferView.isTransferActive, true);
assert.equal(transferView.transferFrom?.id, 'L1-02');
assert.equal(transferView.transferTo?.id, 'M3-13');
assert.equal(transferView.transferTargetLineId, 'MRT3');
assert.ok(transferView.transferInstruction);
assert.ok(transferView.transferDistanceMeters > 0);

transferSnapshot = sample(transferSnapshot, {
    latitude: transferView.transferFrom.latitude,
    longitude: transferView.transferFrom.longitude,
});
transferView = buildJourneyTripLogicView(transferSnapshot, 'TRANSIT');
assert.equal(transferView.phase, 'TRANSFER_WALK');
assert.equal(transferView.statusCode, 'TRANSFER_ACTIVE');
assert.equal(transferView.isTransferActive, true);

const halfway = moveTowards(
    transferView.transferFrom,
    transferView.transferTargetCoordinates,
    0.06,
);
transferSnapshot = sample(transferSnapshot, halfway, 4.5);
transferView = buildJourneyTripLogicView(transferSnapshot, 'TRANSIT');
assert.equal(transferView.isTransferActive, true);
assert.notEqual(transferSnapshot.phase, 'ARRIVED');

transferSnapshot = sample(transferSnapshot, transferView.transferTargetCoordinates, 0);
transferView = buildJourneyTripLogicView(transferSnapshot, 'ARRIVED');
assert.equal(transferSnapshot.phase, 'ARRIVED');
assert.equal(transferSnapshot.currentStationId, 'M3-13');
assert.equal(transferView.isTransferActive, false);

const taftToLibertad = buildJourneyRoute(station('M3-13'), station('L1-03'), 'live', 'OFF');
assert.ok(taftToLibertad, 'Expected MRT-3 Taft to LRT-1 Libertad route');
assert.equal(taftToLibertad.edges[0].type, 'transfer');
assert.equal(taftToLibertad.edges[0].distanceMeters, 165);

let taftTransferSnapshot = createJourneySnapshot(taftToLibertad);
let taftTransferView = buildJourneyTripLogicView(taftTransferSnapshot, 'TRANSIT');
assert.equal(taftTransferView.isTransferActive, true);
assert.equal(taftTransferView.transferFrom?.id, 'M3-13');
assert.equal(taftTransferView.transferTo?.id, 'L1-02');
assert.equal(taftTransferView.transferDistanceMeters, 165);

taftTransferSnapshot = sample(taftTransferSnapshot, taftTransferView.transferTargetCoordinates, 0);
taftTransferView = buildJourneyTripLogicView(taftTransferSnapshot, 'WAITING');
assert.equal(taftTransferSnapshot.currentStationId, 'L1-02');
assert.equal(taftTransferSnapshot.nextStationId, 'L1-03');
assert.equal(taftTransferView.isTransferActive, false);
assert.notEqual(taftTransferSnapshot.statusCode, 'TRANSFER_ACTIVE');

function assertTransferHandoff({
    name,
    originId,
    destinationId,
    mode = 'live',
    line7Mode = 'OFF',
    transferFromId,
    transferToId,
}) {
    const route = buildJourneyRoute(station(originId), station(destinationId), mode, line7Mode);
    assert.ok(route, `${name}: expected route`);

    const edgeIndex = route.edges.findIndex(edge =>
        edge.type === 'transfer'
        && edge.fromStationId === transferFromId
        && edge.toStationId === transferToId
    );
    assert.notEqual(edgeIndex, -1, `${name}: expected transfer ${transferFromId} -> ${transferToId}`);

    const edge = route.edges[edgeIndex];
    const from = station(transferFromId);
    const to = station(transferToId);
    const target = edge.targetCoordinates ?? to;
    const targetToStationMeters = getDistanceKm(target, to) * 1000;

    assert.ok(edge.distanceMeters > 0, `${name}: transfer distance must be positive`);
    assert.ok(edge.completionRadiusMeters > 0, `${name}: completion radius must be positive`);
    assert.ok(targetToStationMeters <= 200, `${name}: transfer target must land inside destination station zone`);

    let snapshot = createJourneySnapshot(route);
    snapshot = reduceJourneySnapshot(snapshot, { type: 'SNAP_TO_STATION', stationId: transferFromId });
    let view = buildJourneyTripLogicView(snapshot, 'TRANSIT');
    assert.equal(view.isTransferActive, true, `${name}: NAV must be active at transfer start`);
    assert.equal(view.transferFrom?.id, transferFromId, `${name}: transfer source mismatch`);
    assert.equal(view.transferTo?.id, transferToId, `${name}: transfer target mismatch`);

    snapshot = sample(snapshot, from, 0);
    view = buildJourneyTripLogicView(snapshot, 'TRANSIT');
    assert.equal(view.isTransferActive, true, `${name}: NAV must remain active while walking`);
    assert.equal(snapshot.walkingDistanceMeters, edge.distanceMeters, `${name}: walking meter should start at path distance`);

    const halfway = moveTowards(from, target, getDistanceKm(from, target) / 2);
    snapshot = sample(snapshot, halfway, 4.5);
    view = buildJourneyTripLogicView(snapshot, 'TRANSIT');
    assert.equal(view.isTransferActive, true, `${name}: NAV must remain active before target`);
    assert.ok(
        snapshot.walkingDistanceMeters > 0 && snapshot.walkingDistanceMeters < edge.distanceMeters,
        `${name}: walking meter should decrement along path distance`,
    );

    const nearButNotArrived = moveTowards(target, from, 0.03);
    snapshot = sample(snapshot, nearButNotArrived, 4.5);
    view = buildJourneyTripLogicView(snapshot, 'TRANSIT');
    assert.equal(view.isTransferActive, true, `${name}: NAV must not complete 30m early`);
    assert.ok(
        snapshot.walkingDistanceMeters > 0 && snapshot.walkingDistanceMeters <= edge.distanceMeters,
        `${name}: walking meter must stay bounded before partner station`,
    );

    snapshot = sample(snapshot, target, 0);
    view = buildJourneyTripLogicView(snapshot, snapshot.phase === 'ARRIVED' ? 'ARRIVED' : 'WAITING');
    assert.equal(snapshot.currentStationId, transferToId, `${name}: cursor must move to partner station`);
    assert.equal(view.isTransferActive, false, `${name}: NAV must close after transfer completion`);
    assert.notEqual(snapshot.statusCode, 'TRANSFER_ACTIVE', `${name}: status must leave transfer active`);

    snapshot = sample(snapshot, target, 0);
    view = buildJourneyTripLogicView(snapshot, snapshot.phase === 'ARRIVED' ? 'ARRIVED' : 'WAITING');
    assert.equal(view.isTransferActive, false, `${name}: NAV must not reopen after handoff`);
}

[
    {
        name: 'LRT-1 EDSA to MRT-3 Taft',
        originId: 'L1-03',
        destinationId: 'M3-12',
        transferFromId: 'L1-02',
        transferToId: 'M3-13',
    },
    {
        name: 'MRT-3 Taft to LRT-1 EDSA',
        originId: 'M3-12',
        destinationId: 'L1-03',
        transferFromId: 'M3-13',
        transferToId: 'L1-02',
    },
    {
        name: 'LRT-1 Doroteo Jose to LRT-2 Recto',
        originId: 'L1-12',
        destinationId: 'L2-02',
        transferFromId: 'L1-11',
        transferToId: 'L2-01',
    },
    {
        name: 'LRT-2 Recto to LRT-1 Doroteo Jose',
        originId: 'L2-02',
        destinationId: 'L1-12',
        transferFromId: 'L2-01',
        transferToId: 'L1-11',
    },
    {
        name: 'LRT-2 Cubao to MRT-3 Cubao',
        originId: 'L2-07',
        destinationId: 'M3-05',
        transferFromId: 'L2-08',
        transferToId: 'M3-04',
    },
    {
        name: 'MRT-3 Cubao to LRT-2 Cubao',
        originId: 'M3-05',
        destinationId: 'L2-07',
        transferFromId: 'M3-04',
        transferToId: 'L2-08',
    },
    {
        name: 'Sandbox LRT-1 Roosevelt to MRT-7 Common',
        originId: 'L1-19',
        destinationId: 'M7-02',
        mode: 'sandbox',
        line7Mode: 'WITH_NA',
        transferFromId: 'L1-20',
        transferToId: 'M7-01',
    },
    {
        name: 'Sandbox MRT-7 Common to LRT-1 Roosevelt',
        originId: 'M7-02',
        destinationId: 'L1-19',
        mode: 'sandbox',
        line7Mode: 'WITH_NA',
        transferFromId: 'M7-01',
        transferToId: 'L1-20',
    },
    {
        name: 'Sandbox MRT-3 North Avenue to MRT-7 Common',
        originId: 'M3-02',
        destinationId: 'M7-02',
        mode: 'sandbox',
        line7Mode: 'WITH_NA',
        transferFromId: 'M3-01',
        transferToId: 'M7-01',
    },
    {
        name: 'Sandbox MRT-7 Common to MRT-3 North Avenue',
        originId: 'M7-02',
        destinationId: 'M3-02',
        mode: 'sandbox',
        line7Mode: 'WITH_NA',
        transferFromId: 'M7-01',
        transferToId: 'M3-01',
    },
].forEach(assertTransferHandoff);

const directLrt2 = buildJourneyRoute(station('L2-01'), station('L2-13'), 'live', 'OFF');
assert.ok(directLrt2, 'Expected direct LRT-2 route');
assert.equal(directLrt2.edges.some((edge) => edge.type === 'transfer'), false);
assert.equal(buildJourneyTripLogicView(createJourneySnapshot(directLrt2), 'WAITING').isTransferActive, false);

const liveMrt7 = buildJourneyRoute(station('L1-20'), station('M7-01'), 'live', 'WITH_NA');
assert.equal(liveMrt7, null);

const sandboxMrt7 = buildJourneyRoute(station('L1-20'), station('M7-01'), 'sandbox', 'WITH_NA');
assert.ok(sandboxMrt7, 'Expected sandbox MRT-7 route');
assert.ok(sandboxMrt7.stationIds.includes('M7-01'));

const estimatorRoute = buildJourneyRoute(station('L2-01'), station('L2-05'), 'live', 'OFF');
assert.ok(estimatorRoute, 'Expected a direct LRT-2 estimator route');
const estimatorNow = 1_800_000_000_000;
const firstEdgeMid = edgePoint(estimatorRoute, 0, 0.45);
const firstEdgeLater = edgePoint(estimatorRoute, 0, 0.62);
const firstEdgeArrival = edgePoint(estimatorRoute, 0, 0.995);

const liveEstimator = sample(
    createJourneySnapshot(estimatorRoute),
    firstEdgeMid.location,
    42,
    { timestamp: estimatorNow, gpsAccuracy: 8 },
);
assert.equal(liveEstimator.estimatorMode, 'LIVE');
assert.equal(liveEstimator.hasDepartedOrigin, true, 'route progress and speed confirm departure');
assert.ok(liveEstimator.projectedDistanceMeters > 75);

const poorFixEstimator = sample(
    liveEstimator,
    firstEdgeLater.location,
    42,
    { timestamp: estimatorNow + 1_000, gpsAccuracy: 250 },
);
assert.equal(poorFixEstimator.estimatorMode, 'UNCERTAIN', 'poor GPS is labeled uncertain');
assert.equal(
    poorFixEstimator.projectedDistanceMeters,
    liveEstimator.projectedDistanceMeters,
    'poor GPS cannot advance route progress',
);
assert.equal(poorFixEstimator.activeEdgeIndex, 0);

const firstStoppedSample = sample(
    liveEstimator,
    firstEdgeArrival.location,
    0,
    { timestamp: estimatorNow + 1_000, gpsAccuracy: 8 },
);
assert.equal(firstStoppedSample.currentStationId, 'L2-01', 'one stopped sample cannot dock the train');
assert.equal(firstStoppedSample.stationCandidateSamples, 1);
assert.equal(firstStoppedSample.estimatedSpeedKph, 0, 'native zero reaches the journey estimator immediately');

const secondStoppedSample = sample(
    firstStoppedSample,
    firstEdgeArrival.location,
    0,
    { timestamp: estimatorNow + 2_500, gpsAccuracy: 8 },
);
assert.equal(secondStoppedSample.currentStationId, 'L2-01', 'rail dwell still waits for elapsed confirmation');
const confirmedDwell = sample(
    secondStoppedSample,
    firstEdgeArrival.location,
    0,
    { timestamp: estimatorNow + 4_100, gpsAccuracy: 8 },
);
assert.equal(confirmedDwell.currentStationId, 'L2-02', 'multiple stopped samples over three seconds confirm arrival');
assert.equal(confirmedDwell.activeEdgeIndex, 1);
assert.equal(confirmedDwell.estimatorMode, 'STATION_DWELL');
assert.equal(confirmedDwell.estimatedSpeedKph, 0);
const continuedDwell = sample(
    confirmedDwell,
    station('L2-02'),
    0,
    { timestamp: estimatorNow + 5_100, gpsAccuracy: 8 },
);
assert.equal(continuedDwell.statusCode, 'AT_STATION', 'an intermediate stop remains in dwell while stationary');
assert.equal(buildJourneyTripLogicView(continuedDwell, 'TRANSIT').statusText, 'CURRENT STATION');
const recoveredSimulationDwell = sample(
    {
        ...continuedDwell,
        phase: 'ONBOARD_MOVING',
        statusCode: 'LEAVING_STATION',
        estimatorMode: 'LIVE',
    },
    station('L2-02'),
    0,
    { timestamp: estimatorNow + 5_600, gpsAccuracy: 5, source: 'simulation' },
);
assert.equal(recoveredSimulationDwell.statusCode, 'AT_STATION', 'a zero-speed simulator sample at the platform recovers a stale departure state');
assert.equal(buildJourneyTripLogicView(recoveredSimulationDwell, 'TRANSIT').statusText, 'CURRENT STATION');
const secondEdgeDeparture = sample(
    recoveredSimulationDwell,
    edgePoint(estimatorRoute, 1, 0.08).location,
    25,
    { timestamp: estimatorNow + 6_100, gpsAccuracy: 8 },
);
assert.equal(secondEdgeDeparture.statusCode, 'LEAVING_STATION', 'movement out of the dwell zone starts departure');
assert.equal(buildJourneyTripLogicView(secondEdgeDeparture, 'TRANSIT').statusText, 'NOW LEAVING');

const coastingEstimator = reduceJourneySnapshot(liveEstimator, {
    type: 'TICK',
    timestamp: estimatorNow + 8_001,
});
assert.equal(coastingEstimator.estimatorMode, 'COASTING', 'GPS silence enters coasting after eight seconds');
assert.equal(coastingEstimator.activeEdgeIndex, 0);

let deadReckoningEstimator = coastingEstimator;
for (let offset = 9_000; offset <= 16_000; offset += 1_000) {
    deadReckoningEstimator = reduceJourneySnapshot(deadReckoningEstimator, {
        type: 'TICK',
        timestamp: estimatorNow + offset,
    });
}
assert.equal(deadReckoningEstimator.estimatorMode, 'DEAD_RECKONING', 'bounded projection starts after fifteen seconds');
assert.ok(deadReckoningEstimator.projectedDistanceMeters > liveEstimator.projectedDistanceMeters);
assert.equal(deadReckoningEstimator.activeEdgeIndex, 0, 'dead reckoning cannot silently skip a station');

const stationCappedEstimator = reduceJourneySnapshot({
    ...liveEstimator,
    projectedDistanceMeters: firstEdgeMid.pathLengthMeters - 1,
    projectedPathLengthMeters: firstEdgeMid.pathLengthMeters,
    estimatedSpeedKph: 35,
    legProgress: 99,
    legProgressHighWater: 99,
    lastEstimatorUpdateAt: estimatorNow + 14_000,
}, {
    type: 'TICK',
    timestamp: estimatorNow + 16_000,
});
assert.equal(stationCappedEstimator.estimatorMode, 'STATION_DWELL', 'dead reckoning stops at the next platform');
assert.equal(stationCappedEstimator.currentStationId, 'L2-01', 'dead reckoning waits for recovered GPS before advancing the station cursor');
assert.equal(stationCappedEstimator.activeEdgeIndex, 0);

const staleEstimator = reduceJourneySnapshot(liveEstimator, {
    type: 'TICK',
    timestamp: estimatorNow + 90_001,
});
assert.equal(staleEstimator.estimatorMode, 'UNCERTAIN', 'long GPS loss stops projection after ninety seconds');
assert.equal(staleEstimator.estimatedSpeedKph, 0);

const thirdEdgeMid = edgePoint(estimatorRoute, 2, 0.5);
const skippedRecovery = alignJourneySnapshotToLocation(
    { ...liveEstimator, estimatorMode: 'UNCERTAIN' },
    thirdEdgeMid.location,
    40,
    8,
    estimatorNow + 20_000,
);
assert.equal(skippedRecovery.activeEdgeIndex, 0, 'GPS recovery cannot jump more than one station');
assert.equal(skippedRecovery.estimatorMode, 'UNCERTAIN');

const secondEdgeMid = edgePoint(estimatorRoute, 1, 0.5);
const oneEdgeRecovery = alignJourneySnapshotToLocation(
    { ...liveEstimator, estimatorMode: 'UNCERTAIN' },
    secondEdgeMid.location,
    40,
    8,
    estimatorNow + 20_000,
);
assert.equal(oneEdgeRecovery.currentStationId, 'L2-02', 'GPS recovery may reconcile one passed station');
assert.equal(oneEdgeRecovery.activeEdgeIndex, 1);
assert.equal(oneEdgeRecovery.estimatorMode, 'RECOVERING');
const checkpoint = {
    version: 1,
    savedAt: estimatorNow,
    tripStartedAt: estimatorNow - 60_000,
    originId: 'L2-01',
    destinationId: 'L2-05',
    transitMode: 'train',
    selectedLine: 'LRT2',
    ticketType: 'SVC',
    line7Mode: 'OFF',
    isDevMode: false,
    runningFare: 7.5,
    journeySnapshot: liveEstimator,
};
assert.equal(isActiveTripCheckpoint(checkpoint), true, 'valid active journey checkpoints pass strict validation');
assert.equal(getCheckpointDisposition(checkpoint, estimatorNow + 19 * 60_000), 'auto_resume');
assert.equal(getCheckpointDisposition({ ...checkpoint, isDevMode: true }, estimatorNow), 'expired', 'dev trips never survive a page reload');
assert.equal(getCheckpointDisposition(checkpoint, estimatorNow + 21 * 60_000), 'prompt');
assert.equal(getCheckpointDisposition(checkpoint, estimatorNow + 6 * 60 * 60_000 + 1), 'expired');
assert.equal(getCheckpointDisposition(checkpoint, estimatorNow - 10 * 60_000), 'expired', 'far-future checkpoints are rejected after clock changes');
assert.equal(
    isActiveTripCheckpoint({
        ...checkpoint,
        journeySnapshot: { ...liveEstimator, activeEdgeIndex: Number.POSITIVE_INFINITY },
    }),
    false,
    'corrupted journey cursors cannot poison trip recovery',
);
assert.equal(
    isActiveTripCheckpoint({ ...checkpoint, originId: 'L2-02' }),
    false,
    'checkpoint route identity must match the stored origin and destination',
);
const persistedPreferences = {
    version: 1,
    favorites: [{ originId: 'L2-01', destId: 'L2-05' }],
    isMuted: false,
    notificationPreference: 'all',
    themePreference: 'system',
    showRushHour: true,
    dataMode: 'auto',
};
assert.equal(isPersistedTripPreferences(persistedPreferences), true);
assert.equal(isPersistedTripPreferences({ ...persistedPreferences, isMuted: 'no' }), false, 'corrupted preferences are discarded');
const waitingReminderSnapshot = createJourneySnapshot(directLrt2);
const reminderNow = 1_800_000_000_000;
const reminderTripStartedAt = reminderNow - 46_000;
assert.equal(getEligibleSafetyReminder({
    status: 'WAITING',
    snapshot: waitingReminderSnapshot,
    hasOrigin: true,
    hasDestination: true,
    tripStartedAt: reminderTripStartedAt,
    now: reminderNow,
}), 'PRE_BOARD', 'pre-board reminder waits for a stable origin-station phase');

const movingReminderSnapshot = {
    ...waitingReminderSnapshot,
    phase: 'ONBOARD_MOVING',
    statusCode: 'BETWEEN_STATIONS',
    hasDepartedOrigin: true,
    legProgress: 12,
    projectedDistanceMeters: 150,
};
assert.equal(getEligibleSafetyReminder({
    status: 'TRANSIT',
    snapshot: movingReminderSnapshot,
    hasOrigin: true,
    hasDestination: true,
    tripStartedAt: reminderTripStartedAt,
    now: reminderNow,
}), 'IN_TRANSIT', 'in-transit reminder starts after meaningful movement');

assert.equal(getEligibleSafetyReminder({
    status: 'TRANSIT',
    snapshot: { ...movingReminderSnapshot, legProgress: 83 },
    hasOrigin: true,
    hasDestination: true,
    tripStartedAt: reminderTripStartedAt,
    now: reminderNow,
}), null, 'in-transit reminder does not interrupt the late approach window');

assert.equal(getEligibleSafetyReminder({
    status: 'TRANSIT',
    snapshot: { ...movingReminderSnapshot, statusCode: 'LEAVING_STATION' },
    hasOrigin: true,
    hasDestination: true,
    tripStartedAt: reminderTripStartedAt,
    now: reminderNow,
}), null, 'the two safety reminders cannot stack during departure');
const tripStore = useTripStore.getState();
tripStore.reset();
tripStore.setOrigin(station('L2-01'));
tripStore.setDestination(station('L2-05'));
tripStore.setTicketType('SJT');
tripStore.startTrip();
const stationBeforeInvalidSnap = useTripStore.getState().currentStation?.id;
const fareBeforeInvalidSnap = useTripStore.getState().runningFare;
useTripStore.getState().setCurrentStation(station('L1-01'));
assert.equal(
    useTripStore.getState().currentStation?.id,
    stationBeforeInvalidSnap,
    'legacy developer snaps cannot override the route-aware reducer with an off-route station',
);
assert.equal(
    useTripStore.getState().runningFare,
    fareBeforeInvalidSnap,
    'a rejected station snap cannot mutate the running fare',
);
useTripStore.getState().setCurrentStation(station('L2-02'));
assert.equal(useTripStore.getState().currentStation?.id, 'L2-02');
assert.equal(useTripStore.getState().journeySnapshot.displayStationId, 'L2-02');
assert.equal(
    useTripStore.getState().runningFare,
    getPrecisionFare(station('L2-01'), station('L2-02'), 'SJT'),
    'the compatibility fare is derived from the reducer-accepted station after a valid snap',
);
useTripStore.getState().reset();

console.log('Journey smoke checks passed');
