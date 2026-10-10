import './journey-smoke.mjs';
import assert from 'node:assert/strict';
import Module from 'node:module';

const require = Module.createRequire(import.meta.url);
const { getNetworkStations } = require('../src/domain/railway.ts');
const { buildJourneyRoute } = require('../src/domain/journey/routeBuilder.ts');
const { createJourneySnapshot, reduceJourneySnapshot, alignJourneySnapshotToLocation, getJourneyEntryDirection } = require('../src/domain/journey/engine.ts');
const { getJourneyRailEdgePath, projectLocationToJourneyEdge } = require('../src/domain/journey/geometry.ts');
const { getTrackGeometryPath } = require('../src/domain/predictions/trackGeometry.ts');
const { getPolylineLengthMeters, interpolatePolyline } = require('../src/domain/location/polyline.ts');
const { buildJourneyTripLogicView } = require('../src/hooks/useTripLogic.ts');
const { useTripStore } = require('../src/store/useTripStore.ts');
const { parseActiveTripCheckpoint } = require('../src/domain/offline/tripCheckpoint.ts');
const { getFareQuote, getFareQuoteForRoute } = require('../src/utils/fareNew.ts');
const { validateTrip } = require('../src/app/api/trips/validation.ts');
const stations = getNetworkStations('live', 'OFF', 'train');
const byId = Object.fromEntries(stations.map(station => [station.id, station]));
let timestamp = Date.parse('2026-10-09T04:00:00Z');
const fix = (snapshot, location, speedKph = 0, gpsAccuracy = 5) => reduceJourneySnapshot(snapshot, {
    type: 'LOCATION_SAMPLE', location, speedKph, gpsAccuracy, timestamp: timestamp += 4000, source: 'gps',
});
const point = (edge, fraction) => {
    const path = getJourneyRailEdgePath(edge, byId[edge.fromStationId], byId[edge.toStationId]);
    return interpolatePolyline(path, getPolylineLengthMeters(path) * fraction);
};
let routePairs = 0;
let quotes = 0;
let adjacentLegs = 0;
for (const from of stations) for (const to of stations) {
    const route = buildJourneyRoute(from, to);
    routePairs += 1;
    assert.ok(route, `${from.id}->${to.id}: route exists`);
    assert.equal(route.stationIds[0], from.id);
    assert.equal(route.stationIds.at(-1), to.id);
    assert.equal(route.edges.length, route.stationIds.length - 1);
    assert.equal(route.totalDistanceMeters, route.edges.reduce((sum, edge) => sum + edge.distanceMeters, 0));
    const direction = getJourneyEntryDirection(route);
    const history = validateTrip({ client_trip_id: `route-${from.id}-${to.id}`, origin_id: from.id, origin_name: from.name,
        destination_id: to.id, destination_name: to.name, line_id: from.lineId, destination_line_id: to.lineId,
        ticket_type: 'SJT', direction, fare: 0, distance_km: route.totalDistanceMeters / 1000,
        started_at: new Date(Date.now() - 60_000).toISOString(), completed_at: new Date().toISOString() },
    '11111111-1111-4111-8111-111111111111', null);
    assert.equal(history.ok, true, `${from.id}->${to.id}: completed-history contract accepts the origin-line direction`);
    for (const ticket of ['SJT', 'SVC', 'CONCESSION']) {
        const quote = getFareQuote(from, to, ticket, timestamp);
        quotes += 1;
        assert.ok(Number.isFinite(quote.total) && quote.total >= 0);
        assert.equal(quote.total, quote.segments.reduce((sum, segment) => sum + segment.amount, 0));
    }
    if (from.lineId !== to.lineId || Math.abs(from.order - to.order) !== 1) continue;
    adjacentLegs += 1;
    assert.ok(getTrackGeometryPath(from.lineId, from, to), `${from.id}->${to.id}: real rail geometry is required, not a fallback chord`);
    let snapshot = createJourneySnapshot(route);
    snapshot = fix(snapshot, from);
    assert.equal(snapshot.statusCode, 'AT_STATION', `${from.id}->${to.id}: catalog origin dwells`);
    assert.ok(snapshot.lastTrustedFixAt);
    snapshot = fix(snapshot, point(route.edges[0], 0.6), 35);
    snapshot = fix(snapshot, to);
    assert.notEqual(snapshot.phase, 'ARRIVED', 'one fix cannot confirm final arrival');
    snapshot = fix(snapshot, to);
    assert.equal(snapshot.phase, 'ARRIVED', `${from.id}->${to.id}: catalog target arrives`);
    assert.equal(snapshot.totalProgress, 100);
    assert.ok(snapshot.completedAt);
    assert.equal(snapshot.completedDistanceMeters, route.totalDistanceMeters);
}
assert.equal(adjacentLegs, 96);
assert.equal(routePairs, 2601);
assert.equal(quotes, 7803);
const reversingQuote = getFareQuoteForRoute([byId['L1-25'], byId['L1-24'], byId['L1-25']], 'SJT', timestamp);
assert.equal(reversingQuote.segments[0].verification, 'unverified', 'a real same-line return journey cannot be represented as a verified free fare');
assert.match(reversingQuote.segments[0].verificationNote, /operator/);

