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
const {
    buildStationDwellSnapshot,
    clusterTrainPresence,
    deduplicateTrainPresenceByReporter,
    getTrainPresenceIdentity,
    getStationDwellSummary,
    getTrainFreshness,
    isPublicTrainPresence,
    isTrainPresenceExpired,
} = require('../src/domain/trainPresence.ts');
const { broadcastCrowdPresence } = require('../src/domain/crowd/broadcast.ts');
const { TRAIN_PRESENCE_CHANNEL, TRAIN_PRESENCE_EVENT } = require('../src/domain/crowd/constants.ts');
const { getDirectionBadgePlacements } = require('../src/utils/trainMarker.ts');
const { sanitizeCrowdPresencePayload } = require('../src/domain/crowd/presence.ts');
const { useTrainStore } = require('../src/store/useTrainStore.ts');

const now = 1_800_000_000_000;

function crowdTrain(overrides = {}) {
    return {
        id: 'CROWD-a',
        lineId: 'LRT1',
        direction: 'SOUTHBOUND',
        lat: 14.5388,
        lng: 121.0006,
        speedKph: 18,
        statusCode: 'APPROACHING_STATION',
        stationId: 'L1-02',
        stationName: 'EDSA',
        source: 'crowd',
        updatedAt: now,
        confidence: 0.72,
        ...overrides,
    };
}

const clustered = clusterTrainPresence([
    crowdTrain({ id: 'CROWD-a', deviceId: 'a', updatedAt: now - 500, confidence: 0.7 }),
    crowdTrain({ id: 'CROWD-b', deviceId: 'b', lat: 14.5389, lng: 121.0007, updatedAt: now - 1000, confidence: 0.8 }),
], now);

assert.equal(clustered.length, 1, 'same station, line, direction crowd signals should cluster');
assert.equal(clustered[0].source, 'crowd');
assert.equal(clustered[0].sourceCount, 2);
assert.deepEqual(clustered[0].memberIds, ['CROWD-a', 'CROWD-b']);
assert.equal(clustered[0].freshness, 'fresh');
assert.ok(clustered[0].confidence > 0.7, 'cluster confidence should improve with multiple signals');

const duplicateReporterInputs = [
    crowdTrain({ id: 'CROWD-LOCAL-device', deviceId: 'same-device-1234', updatedAt: now - 500 }),
    crowdTrain({ id: 'CROWD-server-hash', deviceId: 'same-device-1234', updatedAt: now }),
];
const duplicateReporterSignals = deduplicateTrainPresenceByReporter(duplicateReporterInputs);
assert.equal(duplicateReporterSignals.length, 1, 'local presence and its server echo must count as one reporter');
assert.equal(duplicateReporterSignals[0].id, 'CROWD-server-hash', 'newest echo wins without creating another signal');
assert.equal(
    getTrainPresenceIdentity(duplicateReporterInputs[0]),
    getTrainPresenceIdentity(duplicateReporterInputs[1]),
    'crowd identity is stable across client and server ids',
);
const duplicateReporterCluster = clusterTrainPresence(duplicateReporterInputs, now);
assert.equal(duplicateReporterCluster.length, 1, 'same-device echoes render as one train');
assert.equal(duplicateReporterCluster[0].sourceCount, 1, 'same-device echoes never inflate the signal badge');

const separateStations = clusterTrainPresence([
    crowdTrain({ id: 'CROWD-a', stationId: 'L1-02' }),
    crowdTrain({ id: 'CROWD-c', stationId: 'L1-03', stationName: 'Libertad' }),
], now);
assert.equal(separateStations.length, 2, 'different station anchors should not collapse into one train');

const separateDirections = clusterTrainPresence([
    crowdTrain({ id: 'CROWD-a', direction: 'SOUTHBOUND' }),
    crowdTrain({ id: 'CROWD-d', direction: 'NORTHBOUND' }),
], now);
assert.equal(separateDirections.length, 2, 'opposite directions should not cluster');

const lrt2BadgePlacements = getDirectionBadgePlacements(['WESTBOUND', 'EASTBOUND']);
const lrt2WestBadge = lrt2BadgePlacements.find((badge) => badge.direction === 'WESTBOUND');
const lrt2EastBadge = lrt2BadgePlacements.find((badge) => badge.direction === 'EASTBOUND');
assert.equal(lrt2WestBadge.anchor, 'top-right', 'LRT-2 westbound keeps the original upper circle placement');
assert.equal(lrt2WestBadge.rotationDegrees, -90, 'LRT-2 westbound arrow points left');
assert.equal(lrt2EastBadge.anchor, 'bottom-right', 'LRT-2 eastbound keeps the original lower circle placement');
assert.equal(lrt2EastBadge.rotationDegrees, 90, 'LRT-2 eastbound arrow points right');