const jitterRoute = buildJourneyRoute(byId['L1-20'], byId['L1-19']);
let jitter = fix(createJourneySnapshot(jitterRoute), byId['L1-20']);
const jitterPath = getJourneyRailEdgePath(jitterRoute.edges[0], byId['L1-20'], byId['L1-19']);
const jitterLength = getPolylineLengthMeters(jitterPath);
const approachBoundary = jitterLength - Math.max(450, jitterLength * .28);
for (const offset of [20, -20, 20, -20]) {
    jitter = fix(jitter, interpolatePolyline(jitterPath, approachBoundary + offset), 30, 20);
    assert.equal(jitter.statusCode, 'APPROACHING_STATION', 'accepted GPS jitter cannot undo the approach latch');
}
jitter = fix(jitter, byId['L1-20'], 0, 5);
jitter = fix(jitter, byId['L1-20'], 0, 5);
assert.equal(jitter.statusCode, 'AT_STATION', 'confirmed accurate stopping can recover even a latched approach');

const walkRoute = buildJourneyRoute(byId['L1-02'], byId['M3-13']);
let walk = createJourneySnapshot(walkRoute);
assert.equal(walkRoute.edges[0].type, 'transfer');
const walkProgress = walk.totalProgress;
const walkTrustedAt = walk.lastTrustedFixAt;
const remoteWalkFix = { latitude: byId['M3-13'].latitude + .017, longitude: byId['M3-13'].longitude };
walk = fix(walk, remoteWalkFix, 0, 5);
assert.equal(walk.estimatorMode, 'UNCERTAIN', 'accuracy alone does not validate an off-corridor transfer fix');
assert.equal(walk.legProgress, 0);
assert.equal(walk.totalProgress, walkProgress);
assert.equal(walk.lastTrustedFixAt, walkTrustedAt);
walk = fix(walk, byId['L1-02'], 0, 5);
assert.ok(walk.legProgress < 10, 'returning to the transfer origin is not poisoned by an off-corridor fix');

const replayPairs = [['L1-25', 'L1-01'], ['L1-01', 'L1-25'], ['L1-25', 'L1-20'], ['L1-20', 'L1-25'], ['L2-01', 'L2-13'], ['L2-13', 'L2-01'],
    ['M3-01', 'M3-13'], ['M3-13', 'M3-01'], ['L1-25', 'L2-13'], ['L2-13', 'L1-25'],
    ['L1-25', 'M3-01'], ['M3-01', 'L1-25'], ['M3-13', 'L2-13'], ['L2-13', 'M3-13']];