const staleTrain = crowdTrain({ id: 'CROWD-stale', updatedAt: now - 35_000 });
const expiredTrain = crowdTrain({ id: 'CROWD-expired', updatedAt: now - 65_000 });
const staleCluster = clusterTrainPresence([staleTrain, expiredTrain], now);
assert.equal(staleCluster.length, 1, 'stale train should remain visible until expiry');
assert.equal(staleCluster[0].freshness, 'stale');
assert.equal(getTrainFreshness(staleTrain, now), 'stale');
assert.equal(isTrainPresenceExpired(expiredTrain, now), true);

const simulated = crowdTrain({
    id: 'SIM-LRT1-01',
    source: 'simulated',
    updatedAt: now - 5_000,
});
const mixed = clusterTrainPresence([simulated, crowdTrain({ id: 'CROWD-e' })], now);
assert.equal(mixed.length, 2, 'simulated trains should remain individual alongside crowd clusters');
assert.equal(mixed.find((train) => train.id === 'SIM-LRT1-01')?.sourceCount, 1);

const dwellSummary = getStationDwellSummary([
    crowdTrain({ id: 'CROWD-dwell-a', statusCode: 'AT_STATION', sourceCount: 2 }),
    crowdTrain({ id: 'CROWD-dwell-b', statusCode: 'AT_STATION', direction: 'NORTHBOUND', updatedAt: now - 35_000 }),
    crowdTrain({ id: 'CROWD-moving', statusCode: 'APPROACHING_STATION' }),
], 'L1-02', now);
assert.equal(dwellSummary.trainCount, 2, 'station dwell summary counts trains at station only');
assert.equal(dwellSummary.signalCount, 3, 'station dwell summary preserves source counts');
assert.deepEqual(dwellSummary.directions.sort(), ['NORTHBOUND', 'SOUTHBOUND']);
assert.equal(dwellSummary.hasFreshSignal, true);
assert.equal(dwellSummary.hasStaleSignal, true);

const simDwellSummary = getStationDwellSummary([
    crowdTrain({ id: 'SIM-SELF-RIDE', source: 'simulated', statusCode: 'AT_STATION', sourceCount: 1 }),
], 'L1-02', now);
assert.equal(simDwellSummary.trainCount, 1, 'simulated self dwell should feed station docked UI');

const movingPrediction = crowdTrain({
    id: 'PRED-LRT1-moving',
    source: 'predicted',
    statusCode: 'IN_TRANSIT',
    updatedAt: now,
});
const movedPrediction = {
    ...movingPrediction,
    lat: movingPrediction.lat + 0.001,
    lng: movingPrediction.lng + 0.001,
    updatedAt: now + 1_000,
};
assert.equal(
    buildStationDwellSnapshot([movingPrediction], now).signature,
    buildStationDwellSnapshot([movedPrediction], now + 1_000).signature,
    'moving prediction updates must not change the station dwell signature',
);

const predictedDwell = crowdTrain({
    id: 'PRED-LRT1-dwell',
    source: 'predicted',
    statusCode: 'AT_STATION',
    sourceCount: 1,
    updatedAt: now,
});
const dwellSnapshot = buildStationDwellSnapshot([predictedDwell], now);
assert.notEqual(dwellSnapshot.signature, '', 'AT_STATION trains should change the station dwell signature');
assert.equal(dwellSnapshot.byStation.get('L1-02')?.length, 1, 'station dwell snapshot should retain trains by station');
assert.notEqual(
    buildStationDwellSnapshot([movingPrediction], now).signature,
    dwellSnapshot.signature,
    'station dwell signature should change when a train enters AT_STATION',
);

useTrainStore.setState({
    rawTrains: [],
    trains: [],
    stationDwellSignature: '',
    stationDwellTrainsByStation: new Map(),
    crowdTrain: null,
    selfTrainPresence: null,
    lastPollTimestamp: 0,
    error: null,
});

const localSelfPresence = crowdTrain({
    id: 'CROWD-LOCAL-store',
    deviceId: 'store-device-1234',
    updatedAt: now - 500,
});
const remoteSelfEcho = crowdTrain({
    id: 'CROWD-server-store',
    deviceId: 'store-device-1234',
    updatedAt: now,
});
useTrainStore.getState().setCrowdTrain(localSelfPresence);
useTrainStore.getState().upsertTrain(remoteSelfEcho);
assert.equal(useTrainStore.getState().rawTrains.length, 1, 'store keeps one raw row for a local/server echo pair');
assert.equal(useTrainStore.getState().trains.length, 1, 'store exposes one rendered train for a local/server echo pair');
assert.equal(useTrainStore.getState().trains[0].sourceCount, 1, 'self echo does not increase crowd signal count');
useTrainStore.getState().setCrowdTrain(null);
useTrainStore.getState().setPredictedTrains([movingPrediction]);
const movingDwellMapRef = useTrainStore.getState().stationDwellTrainsByStation;
useTrainStore.getState().setPredictedTrains([movedPrediction]);
assert.equal(
    useTrainStore.getState().stationDwellTrainsByStation,
    movingDwellMapRef,
    'train store should preserve dwell map reference when only moving predictions update',
);
useTrainStore.getState().setPredictedTrains([predictedDwell]);
assert.notEqual(
    useTrainStore.getState().stationDwellTrainsByStation,
    movingDwellMapRef,
    'train store should replace dwell map reference when station dwell state changes',
);
useTrainStore.getState().setPredictedTrains([]);