for (const [from, to] of replayPairs) {
    const route = buildJourneyRoute(byId[from], byId[to]);
    let snapshot = createJourneySnapshot(route);
    let totalProgress = 0;
    for (const edge of route.edges) {
        if (edge.type === 'transfer') {
            const poor = fix(snapshot, edge.targetCoordinates ?? byId[edge.toStationId], 0, 500);
            assert.equal(poor.activeEdgeIndex, snapshot.activeEdgeIndex);
            assert.equal(poor.legProgress, snapshot.legProgress, 'poor transfer accuracy cannot poison progress');
            snapshot = fix(poor, edge.targetCoordinates ?? byId[edge.toStationId]);
            assert.equal(snapshot.phase, 'TRANSFER_WALK');
            assert.ok(snapshot.legProgress < 100);
            const manual = reduceJourneySnapshot(snapshot, { type: 'CONFIRM_TRANSFER', edgeId: edge.id, timestamp: snapshot.lastSampleAt + 1 });
            assert.equal(manual.currentStationId, edge.toStationId, 'manual confirmation cannot jump beyond the current walking target');
            assert.equal(manual.lastTrustedFixAt, snapshot.lastTrustedFixAt, 'manual confirmation never fabricates a GPS observation');
            assert.equal(reduceJourneySnapshot(snapshot, { type: 'CONFIRM_TRANSFER', edgeId: 'obsolete-edge', timestamp: snapshot.lastSampleAt + 1 }), snapshot);
            assert.equal(reduceJourneySnapshot(snapshot, { type: 'CONFIRM_TRANSFER', edgeId: edge.id, timestamp: NaN }), snapshot);
            const afterLongGap = reduceJourneySnapshot(snapshot, { type: 'LOCATION_SAMPLE', location: edge.targetCoordinates ?? byId[edge.toStationId],
                speedKph: 0, gpsAccuracy: 5, timestamp: snapshot.lastSampleAt + 30000, source: 'gps' });
            assert.equal(afterLongGap.phase, 'TRANSFER_WALK', 'confirmations separated by signal loss cannot complete a transfer');
            assert.equal(afterLongGap.stationCandidateSamples, 1);
            snapshot = fix(snapshot, edge.targetCoordinates ?? byId[edge.toStationId]);
        } else {
            snapshot = fix(snapshot, byId[edge.fromStationId]);
            for (const fraction of [0.15, 0.4, 0.7, 0.9]) {
                snapshot = fix(snapshot, point(edge, fraction), 36);
                assert.ok(snapshot.totalProgress >= totalProgress - 0.001, `${edge.id}: whole-trip progress never rewinds`);
                totalProgress = snapshot.totalProgress;
                const view = buildJourneyTripLogicView(snapshot);
                assert.ok(view.railLegProgress >= 0 && view.railLegProgress <= 100);
            }
            snapshot = fix(snapshot, byId[edge.toStationId]);
            snapshot = fix(snapshot, byId[edge.toStationId]);
            if (snapshot.phase !== 'ARRIVED' && route.edges[snapshot.activeEdgeIndex]?.type === 'rail'
                && snapshot.route.totalTransferCount > 0 && edge.lineId === route.edges[snapshot.activeEdgeIndex].lineId) {
                assert.ok(buildJourneyTripLogicView(snapshot).railLegProgress > 0, 'NAV rail-leg progress remains filled across intermediate stops');
            }
        }
    }
    assert.equal(snapshot.phase, 'ARRIVED', `${from}->${to}: full real-coordinate replay`);
    assert.equal(snapshot.currentStationId, to);
    assert.equal(snapshot.totalProgress, 100);
}

const route = buildJourneyRoute(byId['L1-25'], byId['L1-17']);
let snapshot = createJourneySnapshot(route);
snapshot = fix(snapshot, byId['L1-25']);
const dwelling = reduceJourneySnapshot(snapshot, { type: 'TICK', timestamp: snapshot.lastSampleAt + 16000 });
assert.equal(dwelling.phase, 'WAITING_AT_ORIGIN', 'GPS loss while stopped cannot invent an onboard movement phase');
assert.equal(dwelling.statusCode, 'AT_STATION');
assert.equal(dwelling.estimatedSpeedKph, 0);
snapshot = fix(snapshot, point(route.edges[0], 0.15), 15);
assert.equal(snapshot.statusCode, 'LEAVING_STATION');
snapshot = fix(snapshot, byId['L1-25']);
snapshot = fix(snapshot, byId['L1-25']);
assert.equal(snapshot.statusCode, 'AT_STATION', 'accurate stops recover false departure');
assert.equal(snapshot.hasDepartedOrigin, false);
snapshot = fix(snapshot, point(route.edges[0], 0.5), 40);
const before = snapshot;
assert.equal(reduceJourneySnapshot(snapshot, { type: 'LOCATION_SAMPLE', location: byId['L1-25'], speedKph: 0,
    gpsAccuracy: 5, timestamp: snapshot.lastSampleAt - 1 }), snapshot, 'old sensor fixes are ignored');