const simulatedSelf = crowdTrain({
    id: 'SIM-SELF-RIDE',
    source: 'simulated',
    statusCode: 'IN_TRANSIT',
});
useTrainStore.getState().setSelfTrainPresence(simulatedSelf);
assert.equal(useTrainStore.getState().trains.some((train) => train.id === 'SIM-SELF-RIDE'), true, 'sim self presence should enter train store');

useTrainStore.getState().setCrowdTrain(null);
assert.equal(useTrainStore.getState().trains.some((train) => train.id === 'SIM-SELF-RIDE'), true, 'clearing crowd self should not clear sim self presence');

useTrainStore.getState().setTrains([]);
assert.equal(useTrainStore.getState().trains.some((train) => train.id === 'SIM-SELF-RIDE'), true, 'mock fleet sync should preserve sim self presence');

useTrainStore.getState().setSelfTrainPresence(null);
assert.equal(useTrainStore.getState().trains.some((train) => train.id === 'SIM-SELF-RIDE'), false, 'clearing sim self presence should remove it');

assert.equal(isPublicTrainPresence(crowdTrain({ lineId: 'MRT7' })), false, 'MRT-7 must stay out of live crowd presence');
assert.equal(isPublicTrainPresence(crowdTrain({ lineId: 'MRT3' })), true, 'built rail should remain public');

const sanitized = sanitizeCrowdPresencePayload({
    ...crowdTrain({ source: 'simulated', updatedAt: 1 }),
    deviceId: 'device-valid-1234',
}, now);
assert.equal(sanitized.ok, true, 'valid live crowd payload should be accepted');
assert.equal(sanitized.train?.source, 'crowd', 'server sanitizer must force crowd source');
assert.equal(sanitized.train?.sampleId, sanitized.sampleId, 'broadcast payload keeps the durable idempotency key');
assert.equal(sanitized.train?.updatedAt, now, 'server sanitizer owns crowd timestamps');
assert.equal(sanitized.train?.stationName, 'EDSA', 'server sanitizer should derive station names');
assert.ok(sanitized.train?.id.startsWith('CROWD-'), 'server sanitizer should generate anonymous crowd ids');

assert.equal(
    sanitizeCrowdPresencePayload({ ...crowdTrain({ lineId: 'MRT7' }), deviceId: 'device-valid-1234' }).ok,
    false,
    'crowd broadcast API must reject MRT-7 live signals',
);
assert.equal(
    sanitizeCrowdPresencePayload({ ...crowdTrain({ direction: 'EASTBOUND' }), deviceId: 'device-valid-1234' }).code,
    'invalid_direction',
    'crowd broadcast API must reject directions that do not belong to the line',
);
assert.equal(
    sanitizeCrowdPresencePayload({ ...crowdTrain({ lat: 0, lng: 0 }), deviceId: 'device-valid-1234' }).code,
    'invalid_location',
    'crowd broadcast API must reject impossible live rail locations',
);

const missingConfig = await broadcastCrowdPresence(sanitized.train, { env: {} });
assert.equal(missingConfig.status, 503, 'crowd broadcast should fail closed when Supabase is not configured');

const broadcastCalls = [];
const broadcastResult = await broadcastCrowdPresence(sanitized.train, {
    env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://traintracks.supabase.co/',
        SUPABASE_SERVICE_ROLE_KEY: 'service-secret',
    },
    fetchImpl: async (url, init) => {
        broadcastCalls.push({ url, init });
        return new Response('{}', { status: 202 });
    },
});
assert.equal(broadcastResult.ok, true, 'crowd broadcast should accept successful Supabase REST responses');
assert.equal(broadcastCalls.length, 1, 'crowd broadcast should send one REST request');
assert.equal(broadcastCalls[0].url, 'https://traintracks.supabase.co/realtime/v1/api/broadcast');
const broadcastBody = JSON.parse(broadcastCalls[0].init.body);
assert.equal(broadcastBody.messages[0].topic, TRAIN_PRESENCE_CHANNEL);
assert.equal(broadcastBody.messages[0].event, TRAIN_PRESENCE_EVENT);
assert.equal(broadcastBody.messages[0].payload.id, sanitized.train.id);
assert.equal(broadcastCalls[0].init.headers.apikey, 'service-secret');

console.log('Train presence smoke checks passed');