assert.equal(alignJourneySnapshotToLocation(snapshot, byId['L1-25'], 0, 5, snapshot.lastSampleAt - 1), snapshot);
assert.equal(reduceJourneySnapshot(snapshot, { type: 'LOCATION_SAMPLE', location: byId['L1-25'], speedKph: 0,
    gpsAccuracy: 5, timestamp: snapshot.lastSampleAt + 1, source: 'fallback' }), snapshot, 'estimated locations never feed the reducer as GPS');
for (let offset = 8000; offset <= 90000; offset += 1000) {
    snapshot = reduceJourneySnapshot(snapshot, { type: 'TICK', timestamp: before.lastSampleAt + offset });
    assert.equal(snapshot.activeEdgeIndex, before.activeEdgeIndex, 'tunnel estimates never confirm a station');
    assert.equal(snapshot.legProgressHighWater, before.legProgressHighWater, 'estimates cannot raise trusted GPS floor');
}
assert.equal(snapshot.estimatorMode, 'UNCERTAIN');
assert.equal(snapshot.estimatedSpeedKph, 0);
useTripStore.getState().reset();
useTripStore.getState().setAuthenticatedUserId('11111111-1111-4111-8111-111111111111');
useTripStore.getState().setOrigin(byId['L1-25']);
useTripStore.getState().setDestination(byId['L1-17']);
assert.equal(useTripStore.getState().status, 'IDLE');
assert.equal(useTripStore.getState().journeySnapshot.tripId, null, 'route previews cannot notify or acquire an active trip identity');
assert.equal(useTripStore.getState().tripStartedAt, null);
useTripStore.getState().setTicketType('SJT');
useTripStore.getState().beginTrip();
useTripStore.getState().syncJourneySnapshot({ ...before, tripId: useTripStore.getState().journeySnapshot.tripId,
    startedAt: useTripStore.getState().journeySnapshot.startedAt });
const active = useTripStore.getState().journeySnapshot;
useTripStore.getState().setOrigin(byId['L1-24']);
assert.equal(useTripStore.getState().origin.id, 'L1-25', 'legacy origin selection cannot restart an active trip');
useTripStore.getState().updateOriginKeepTrip(byId['L1-24']);
assert.equal(useTripStore.getState().origin.id, 'L1-25', 'remaining-route amendments retain the original boarding station');
assert.equal(useTripStore.getState().journeySnapshot.tripId, active.tripId);
const afterOriginCorrection = useTripStore.getState().journeySnapshot;
useTripStore.getState().beginTrip();
assert.equal(useTripStore.getState().journeySnapshot, afterOriginCorrection, 'begin is idempotent while active');
useTripStore.getState().amendTrip({ destination: byId['L1-20'] });
let amended = useTripStore.getState().journeySnapshot;
assert.equal(amended.tripId, active.tripId);
assert.equal(amended.startedAt, active.startedAt);
assert.equal(amended.activeEdgeIndex, active.activeEdgeIndex);
assert.equal(amended.completedDistanceMeters, active.completedDistanceMeters);
assert.ok(amended.totalProgress < active.totalProgress, 'longer remainder may reduce percentage without erasing traveled distance');
useTripStore.getState().amendTrip({ ticketType: 'SVC' });
assert.equal(useTripStore.getState().journeySnapshot, amended, 'fare edits leave the trip engine untouched');
useTripStore.getState().setAuthenticatedUserId('22222222-2222-4222-8222-222222222222');
assert.equal(useTripStore.getState().tripOwnerId, '11111111-1111-4111-8111-111111111111');
useTripStore.getState().amendTrip({ destination: byId['L1-25'] });
amended = useTripStore.getState().journeySnapshot;
assert.deepEqual(amended.route.stationIds.slice(0, 3), ['L1-25', 'L1-24', 'L1-25'], 'rerouting keeps the active edge and supports revisiting stations');
const checkpoint = { version: 2, ownerId: useTripStore.getState().tripOwnerId, savedAt: Math.max(Date.now(), timestamp, amended.startedAt),
    tripStartedAt: amended.startedAt, originId: 'L1-25', destinationId: 'L1-25', transitMode: 'train', selectedLine: 'LRT1',
    ticketType: 'SVC', line7Mode: 'OFF', isDevMode: false, runningFare: 0, journeySnapshot: amended };
const parsed = parseActiveTripCheckpoint(checkpoint);
assert.ok(parsed, 'amended routes can recover even when they revisit stations');
for (const key of ['legProgress', 'totalProgress', 'estimatedSpeedKph', 'lastSampleAt', 'uncertaintyMeters']) {
    assert.equal(parseActiveTripCheckpoint({ ...checkpoint, journeySnapshot: { ...amended, [key]: NaN } }), null, `${key}: invalid recovery rejected`);
}
const forged = structuredClone(checkpoint);
forged.journeySnapshot.route.edges[0].distanceMeters = 999999;
assert.notEqual(parseActiveTripCheckpoint(forged).journeySnapshot.route.edges[0].distanceMeters, 999999, 'recovery discards forged edge payloads');
assert.equal(parseActiveTripCheckpoint({ ...checkpoint, journeySnapshot: { ...amended, phase: 'TRANSFER_WALK' } }), null);
assert.equal(parseActiveTripCheckpoint({ ...checkpoint, journeySnapshot: { ...amended, statusLock: null } }), null);
useTripStore.getState().retainCompletedTrip({ client_trip_id: amended.tripId, completed_at: new Date().toISOString() });
useTripStore.getState().setHistorySaveFailure('Storage is full.');
useTripStore.getState().reset();
assert.ok(useTripStore.getState().pendingCompletedTrip, 'failed completed-history storage blocks receipt destruction');
assert.equal(useTripStore.getState().historySaveState, 'failed');
useTripStore.getState().discardCompletedTrip();
useTripStore.getState().reset();
useTripStore.getState().setOrigin(byId['L1-25']);
useTripStore.getState().setDestination(byId['L1-17']);
useTripStore.getState().setPendingTripRecovery(parsed);
const recoveryPreview = useTripStore.getState().journeySnapshot;
useTripStore.getState().beginTrip();
assert.equal(useTripStore.getState().journeySnapshot, recoveryPreview, 'new begin cannot overwrite an unresolved saved journey');
assert.equal(useTripStore.getState().status, 'IDLE');
useTripStore.getState().reset();
assert.equal(useTripStore.getState().pendingTripRecovery, parsed, 'generic reset is not an explicit recovery discard');
useTripStore.getState().discardPendingTrip();
useTripStore.getState().beginTrip();
assert.equal(useTripStore.getState().status, 'WAITING', 'explicit recovery discard allows a new journey');
assert.notEqual(useTripStore.getState().journeySnapshot.tripId, parsed.journeySnapshot.tripId);
useTripStore.getState().reset();
useTripStore.getState().setOrigin(byId['L1-25']);
useTripStore.getState().setDestination(byId['L1-25']);
useTripStore.getState().beginTrip();
assert.equal(useTripStore.getState().status, 'IDLE', 'zero-distance selection never becomes a phantom WAITING trip');
assert.equal(useTripStore.getState().journeySnapshot.tripId, null);
useTripStore.getState().reset();
useTripStore.getState().setAuthenticatedUserId(null);
console.log(`Reliability checks passed: ${adjacentLegs} directed legs, ${routePairs} route combinations, ${quotes} fare quotes, ${replayPairs.length} full trips, GPS/recovery/edit regressions.`);
